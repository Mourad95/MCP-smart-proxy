import { OptimizationStatsManager } from './optimization-stats';
import { MCPTool } from '../types/mcp-types';

/**
 * MCP Tool for accessing optimization statistics
 * 
 * Provides tools for AI agents and users to query
 * token savings and optimization metrics
 */

export class OptimizationStatsTool {
  private statsManager: OptimizationStatsManager;
  
  constructor(statsDir?: string) {
    this.statsManager = new OptimizationStatsManager(statsDir);
  }
  
  /**
   * Get MCP tool definitions for optimization statistics
   */
  getTools(): MCPTool[] {
    return [
      {
        name: 'get_optimization_stats',
        description: 'Get optimization statistics including token savings, request counts, and performance metrics',
        inputSchema: {
          type: 'object',
          properties: {
            format: {
              type: 'string',
              enum: ['summary', 'detailed', 'raw'],
              description: 'Output format',
              default: 'summary'
            },
            export: {
              type: 'boolean',
              description: 'Export to JSON file',
              default: false
            },
            reset: {
              type: 'boolean',
              description: 'Reset statistics (admin only)',
              default: false
            }
          }
        },
        server: 'mcp-smart-proxy'
      },
      {
        name: 'get_token_savings',
        description: 'Get detailed token savings breakdown including hourly statistics and top queries',
        inputSchema: {
          type: 'object',
          properties: {
            period: {
              type: 'string',
              enum: ['hour', 'day', 'week', 'month', 'all'],
              description: 'Time period to analyze',
              default: 'all'
            },
            limit: {
              type: 'number',
              description: 'Number of top items to return',
              default: 10,
              minimum: 1,
              maximum: 50
            }
          }
        },
        server: 'mcp-smart-proxy'
      },
      {
        name: 'export_optimization_data',
        description: 'Export optimization data to JSON file for analysis or backup',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Export file path (relative to data directory)',
              default: 'optimization-export.json'
            },
            includeRaw: {
              type: 'boolean',
              description: 'Include raw metrics data',
              default: true
            }
          }
        },
        server: 'mcp-smart-proxy'
      }
    ];
  }
  
  /**
   * Handle tool execution
   */
  async executeTool(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'get_optimization_stats':
        return await this.handleGetOptimizationStats(args);
      
      case 'get_token_savings':
        return await this.handleGetTokenSavings(args);
      
      case 'export_optimization_data':
        return await this.handleExportOptimizationData(args);
      
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }
  
  /**
   * Handle get_optimization_stats tool
   */
  private async handleGetOptimizationStats(args: any): Promise<any> {
    const { format = 'summary', export: shouldExport = false, reset = false } = args;
    
    // Handle reset if requested (with safety check)
    if (reset) {
      // In production, you'd want authentication/authorization here
      const confirmReset = args.confirm === true;
      if (!confirmReset) {
        return {
          warning: 'Reset requires confirmation. Pass confirm: true to reset statistics.',
          currentStats: this.statsManager.getFormattedStats()
        };
      }
      
      this.statsManager.resetStats();
      return {
        success: true,
        message: 'Optimization statistics have been reset',
        newStats: this.statsManager.getFormattedStats()
      };
    }
    
    // Get statistics
    const stats = this.statsManager.getFormattedStats();
    
    // Export if requested
    if (shouldExport) {
      const exportPath = `optimization-stats-${Date.now()}.json`;
      this.statsManager.exportStats(exportPath);
      
      return {
        export: {
          path: exportPath,
          success: true
        },
        stats: format === 'raw' ? stats.raw : 
               format === 'detailed' ? stats.details : 
               stats.summary
      };
    }
    
    // Return based on requested format
    switch (format) {
      case 'raw':
        return {
          raw: stats.raw,
          metadata: {
            generatedAt: new Date().toISOString(),
            format: 'raw'
          }
        };
      
      case 'detailed':
        return {
          summary: stats.summary,
          details: stats.details,
          metadata: {
            generatedAt: new Date().toISOString(),
            format: 'detailed'
          }
        };
      
      case 'summary':
      default:
        return {
          summary: stats.summary,
          metadata: {
            generatedAt: new Date().toISOString(),
            format: 'summary'
          }
        };
    }
  }
  
  /**
   * Handle get_token_savings tool
   */
  private async handleGetTokenSavings(args: any): Promise<any> {
    const { period = 'all', limit = 10 } = args;
    const stats = this.statsManager.getStats();
    
    // Filter hourly data based on period
    let filteredHours: Array<[string, number]> = [];
    let filteredSavings: Array<[string, number]> = [];
    
    const now = new Date();
    const cutoffTime = this.getCutoffTime(period, now);
    
    if (period === 'all') {
      filteredHours = Object.entries(stats.requestsByHour)
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, limit);
      
      filteredSavings = Object.entries(stats.savingsByHour)
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, limit);
    } else {
      Object.entries(stats.requestsByHour).forEach(([hour, count]) => {
        const hourDate = this.parseHourKey(hour);
        if (hourDate >= cutoffTime) {
          filteredHours.push([hour, count]);
        }
      });
      
      Object.entries(stats.savingsByHour).forEach(([hour, savings]) => {
        const hourDate = this.parseHourKey(hour);
        if (hourDate >= cutoffTime) {
          filteredSavings.push([hour, savings]);
        }
      });
      
      filteredHours.sort(([a], [b]) => b.localeCompare(a)).slice(0, limit);
      filteredSavings.sort(([a], [b]) => b.localeCompare(a)).slice(0, limit);
    }
    
    // Calculate period-specific totals
    let periodRequests = 0;
    let periodTokensSaved = 0;
    
    filteredHours.forEach(([_, count]) => periodRequests += count);
    filteredSavings.forEach(([_, savings]) => periodTokensSaved += savings);
    
    // Get top queries for the period
    const topQueries = stats.topQueries
      .sort((a, b) => b.savingsPercent - a.savingsPercent)
      .slice(0, limit);
    
    // Get top tools for the period
    const topTools = Object.entries(stats.toolsUsage)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([tool, count]) => ({ tool, count }));
    
    return {
      period,
      timeframe: {
        start: cutoffTime.toISOString(),
        end: now.toISOString()
      },
      totals: {
        requests: periodRequests,
        tokensSaved: periodTokensSaved,
        averageSavingsPercent: periodTokensSaved > 0 ? 
          (periodTokensSaved / (periodTokensSaved + periodRequests * 500)) * 100 : 0 // Estimate
      },
      hourlyBreakdown: {
        requests: filteredHours,
        savings: filteredSavings
      },
      topQueries,
      topTools,
      metadata: {
        generatedAt: now.toISOString(),
        limit
      }
    };
  }
  
  /**
   * Handle export_optimization_data tool
   */
  private async handleExportOptimizationData(args: any): Promise<any> {
    const { path = 'optimization-export.json', includeRaw = true } = args;
    
    try {
      const exportPath = path.startsWith('/') ? path : `./data/${path}`;
      this.statsManager.exportStats(exportPath);
      
      return {
        success: true,
        export: {
          path: exportPath,
          size: this.getFileSize(exportPath),
          timestamp: new Date().toISOString()
        },
        message: 'Optimization data exported successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to export optimization data'
      };
    }
  }
  
  /**
   * Get cutoff time based on period
   */
  private getCutoffTime(period: string, now: Date): Date {
    const cutoff = new Date(now);
    
    switch (period) {
      case 'hour':
        cutoff.setHours(cutoff.getHours() - 1);
        break;
      case 'day':
        cutoff.setDate(cutoff.getDate() - 1);
        break;
      case 'week':
        cutoff.setDate(cutoff.getDate() - 7);
        break;
      case 'month':
        cutoff.setMonth(cutoff.getMonth() - 1);
        break;
      case 'all':
        cutoff.setFullYear(2000); // Very old date
        break;
    }
    
    return cutoff;
  }
  
  /**
   * Parse hour key string to Date
   */
  private parseHourKey(hourKey: string): Date {
    const [datePart, timePart] = hourKey.split(' ');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour] = timePart.split(':').map(Number);
    
    return new Date(year, month - 1, day, hour);
  }
  
  /**
   * Get file size in human-readable format
   */
  private getFileSize(filePath: string): string {
    try {
      const stats = fs.statSync(filePath);
      const bytes = stats.size;
      
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    } catch {
      return 'unknown';
    }
  }
  
  /**
   * Get the stats manager instance
   */
  getStatsManager(): OptimizationStatsManager {
    return this.statsManager;
  }
}

// Re-import fs for file operations
import fs from 'fs';