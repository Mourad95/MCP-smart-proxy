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
  
  constructor(
    private config: ProxyConfig,
    private vectorMemory: VectorMemory,
    private contextOptimizer: ContextOptimizer,
    statsDir?: string
  ) {
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
    
    // Connect to configured MCP servers
    await this.connectToServers();
    
    this.httpServer.listen(this.config.port, () => {
      console.log(`🌐 Proxy server listening on port ${this.config.port}`);
      console.log(`🔌 Connected to ${this.serverConnections.size} MCP servers`);
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
    
    // Authentication routes (public)
    const authRouter = this.dashboardAuth.createMiddleware();
    this.app.use(authRouter);
    
    // Global API authentication middleware
    const apiAuthMiddleware = this.dashboardAuth.createBasicAuthMiddleware();
    
    // Apply auth middleware to all API routes
    this.app.use('/api', apiAuthMiddleware);
    
    // Metrics endpoint (protected if auth required)
    this.app.get('/metrics', this.dashboardAuth.createBasicAuthMiddleware(), (req, res) => {
      const metrics = this.contextOptimizer.getMetrics();
      const cacheStats = this.contextOptimizer.getCacheStats();
      
      res.json({
        optimization: {
          totalRequests: metrics.length,
          averageSavings: metrics.length > 0 
            ? metrics.reduce((sum, m) => sum + m.savingsPercent, 0) / metrics.length
            : 0,
          cache: cacheStats
        },
        servers: {
          configured: this.config.mcpServers.length,
          connected: this.serverConnections.size
        },
        recentRequests: metrics.slice(-10)
      });
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
          return res.status(404).json({ error: 'Report not found' });
        }
        
        // Validate filename to prevent directory traversal
        if (!filename.match(/^optimization-report-\d{4}-\d{2}-\d{2}-\d{6}\.(json|csv)$/)) {
          return res.status(400).json({ error: 'Invalid filename' });
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
      this.app.get('/dashboard', apiAuthMiddleware, (req, res) => {
        // Serve the React dashboard build
        const dashboardPath = path.join(__dirname, '../../dashboard/dist');
        
        if (fs.existsSync(dashboardPath)) {
          // Serve static files from dashboard build
          res.sendFile(path.join(dashboardPath, 'index.html'));
        } else {
          // Fallback to simple dashboard
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
                    } catch (error) {
                      console.error('Failed to fetch metrics:', error);
                    }
                  }
                  
                  // Update every 5 seconds
                  updateMetrics();
                  setInterval(updateMetrics, 5000);
                </script>
              </body>
            </html>
          `);
        }
      });
      
      // Serve static dashboard files
      const dashboardStaticPath = path.join(__dirname, '../../dashboard/dist');
      if (fs.existsSync(dashboardStaticPath)) {
        this.app.use('/dashboard-static', express.static(dashboardStaticPath));
      }
    }
    
    // Proxy endpoint for HTTP-based MCP servers
    this.app.post('/proxy/:serverName', async (req, res) => {
      try {
        const { serverName } = req.params;
        const request: MCPRequest = req.body;
        
        const server = this.config.mcpServers.find(s => s.name === serverName);
        if (!server) {
          return res.status(404).json({
            error: {
              code: 404,
              message: `Server not found: ${serverName}`
            }
          });
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
      
      // Forward to server
      const serverWs = this.serverConnections.get(server.name);
      if (!serverWs) {
        this.sendError(ws, `Server not connected: ${server.name}`, message.id);
        return;
      }
      
      // Forward request and wait for response
      const response = await this.forwardToServerAndWait(serverWs, {
        method: 'tools/call',
        params: { name, arguments: args },
        id: message.id
      });
      
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
    // Simple HTTP forwarding implementation
    // In production, you'd want proper error handling and timeout management
    const response = await fetch(server.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      timeout: server.timeout || 30000
    });
    
    return response.json();
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