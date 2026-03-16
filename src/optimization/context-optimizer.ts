import { VectorMemory } from '../memory/vector-memory';
import { OptimizationStatsManager } from '../analytics/optimization-stats';
import { 
  QueryAnalysis, 
  OptimizedContext, 
  MCPTool, 
  MCPContext,
  OptimizationMetrics 
} from '../types/mcp-types';

/**
 * Context Optimizer for MCP Smart Proxy
 * 
 * Optimizes MCP context by:
 * 1. Filtering irrelevant tools
 * 2. Removing duplicate information
 * 3. Limiting context size
 * 4. Semantic routing to appropriate servers
 * 5. Tracking optimization statistics
 */
export class ContextOptimizer {
  private cache: Map<string, OptimizedContext> = new Map();
  private metrics: OptimizationMetrics[] = [];
  private statsManager: OptimizationStatsManager;
  
  constructor(
    private vectorMemory: VectorMemory,
    private config: {
      enabled: boolean;
      maxContextTokens: number;
      embeddingModel: string;
      cacheEnabled: boolean;
      semanticRouting: boolean;
      minRelevanceScore: number;
    },
    statsDir?: string
  ) {
    this.statsManager = new OptimizationStatsManager(statsDir);
  }
  
  /**
   * Analyze a query to determine intent and relevant tools
   */
  async analyzeQuery(query: string): Promise<QueryAnalysis> {
    // Generate embedding for the query
    const embedding = await this.vectorMemory.generateEmbedding(query);
    
    // Search for relevant tools in vector memory
    const relevantItems = await this.vectorMemory.searchItems(
      query,
      10, // limit
      this.config.minRelevanceScore,
      { type: 'tool' }
    );
    
    // Determine intent based on query content
    const intent = this.determineIntent(query);
    const categories = this.categorizeQuery(query);
    
    // Extract relevant tool names
    const relevantTools = relevantItems
      .filter(item => item.metadata.toolName)
      .map(item => item.metadata.toolName as string);
    
    // Calculate confidence based on search scores
    const confidence = relevantItems.length > 0 
      ? Math.min(1, relevantItems.reduce((sum, item) => sum + (item.score || 0), 0) / relevantItems.length)
      : 0.3; // Default confidence
    
    return {
      intent,
      categories,
      relevantTools,
      confidence,
      embedding
    };
  }
  
  /**
   * Optimize MCP context based on query analysis
   */
  async optimizeContext(
    query: string,
    originalContext: MCPContext,
    servers: Array<{ name: string; url: string }>
  ): Promise<OptimizedContext> {
    const startTime = Date.now();
    
    // Check cache if enabled
    const cacheKey = this.generateCacheKey(query, originalContext);
    if (this.config.cacheEnabled && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      
      const metrics: OptimizationMetrics = {
        timestamp: new Date(),
        query,
        originalTokens: this.estimateTokens(originalContext),
        optimizedTokens: this.estimateTokens(cached),
        tokensSaved: this.estimateTokens(originalContext) - this.estimateTokens(cached),
        savingsPercent: cached.metadata.savingsPercent,
        responseTime: Date.now() - startTime,
        cacheHit: true,
        toolsUsed: cached.tools.map(tool => tool.name)
      };
      
      this.recordMetrics(metrics);
      this.statsManager.recordMetrics(metrics);
      
      return cached;
    }
    
    // If optimization is disabled, return original context
    if (!this.config.enabled) {
      const result: OptimizedContext = {
        ...originalContext,
        metadata: {
          originalToolCount: originalContext.tools.length,
          optimizedToolCount: originalContext.tools.length,
          tokensSaved: 0,
          savingsPercent: 0,
          optimizationTime: Date.now() - startTime
        }
      };
      
      const metrics: OptimizationMetrics = {
        timestamp: new Date(),
        query,
        originalTokens: this.estimateTokens(originalContext),
        optimizedTokens: this.estimateTokens(result),
        tokensSaved: 0,
        savingsPercent: 0,
        responseTime: Date.now() - startTime,
        cacheHit: false,
        toolsUsed: originalContext.tools.map(tool => tool.name)
      };
      
      this.recordMetrics(metrics);
      this.statsManager.recordMetrics(metrics);
      
      return result;
    }
    
    // Analyze the query
    const analysis = await this.analyzeQuery(query);
    
    // Filter tools based on relevance
    const filteredTools = this.filterTools(
      originalContext.tools,
      analysis.relevantTools,
      servers
    );
    
    // Limit context size
    const limitedTools = this.limitContextSize(filteredTools);
    
    // Create optimized context
    const optimizedContext: OptimizedContext = {
      tools: limitedTools,
      resources: originalContext.resources ? this.filterResources(originalContext.resources, analysis) : undefined,
      conversations: originalContext.conversations ? this.filterConversations(originalContext.conversations, analysis) : undefined,
      metadata: {
        originalToolCount: originalContext.tools.length,
        optimizedToolCount: limitedTools.length,
        tokensSaved: this.estimateTokens(originalContext) - this.estimateTokens({ tools: limitedTools }),
        savingsPercent: this.calculateSavingsPercent(originalContext.tools.length, limitedTools.length),
        optimizationTime: Date.now() - startTime
      }
    };
    
    // Cache the result if enabled
    if (this.config.cacheEnabled) {
      this.cache.set(cacheKey, optimizedContext);
      
      // Limit cache size
      if (this.cache.size > 1000) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
    }
    
    // Record metrics
    const metrics: OptimizationMetrics = {
      timestamp: new Date(),
      query,
      originalTokens: this.estimateTokens(originalContext),
      optimizedTokens: this.estimateTokens(optimizedContext),
      tokensSaved: optimizedContext.metadata.tokensSaved,
      savingsPercent: optimizedContext.metadata.savingsPercent,
      responseTime: Date.now() - startTime,
      cacheHit: false,
      toolsUsed: optimizedContext.tools.map(tool => tool.name)
    };
    
    this.recordMetrics(metrics);
    
    // Log to optimization stats
    this.statsManager.recordMetrics(metrics);
    
    return optimizedContext;
  }
  
  /**
   * Filter tools based on relevance analysis
   */
  private filterTools(
    tools: MCPTool[],
    relevantToolNames: string[],
    servers: Array<{ name: string; url: string }>
  ): MCPTool[] {
    if (!this.config.semanticRouting) {
      // If semantic routing is disabled, return all tools
      return tools;
    }
    
    // Filter tools that match relevant tool names or server patterns
    return tools.filter(tool => {
      // Check if tool name is in relevant tools
      if (relevantToolNames.includes(tool.name)) {
        return true;
      }
      
      // Check if server is relevant based on query analysis
      const server = servers.find(s => s.name === tool.server);
      if (server && this.isServerRelevant(tool.server, relevantToolNames)) {
        return true;
      }
      
      // Keep essential tools (like filesystem for file operations)
      if (this.isEssentialTool(tool)) {
        return true;
      }
      
      return false;
    });
  }
  
  /**
   * Limit context size based on token budget
   */
  private limitContextSize(tools: MCPTool[]): MCPTool[] {
    let currentTokens = 0;
    const limitedTools: MCPTool[] = [];
    
    for (const tool of tools) {
      const toolTokens = this.estimateToolTokens(tool);
      
      if (currentTokens + toolTokens <= this.config.maxContextTokens) {
        limitedTools.push(tool);
        currentTokens += toolTokens;
      } else {
        // We've reached the token limit
        break;
      }
    }
    
    return limitedTools;
  }
  
  /**
   * Filter resources based on relevance
   */
  private filterResources(resources: any[], analysis: QueryAnalysis): any[] {
    // Simple implementation - in production, you'd want more sophisticated filtering
    return resources.slice(0, 5); // Limit to 5 resources
  }
  
  /**
   * Filter conversations based on relevance
   */
  private filterConversations(conversations: any[], analysis: QueryAnalysis): any[] {
    // Simple implementation - in production, you'd want more sophisticated filtering
    return conversations.slice(-3); // Keep last 3 conversations
  }
  
  /**
   * Determine query intent
   */
  private determineIntent(query: string): string {
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('file') || queryLower.includes('read') || queryLower.includes('write')) {
      return 'filesystem_operation';
    } else if (queryLower.includes('git') || queryLower.includes('github') || queryLower.includes('commit')) {
      return 'version_control';
    } else if (queryLower.includes('search') || queryLower.includes('find') || queryLower.includes('look')) {
      return 'search_operation';
    } else if (queryLower.includes('create') || queryLower.includes('make') || queryLower.includes('build')) {
      return 'creation_operation';
    } else if (queryLower.includes('delete') || queryLower.includes('remove') || queryLower.includes('clean')) {
      return 'deletion_operation';
    }
    
    return 'general_query';
  }
  
  /**
   * Categorize query
   */
  private categorizeQuery(query: string): string[] {
    const categories: string[] = [];
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('file') || queryLower.includes('folder') || queryLower.includes('directory')) {
      categories.push('filesystem');
    }
    
    if (queryLower.includes('code') || queryLower.includes('program') || queryLower.includes('function')) {
      categories.push('programming');
    }
    
    if (queryLower.includes('data') || queryLower.includes('json') || queryLower.includes('xml')) {
      categories.push('data_processing');
    }
    
    if (queryLower.includes('web') || queryLower.includes('http') || queryLower.includes('api')) {
      categories.push('web_operations');
    }
    
    if (categories.length === 0) {
      categories.push('general');
    }
    
    return categories;
  }
  
  /**
   * Check if a server is relevant based on tool names
   */
  private isServerRelevant(serverName: string, relevantToolNames: string[]): boolean {
    // Simple implementation - check if server name appears in relevant tool names
    return relevantToolNames.some(toolName => 
      toolName.toLowerCase().includes(serverName.toLowerCase()) ||
      serverName.toLowerCase().includes(toolName.toLowerCase())
    );
  }
  
  /**
   * Check if a tool is essential (should always be included)
   */
  private isEssentialTool(tool: MCPTool): boolean {
    const essentialToolNames = ['read_file', 'write_file', 'list_directory', 'search_files'];
    return essentialToolNames.includes(tool.name);
  }
  
  /**
   * Generate cache key for query and context
   */
  private generateCacheKey(query: string, context: MCPContext): string {
    const toolNames = context.tools.map(tool => tool.name).sort().join(',');
    return `${query}:${toolNames}`;
  }
  
  /**
   * Estimate tokens for a tool
   */
  private estimateToolTokens(tool: MCPTool): number {
    // Rough estimation: 4 tokens per word
    const text = `${tool.name} ${tool.description} ${JSON.stringify(tool.inputSchema)}`;
    const words = text.split(/\s+/).length;
    return Math.ceil(words * 1.3); // Conservative estimate
  }
  
  /**
   * Estimate tokens for context
   */
  private estimateTokens(context: { tools: MCPTool[] }): number {
    return context.tools.reduce((total, tool) => total + this.estimateToolTokens(tool), 0);
  }
  
  /**
   * Calculate savings percentage
   */
  private calculateSavingsPercent(originalCount: number, optimizedCount: number): number {
    if (originalCount === 0) return 0;
    const savings = ((originalCount - optimizedCount) / originalCount) * 100;
    return Math.round(savings * 10) / 10; // Round to 1 decimal place
  }
  
  /**
   * Record optimization metrics
   */
  private recordMetrics(metrics: OptimizationMetrics): void {
    this.metrics.push(metrics);
    
    // Keep only last 1000 metrics
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
  }
  
  /**
   * Get optimization metrics
   */
  getMetrics(): OptimizationMetrics[] {
    return [...this.metrics];
  }
  
  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    const totalRequests = this.metrics.length;
    const cacheHits = this.metrics.filter(m => m.cacheHit).length;
    const hitRate = totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0;
    
    return {
      size: this.cache.size,
      hitRate: Math.round(hitRate * 10) / 10
    };
  }
}