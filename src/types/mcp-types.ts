/**
 * Type definitions for Model Context Protocol (MCP)
 */

export interface MCPServerConfig {
  name: string;
  url: string;
  description?: string;
  priority?: number;
  enabled?: boolean;
  timeout?: number;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  server: string;
}

export interface MCPRequest {
  method: string;
  params?: Record<string, any>;
  id?: string | number;
}

export interface MCPResponse {
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id?: string | number;
}

export interface MCPContext {
  tools: MCPTool[];
  resources?: any[];
  conversations?: any[];
}

export interface OptimizedContext {
  tools: MCPTool[];
  resources?: any[];
  conversations?: any[];
  metadata: {
    originalToolCount: number;
    optimizedToolCount: number;
    tokensSaved: number;
    savingsPercent: number;
    optimizationTime: number;
  };
}

export interface QueryAnalysis {
  intent: string;
  categories: string[];
  relevantTools: string[];
  confidence: number;
  embedding?: number[];
}

export interface OptimizationMetrics {
  timestamp: Date;
  query: string;
  originalTokens: number;
  optimizedTokens: number;
  tokensSaved: number;
  savingsPercent: number;
  responseTime: number;
  cacheHit: boolean;
  toolsUsed: string[];
}

export interface ProxyConfig {
  port: number;
  mcpServers: MCPServerConfig[];
  optimization: {
    enabled: boolean;
    maxContextTokens: number;
    embeddingModel: string;
    cacheEnabled: boolean;
    semanticRouting: boolean;
    minRelevanceScore: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'text';
    path?: string;
  };
  analytics: {
    enabled: boolean;
    retentionDays: number;
    dashboardEnabled: boolean;
  };
}

export interface VectorMemoryItem {
  id: string;
  text: string;
  embedding: number[];
  metadata: {
    type: 'tool' | 'resource' | 'conversation' | 'query';
    server?: string;
    toolName?: string;
    timestamp: Date;
    usageCount: number;
    lastUsed: Date;
  };
  score?: number;
}