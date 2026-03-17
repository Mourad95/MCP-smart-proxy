import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import fs from 'fs';
import path from 'path';
import { VectorMemory } from '../memory/vector-memory';
import { ContextOptimizer } from '../optimization/context-optimizer';
import { OptimizationStatsTool } from '../analytics/mcp-tool';
import { ReportExporter } from '../analytics/report-exporter';
import { DashboardAuth } from '../auth/dashboard-auth';
import { SemanticCache } from '../cache/semantic-cache';
import {
  ProxyConfig,
  MCPRequest,
  MCPResponse,
  MCPContext,
  MCPServerConfig,
  OptimizedContext,
  MCPTool
} from '../types/mcp-types';

/**
 * MCP Smart Proxy Server
 * 
 * Handles HTTP and WebSocket connections, routes requests to MCP servers,
 * and applies optimization to reduce context waste.
 */
export class ProxyServer {
  private app: express.Application;
  private httpServer: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private connectedClients: Map<WebSocket, { id: string }> = new Map();
  private serverConnections: Map<string, WebSocket> = new Map();
  
  private statsTool: OptimizationStatsTool;
  private reportExporter: ReportExporter;
  private dashboardAuth: DashboardAuth;
  private semanticCache: SemanticCache | null;

  constructor(
    private config: ProxyConfig,
    private vectorMemory: VectorMemory,
    private contextOptimizer: ContextOptimizer,
    statsDir?: string,
    semanticCache?: SemanticCache | null
  ) {
    this.semanticCache = semanticCache ?? null;
    this.app = express();
    this.httpServer = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.httpServer });
    this.statsTool = new OptimizationStatsTool(statsDir);
    this.reportExporter = new ReportExporter(this.statsTool.getStatsManager());
    this.dashboardAuth = new DashboardAuth();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }
  
  /**
   * Start the proxy server
   */
  async start(): Promise<void> {
    await this.vectorMemory.initialize();
    if (this.semanticCache) {
      await this.semanticCache.initialize();
    }

    // Connect to configured MCP servers
    await this.connectToServers();

    return new Promise<void>((resolve, reject) => {
      this.httpServer.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          const msg = `Port ${this.config.port} is already in use. Stop the other process (e.g. \`lsof -ti :${this.config.port} | xargs kill\`) or use another port (--port).`;
          reject(new Error(msg));
        } else {
          reject(err);
        }
      });
      this.httpServer.listen(this.config.port, () => {
        console.log(`🌐 Proxy server listening on port ${this.config.port}`);
        console.log(`🔌 Connected to ${this.serverConnections.size} MCP servers`);
        resolve();
      });
    });
  }
  
  /**
   * Stop the proxy server
   */
  async stop(): Promise<void> {
    // Close all WebSocket connections
    this.connectedClients.forEach((_, client) => {
      client.close();
    });
    
    this.serverConnections.forEach((connection, serverName) => {
      connection.close();
      console.log(`🔌 Disconnected from server: ${serverName}`);
    });
    
    this.wss.close();
    this.httpServer.close();
    
    console.log('🛑 Proxy server stopped');
  }
  
  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Security headers
    this.app.use(helmet());
    
    // CORS
    this.app.use(cors());
    
    // Logging
    const logFormat = this.config.logging.format === 'json' ? 'combined' : 'dev';
    this.app.use(morgan(logFormat));
    
    // JSON parsing
    this.app.use(express.json());
  }
  
  /**
   * Setup Express routes
   */
  private setupRoutes(): void {
    // Health check (public)
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        servers: this.config.mcpServers.length,
        connected: this.serverConnections.size,
        optimization: this.config.optimization.enabled,
        dashboardAuth: this.dashboardAuth.isAuthRequired()
      });
    });

    // Context optimization: public endpoint (POST only, used by test-proxy.js and API clients)
    this.app.get('/optimize', (_req, res) => {
      res.setHeader('Allow', 'POST');
      res.status(405).json({
        error: { code: 405, message: 'Method Not Allowed. Use POST with body: { query?: string, tools: Array<{ name, description?, server? }> }' }
      });
    });

    this.app.post('/optimize', async (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const { tools, query = '' } = body;

        if (!tools || !Array.isArray(tools)) {
          res.status(400).json({
            error: {
              code: 400,
              message: 'Invalid request: tools array is required'
            }
          });
          return;
        }

        // Convert tools to MCPContext format
        const mcpTools: MCPTool[] = tools.map((tool: any) => ({
          name: tool.name,
          description: tool.description || '',
          inputSchema: tool.inputSchema || { type: 'object', properties: {} },
          server: tool.server || 'unknown'
        }));

        const context: MCPContext = {
          tools: mcpTools
        };

        // Get server list for optimization
        const servers = this.config.mcpServers.map(server => ({
          name: server.name,
          url: server.url
        }));

        // Optimize context (implementation in context-optimizer.ts)
        const optimizedContext = await this.contextOptimizer.optimizeContext(
          query,
          context,
          servers
        );

        res.json({
          originalToolCount: context.tools.length,
          optimizedToolCount: optimizedContext.tools.length,
          tokensSaved: optimizedContext.metadata.tokensSaved,
          savingsPercent: optimizedContext.metadata.savingsPercent,
          tools: optimizedContext.tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            server: tool.server
          }))
        });
      } catch (error) {
        console.error('Optimization failed:', error);
        res.status(500).json({
          error: {
            code: 500,
            message: 'Internal server error',
            data: error instanceof Error ? error.message : String(error)
          }
        });
      }
    });
    
    // Authentication routes (public)
    const authRouter = this.dashboardAuth.createMiddleware();
    this.app.use(authRouter);
    
    // Global API authentication middleware
    const apiAuthMiddleware = this.dashboardAuth.createBasicAuthMiddleware();
    
    // Apply auth middleware to all API routes
    this.app.use('/api', apiAuthMiddleware);
    
    // Prometheus metrics (semantic cache counters)
    this.app.get(
      '/metrics/prometheus',
      this.dashboardAuth.createBasicAuthMiddleware(),
      async (_req, res) => {
        res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        const lines: string[] = [];
        if (this.semanticCache) {
          const st = this.semanticCache.getStats();
          lines.push('# HELP mcp_semantic_cache_hits_total Total semantic cache hits.');
          lines.push('# TYPE mcp_semantic_cache_hits_total counter');
          lines.push(`mcp_semantic_cache_hits_total ${st.hits}`);
          lines.push('# HELP mcp_semantic_cache_misses_total Total semantic cache misses.');
          lines.push('# TYPE mcp_semantic_cache_misses_total counter');
          lines.push(`mcp_semantic_cache_misses_total ${st.misses}`);
          lines.push('# HELP mcp_semantic_cache_entries Number of entries in semantic cache.');
          lines.push('# TYPE mcp_semantic_cache_entries gauge');
          lines.push(`mcp_semantic_cache_entries ${await this.semanticCache.getSize()}`);
        }
        res.send(lines.join('\n') + '\n');
      }
    );

    // Metrics endpoint (protected if auth required)
    this.app.get('/metrics', this.dashboardAuth.createBasicAuthMiddleware(), async (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      const metrics = this.contextOptimizer.getMetrics();
      const cacheStats = this.contextOptimizer.getCacheStats();
      const semanticCacheStats = this.semanticCache
        ? {
            ...this.semanticCache.getStats(),
            size: await this.semanticCache.getSize()
          }
        : null;
      res.json({
        optimization: {
          totalRequests: metrics.length,
          averageSavings: metrics.length > 0
            ? metrics.reduce((sum, m) => sum + m.savingsPercent, 0) / metrics.length
            : 0,
          cache: cacheStats,
          semanticCache: semanticCacheStats
        },
        servers: {
          configured: this.config.mcpServers.length,
          connected: this.serverConnections.size
        },
        recentRequests: metrics.slice(-10)
      });
    });

    // Detailed stats for dashboard (hourly breakdown, top tools)
    this.app.get('/api/stats', this.dashboardAuth.createBasicAuthMiddleware(), (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      try {
        const formatted = this.contextOptimizer.getFormattedStats();
        res.json(formatted);
      } catch (error) {
        console.error('Failed to get stats:', error);
        res.status(500).json({ error: 'Failed to get stats' });
      }
    });

    // Reset optimization statistics (dashboard)
    this.app.post('/api/stats/reset', this.dashboardAuth.createBasicAuthMiddleware(), (req, res) => {
      try {
        this.contextOptimizer.resetStats();
        res.json({ success: true, message: 'Statistics have been reset successfully' });
      } catch (error) {
        console.error('Failed to reset stats:', error);
        res.status(500).json({ error: 'Failed to reset stats' });
      }
    });

    // Context optimization endpoint
    this.app.post('/api/optimize', this.dashboardAuth.createBasicAuthMiddleware(), async (req, res) => {
      try {
        const { tools, query = '' } = req.body;
        
        if (!tools || !Array.isArray(tools)) {
          res.status(400).json({
            error: {
              code: 400,
              message: 'Invalid request: tools array is required'
            }
          });
          return;
        }

        // Convert tools to MCPContext format
        const mcpTools: MCPTool[] = tools.map((tool: any) => ({
          name: tool.name,
          description: tool.description || '',
          inputSchema: tool.inputSchema || { type: 'object', properties: {} },
          server: tool.server || 'unknown'
        }));

        const context: MCPContext = {
          tools: mcpTools
        };

        // Get server list for optimization
        const servers = this.config.mcpServers.map(server => ({
          name: server.name,
          url: server.url
        }));

        // Optimize context
        const optimizedContext = await this.contextOptimizer.optimizeContext(
          query,
          context,
          servers
        );

        res.json({
          originalToolCount: context.tools.length,
          optimizedToolCount: optimizedContext.tools.length,
          tokensSaved: optimizedContext.metadata.tokensSaved,
          savingsPercent: optimizedContext.metadata.savingsPercent,
          tools: optimizedContext.tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            server: tool.server
          }))
        });

      } catch (error) {
        console.error('Optimization failed:', error);
        res.status(500).json({
          error: {
            code: 500,
            message: 'Internal server error',
            data: error instanceof Error ? error.message : String(error)
          }
        });
      }
    });

    // Server list with connection status for dashboard
    this.app.get('/api/servers', this.dashboardAuth.createBasicAuthMiddleware(), (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      try {
        const servers = this.config.mcpServers.map((s) => ({
          name: s.name,
          url: s.url,
          connected: this.serverConnections.has(s.name),
          lastSeen: new Date().toISOString(),
          requests: 0,
          errors: 0,
          responseTime: 0,
          tools: [] as Array<{ name: string; description: string }>
        }));
        res.json(servers);
      } catch (error) {
        console.error('Failed to get servers:', error);
        res.status(500).json({ error: 'Failed to get servers' });
      }
    });

    // Report export endpoints (protected)
    this.app.get('/api/reports/formats', this.dashboardAuth.createBasicAuthMiddleware(), (req, res) => {
      try {
        const formats = this.reportExporter.getAvailableFormats();
        const periods = this.reportExporter.getAvailablePeriods();
        
        res.json({
          formats,
          periods,
          defaultFormat: 'json',
          defaultPeriod: 'week'
        });
      } catch (error) {
        console.error('Failed to get report formats:', error);
        res.status(500).json({ error: 'Failed to get report formats' });
      }
    });
    
    this.app.post('/api/reports/export', this.dashboardAuth.createBasicAuthMiddleware(), async (req, res) => {
      try {
        const { format = 'json', period = 'week', includeDetails = true } = req.body;
        
        const result = await this.reportExporter.exportReport({
          format,
          period,
          includeDetails,
          exportPath: './data/reports'
        });
        
        res.json({
          success: true,
          message: 'Report exported successfully',
          report: {
            path: result.path,
            size: result.size,
            downloadUrl: `/api/reports/download/${path.basename(result.path)}`
          }
        });
      } catch (error) {
        console.error('Failed to export report:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to export report',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });
    
    this.app.get('/api/reports/download/:filename', this.dashboardAuth.createBasicAuthMiddleware(), (req, res) => {
      try {
        const { filename } = req.params;
        const filePath = path.join('./data/reports', filename);
        
        if (!fs.existsSync(filePath)) {
          res.status(404).json({ error: 'Report not found' });
          return;
        }
        
        // Validate filename to prevent directory traversal
        if (!filename.match(/^optimization-report-\d{4}-\d{2}-\d{2}-\d{6}\.(json|csv)$/)) {
          res.status(400).json({ error: 'Invalid filename' });
          return;
        }
        
        const fileExt = path.extname(filename).toLowerCase();
        const contentType = fileExt === '.csv' ? 'text/csv' : 'application/json';
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        
      } catch (error) {
        console.error('Failed to download report:', error);
        res.status(500).json({ error: 'Failed to download report' });
      }
    });
    
    // Dashboard (if enabled, protected)
    if (this.config.analytics.dashboardEnabled) {
      const dashboardPath = path.join(__dirname, '../../dashboard/dist');
      if (fs.existsSync(dashboardPath)) {
        // Serve dashboard assets under /dashboard/assets/* (must be before GET /dashboard)
        this.app.use('/dashboard', apiAuthMiddleware, express.static(dashboardPath, { index: false }));
        // SPA: serve index.html for /dashboard and /dashboard/* so routing and assets work
        this.app.get('/dashboard', apiAuthMiddleware, (req, res) => {
          res.sendFile(path.join(dashboardPath, 'index.html'));
        });
        this.app.get('/dashboard/*', apiAuthMiddleware, (req, res) => {
          res.sendFile(path.join(dashboardPath, 'index.html'));
        });
      } else {
        // Fallback when dashboard is not built
        this.app.get('/dashboard', apiAuthMiddleware, (req, res) => {
          res.send(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>MCP Smart Proxy Dashboard</title>
                <style>
                  body { font-family: Arial, sans-serif; margin: 40px; }
                  .card { background: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 8px; }
                  .metric { margin: 10px 0; }
                  .metric-value { font-weight: bold; color: #007acc; }
                </style>
              </head>
              <body>
                <h1>MCP Smart Proxy Dashboard</h1>
                <p>Run <code>make build</code> to build the full dashboard.</p>
                <div class="card">
                  <h2>Optimization Metrics</h2>
                  <div class="metric">Total Requests: <span class="metric-value" id="totalRequests">0</span></div>
                  <div class="metric">Average Token Savings: <span class="metric-value" id="avgSavings">0%</span></div>
                  <div class="metric">Cache Hit Rate: <span class="metric-value" id="cacheHitRate">0%</span></div>
                </div>
                <div class="card">
                  <h2>Server Status</h2>
                  <div class="metric">Configured Servers: <span class="metric-value" id="configuredServers">0</span></div>
                  <div class="metric">Connected Servers: <span class="metric-value" id="connectedServers">0</span></div>
                </div>
                <script>
                  async function updateMetrics() {
                    try {
                      const response = await fetch('/metrics');
                      const data = await response.json();
                      document.getElementById('totalRequests').textContent = data.optimization.totalRequests;
                      document.getElementById('avgSavings').textContent = data.optimization.averageSavings.toFixed(1) + '%';
                      document.getElementById('cacheHitRate').textContent = data.optimization.cache.hitRate + '%';
                      document.getElementById('configuredServers').textContent = data.servers.configured;
                      document.getElementById('connectedServers').textContent = data.servers.connected;
                    } catch (error) { console.error('Failed to fetch metrics:', error); }
                  }
                  updateMetrics();
                  setInterval(updateMetrics, 5000);
                </script>
              </body>
            </html>
          `);
        });
      }
    }
    
    // Proxy endpoint for HTTP-based MCP servers
    this.app.post('/proxy/:serverName', async (req, res) => {
      try {
        const { serverName } = req.params;
        const request: MCPRequest = req.body;
        
        const server = this.config.mcpServers.find(s => s.name === serverName);
        if (!server) {
          res.status(404).json({
            error: {
              code: 404,
              message: `Server not found: ${serverName}`
            }
          });
          return;
        }
        
        // Forward request to server
        const response = await this.forwardRequest(server, request);
        res.json(response);
        
      } catch (error) {
        console.error('Proxy request failed:', error);
        res.status(500).json({
          error: {
            code: 500,
            message: 'Internal server error',
            data: error instanceof Error ? error.message : String(error)
          }
        });
      }
    });
  }
  
  /**
   * Setup WebSocket server for real-time MCP communication
   */
  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.connectedClients.set(ws, { id: clientId });
      
      console.log(`🔗 New client connected: ${clientId}`);
      
      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleClientMessage(ws, message);
        } catch (error) {
          console.error('Error handling client message:', error);
          this.sendError(ws, 'Invalid message format');
        }
      });
      
      ws.on('close', () => {
        console.log(`🔗 Client disconnected: ${clientId}`);
        this.connectedClients.delete(ws);
      });
      
      ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
      });
    });
  }
  
  /**
   * Connect to configured MCP servers
   */
  private async connectToServers(): Promise<void> {
    for (const server of this.config.mcpServers) {
      if (!server.enabled) continue;
      
      try {
        await this.connectToServer(server);
      } catch (error) {
        console.error(`Failed to connect to server ${server.name}:`, error);
      }
    }
  }
  
  /**
   * Connect to a single MCP server
   */
  private async connectToServer(server: MCPServerConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(server.url);
      
      ws.on('open', () => {
        console.log(`✅ Connected to MCP server: ${server.name}`);
        this.serverConnections.set(server.name, ws);
        resolve();
      });
      
      ws.on('error', (error) => {
        console.error(`❌ Connection error for server ${server.name}:`, error);
        reject(error);
      });
      
      ws.on('close', () => {
        console.log(`🔌 Disconnected from server: ${server.name}`);
        this.serverConnections.delete(server.name);
      });
      
      // Set timeout
      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          reject(new Error(`Connection timeout for server ${server.name}`));
        }
      }, server.timeout || 30000);
    });
  }
  
  /**
   * Handle messages from clients
   */
  private async handleClientMessage(ws: WebSocket, message: any): Promise<void> {
    if (!message.method) {
      this.sendError(ws, 'Missing method in request');
      return;
    }
    
    switch (message.method) {
      case 'initialize':
        await this.handleInitialize(ws, message);
        break;
      
      case 'tools/list':
        await this.handleToolsList(ws, message);
        break;
      
      case 'tools/call':
        await this.handleToolCall(ws, message);
        break;
      
      default:
        // Check if it's a stats tool call
        if (message.method === 'tools/call' && message.params?.name?.startsWith('get_')) {
          await this.handleStatsToolCall(ws, message);
        } else {
          // Forward to appropriate server
          await this.forwardToServer(ws, message);
        }
        break;
    }
  }
  
  /**
   * Handle initialize request
   */
  private async handleInitialize(ws: WebSocket, message: any): Promise<void> {
    try {
      // Get tools from all servers
      const allTools = await this.getAllTools();
      
      // Create initial context
      const context: MCPContext = {
        tools: allTools,
        resources: [],
        conversations: []
      };
      
      // Optimize context if enabled
      let optimizedContext: OptimizedContext;
      if (this.config.optimization.enabled && message.params?.capabilities) {
        // Extract query from capabilities or use default
        const query = this.extractQueryFromCapabilities(message.params.capabilities) || 'general initialization';
        
        optimizedContext = await this.contextOptimizer.optimizeContext(
          query,
          context,
          this.config.mcpServers
        );
      } else {
        optimizedContext = {
          ...context,
          metadata: {
            originalToolCount: allTools.length,
            optimizedToolCount: allTools.length,
            tokensSaved: 0,
            savingsPercent: 0,
            optimizationTime: 0
          }
        };
      }
      
      // Send response
      const response: MCPResponse = {
        result: {
          protocolVersion: '2024-11-05',
          capabilities: message.params?.capabilities || {},
          serverInfo: {
            name: 'MCP Smart Proxy',
            version: '1.0.0'
          },
          ...optimizedContext
        },
        id: message.id
      };
      
      ws.send(JSON.stringify(response));
      
    } catch (error) {
      console.error('Initialize failed:', error);
      this.sendError(ws, 'Initialization failed', message.id);
    }
  }
  
  /**
   * Handle tools/list request
   */
  private async handleToolsList(ws: WebSocket, message: any): Promise<void> {
    try {
      const allTools = await this.getAllTools();
      
      // Optimize tool list based on query context
      let tools = allTools;
      if (this.config.optimization.enabled && message.params?.context) {
        const query = message.params.context.query || 'list tools';
        
        const optimized = await this.contextOptimizer.optimizeContext(
          query,
          { tools: allTools, resources: [], conversations: [] },
          this.config.mcpServers
        );
        
        tools = optimized.tools;
      }
      
      const response: MCPResponse = {
        result: { tools },
        id: message.id
      };
      
      ws.send(JSON.stringify(response));
      
    } catch (error) {
      console.error('Tools/list failed:', error);
      this.sendError(ws, 'Failed to list tools', message.id);
    }
  }
  
  /**
   * Handle tool call
   */
  private async handleToolCall(ws: WebSocket, message: any): Promise<void> {
    try {
      const { name, arguments: args } = message.params;

      // Check if it's a stats tool
      if (name.startsWith('get_') || name.startsWith('export_')) {
        await this.handleStatsToolCall(ws, message);
        return;
      }

      // Find which server has this tool
      const server = await this.findServerForTool(name);
      if (!server) {
        this.sendError(ws, `Tool not found: ${name}`, message.id);
        return;
      }

      const serverWs = this.serverConnections.get(server.name);
      if (!serverWs) {
        this.sendError(ws, `Server not connected: ${server.name}`, message.id);
        return;
      }

      const useSemanticCache =
        this.config.optimization.semanticCacheEnabled &&
        this.semanticCache &&
        !this.semanticCache.shouldBypass(server.name, message.params);

      const queryKey = `${name}:${JSON.stringify(args ?? {})}`;
      let embedding: number[] | null = null;
      if (useSemanticCache) {
        embedding = await this.vectorMemory.generateEmbedding(queryKey);
        const cached = await this.semanticCache!.get(embedding, server.name);
        if (cached.hit) {
          const response: MCPResponse = { ...cached.response, id: message.id };
          ws.send(JSON.stringify(response));
          return;
        }
      }

      const response = await this.forwardToServerAndWait(serverWs, {
        method: 'tools/call',
        params: { name, arguments: args },
        id: message.id
      });

      if (useSemanticCache && response && !response.error && embedding) {
        await this.semanticCache!.set(
          embedding,
          queryKey,
          response,
          server.name,
          name
        );
      }

      ws.send(JSON.stringify(response));
    } catch (error) {
      console.error('Tool call failed:', error);
      this.sendError(ws, 'Tool call failed', message.id);
    }
  }
  
  /**
   * Handle stats tool call
   */
  private async handleStatsToolCall(ws: WebSocket, message: any): Promise<void> {
    try {
      const { name, arguments: args } = message.params;
      
      // Execute stats tool
      const result = await this.statsTool.executeTool(name, args || {});
      
      const response: MCPResponse = {
        result,
        id: message.id
      };
      
      ws.send(JSON.stringify(response));
      
      // Log the stats query
      console.log(`Stats tool executed: ${name}`, {
        query: args?.format || 'summary',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Stats tool call failed:', error);
      this.sendError(ws, `Stats tool failed: ${error instanceof Error ? error.message : String(error)}`, message.id);
    }
  }
  
  /**
   * Forward message to appropriate server
   */
  private async forwardToServer(ws: WebSocket, message: any): Promise<void> {
    // Simple implementation - forward to first available server
    // In production, you'd want more sophisticated routing
    const serverName = Object.keys(this.serverConnections)[0];
    const serverWs = this.serverConnections.get(serverName);
    
    if (!serverWs) {
      this.sendError(ws, 'No servers available', message.id);
      return;
    }
    
    try {
      const response = await this.forwardToServerAndWait(serverWs, message);
      ws.send(JSON.stringify(response));
    } catch (error) {
      this.sendError(ws, 'Forwarding failed', message.id);
    }
  }
  
  /**
   * Forward HTTP request to server
   */
  private async forwardRequest(server: MCPServerConfig, request: MCPRequest): Promise<MCPResponse> {
    // WebSocket forwarding implementation for MCP servers
    return new Promise((resolve, reject) => {
      const WebSocket = require('ws');
      const ws = new WebSocket(server.url);
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket connection timeout'));
      }, server.timeout || 30000);
      
      ws.on('open', () => {
        // Send the request
        ws.send(JSON.stringify(request));
        
        // Set up response handler
        ws.on('message', (data: Buffer) => {
          try {
            const response = JSON.parse(data.toString());
            if (response.id === request.id) {
              clearTimeout(timeout);
              ws.close();
              resolve(response as MCPResponse);
            }
          } catch (error) {
            clearTimeout(timeout);
            ws.close();
            reject(error);
          }
        });
        
        // Handle WebSocket errors
        ws.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      
      // Handle connection errors
      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }
  
  /**
   * Forward WebSocket message to server and wait for response
   */
  private forwardToServerAndWait(serverWs: WebSocket, message: any): Promise<MCPResponse> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server response timeout'));
      }, 30000);
      
      const messageHandler = (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === message.id) {
            clearTimeout(timeout);
            serverWs.removeListener('message', messageHandler);
            resolve(response);
          }
        } catch (error) {
          // Ignore parsing errors for other messages
        }
      };
      
      serverWs.on('message', messageHandler);
      serverWs.send(JSON.stringify(message));
    });
  }
  
  /**
   * Get all tools from all servers
   */
  private async getAllTools(): Promise<MCPTool[]> {
    const allTools: MCPTool[] = [];
    
    // Get tools from connected MCP servers
    for (const [serverName, serverWs] of this.serverConnections) {
      try {
        const tools = await this.getToolsFromServer(serverWs, serverName);
        allTools.push(...tools);
      } catch (error) {
        console.error(`Failed to get tools from server ${serverName}:`, error);
      }
    }
    
    // Add optimization stats tools
    const statsTools = this.statsTool.getTools();
    allTools.push(...statsTools);
    
    return allTools;
  }
  
  /**
   * Get tools from a specific server
   */
  private getToolsFromServer(serverWs: WebSocket, serverName: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const requestId = `tools_req_${Date.now()}`;
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout getting tools from ${serverName}`));
      }, 10000);
      
      const messageHandler = (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === requestId && response.result?.tools) {
            clearTimeout(timeout);
            serverWs.removeListener('message', messageHandler);
            
            // Add server information to each tool
            const toolsWithServer = response.result.tools.map((tool: any) => ({
              ...tool,
              server: serverName
            }));
            
            resolve(toolsWithServer);
          }
        } catch (error) {
          // Ignore parsing errors
        }
      };
      
      serverWs.on('message', messageHandler);
      serverWs.send(JSON.stringify({
        method: 'tools/list',
        id: requestId
      }));
    });
  }
  
  /**
   * Find server that has a specific tool
   */
  private async findServerForTool(toolName: string): Promise<MCPServerConfig | null> {
    // Simple implementation - check all servers
    // In production, you'd want to maintain a tool-to-server mapping
    for (const server of this.config.mcpServers) {
      if (this.serverConnections.has(server.name)) {
        // Check if server has this tool (simplified)
        // In reality, you'd query each server's tools
        const serverWs = this.serverConnections.get(server.name);
        if (serverWs) {
          try {
            const tools = await this.getToolsFromServer(serverWs, server.name);
            if (tools.some((tool: any) => tool.name === toolName)) {
              return server;
            }
          } catch (error) {
            // Continue to next server
          }
        }
      }
    }
    
    return null;
  }
  
  /**
   * Extract query from capabilities
   */
  private extractQueryFromCapabilities(capabilities: any): string | null {
    // Extract query from various capability fields
    if (capabilities.query) return capabilities.query;
    if (capabilities.context?.query) return capabilities.context.query;
    if (capabilities.intent) return capabilities.intent;
    
    return null;
  }
  
  /**
   * Send error response
   */
  private sendError(ws: WebSocket, message: string, id?: string | number): void {
    const response: MCPResponse = {
      error: {
        code: 500,
        message
      },
      id
    };
    
    ws.send(JSON.stringify(response));
  }
}