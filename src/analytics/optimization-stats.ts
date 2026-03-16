import fs from 'fs';
import path from 'path';
import winston from 'winston';
import { OptimizationMetrics } from '../types/mcp-types';

/**
 * Optimization Statistics Manager
 * 
 * Tracks token savings and optimization metrics
 * Provides MCP tool for querying statistics
 */

export interface OptimizationStats {
  totalRequests: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalTokensSaved: number;
  averageSavingsPercent: number;
  requestsByHour: Record<string, number>;
  savingsByHour: Record<string, number>;
  topQueries: Array<{ query: string; savingsPercent: number; count: number }>;
  toolsUsage: Record<string, number>;
  startTime: Date;
  lastUpdate: Date;
}

export class OptimizationStatsManager {
  private stats: OptimizationStats;
  private statsPath: string;
  private logger: winston.Logger;
  
  constructor(statsDir: string = './data/stats') {
    this.statsPath = path.join(statsDir, 'optimization-stats.json');
    
    // Create stats directory if it doesn't exist
    if (!fs.existsSync(statsDir)) {
      fs.mkdirSync(statsDir, { recursive: true });
    }
    
    // Initialize or load stats
    this.stats = this.loadStats();
    
    // Setup Winston logger
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        // Console transport
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        // File transport for optimization stats
        new winston.transports.File({
          filename: path.join(statsDir, 'optimization.log'),
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        }),
        // File transport for detailed stats
        new winston.transports.File({
          filename: path.join(statsDir, 'stats.json'),
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          ),
          level: 'info'
        })
      ]
    });
    
    this.logger.info('OptimizationStatsManager initialized', {
      statsPath: this.statsPath,
      initialStats: this.stats
    });
  }
  
  /**
   * Load statistics from file or create default
   */
  private loadStats(): OptimizationStats {
    try {
      if (fs.existsSync(this.statsPath)) {
        const data = fs.readFileSync(this.statsPath, 'utf-8');
        const savedStats = JSON.parse(data);
        
        // Convert date strings back to Date objects
        savedStats.startTime = new Date(savedStats.startTime);
        savedStats.lastUpdate = new Date(savedStats.lastUpdate);
        
        this.logger.info('Loaded existing optimization stats', {
          totalRequests: savedStats.totalRequests,
          totalTokensSaved: savedStats.totalTokensSaved
        });
        
        return savedStats;
      }
    } catch (error) {
      this.logger.error('Failed to load optimization stats', { error });
    }
    
    // Return default stats
    const defaultStats: OptimizationStats = {
      totalRequests: 0,
      totalTokensIn: 0,
      totalTokensOut: 0,
      totalTokensSaved: 0,
      averageSavingsPercent: 0,
      requestsByHour: {},
      savingsByHour: {},
      topQueries: [],
      toolsUsage: {},
      startTime: new Date(),
      lastUpdate: new Date()
    };
    
    this.logger.info('Created new optimization stats');
    return defaultStats;
  }
  
  /**
   * Save statistics to file
   */
  private saveStats(): void {
    try {
      fs.writeFileSync(this.statsPath, JSON.stringify(this.stats, null, 2));
      this.stats.lastUpdate = new Date();
    } catch (error) {
      this.logger.error('Failed to save optimization stats', { error });
    }
  }
  
  /**
   * Record optimization metrics for a request
   */
  recordMetrics(metrics: OptimizationMetrics): void {
    const hourKey = this.getHourKey(metrics.timestamp);
    
    // Update basic stats
    this.stats.totalRequests++;
    this.stats.totalTokensIn += metrics.originalTokens;
    this.stats.totalTokensOut += metrics.optimizedTokens;
    this.stats.totalTokensSaved += metrics.tokensSaved;
    
    // Update hourly stats
    this.stats.requestsByHour[hourKey] = (this.stats.requestsByHour[hourKey] || 0) + 1;
    this.stats.savingsByHour[hourKey] = (this.stats.savingsByHour[hourKey] || 0) + metrics.tokensSaved;
    
    // Update tools usage
    metrics.toolsUsed.forEach(tool => {
      this.stats.toolsUsage[tool] = (this.stats.toolsUsage[tool] || 0) + 1;
    });
    
    // Update top queries (simplified - track by savings)
    const queryKey = metrics.query.substring(0, 50); // Limit query length
    const existingQuery = this.stats.topQueries.find(q => q.query === queryKey);
    
    if (existingQuery) {
      existingQuery.count++;
      existingQuery.savingsPercent = 
        (existingQuery.savingsPercent + metrics.savingsPercent) / 2;
    } else {
      this.stats.topQueries.push({
        query: queryKey,
        savingsPercent: metrics.savingsPercent,
        count: 1
      });
      
      // Keep only top 20 queries
      this.stats.topQueries.sort((a, b) => b.count - a.count);
      if (this.stats.topQueries.length > 20) {
        this.stats.topQueries.pop();
      }
    }
    
    // Recalculate average savings
    this.stats.averageSavingsPercent = 
      (this.stats.totalTokensSaved / this.stats.totalTokensIn) * 100;
    
    // Save updated stats
    this.saveStats();
    
    // Log detailed metrics
    this.logger.info('Optimization metrics recorded', {
      query: metrics.query.substring(0, 100),
      originalTokens: metrics.originalTokens,
      optimizedTokens: metrics.optimizedTokens,
      tokensSaved: metrics.tokensSaved,
      savingsPercent: metrics.savingsPercent,
      responseTime: metrics.responseTime,
      cacheHit: metrics.cacheHit,
      toolsUsed: metrics.toolsUsed.length
    });
    
    // Log to stats.json with detailed breakdown
    const detailedStats = {
      timestamp: metrics.timestamp.toISOString(),
      query: metrics.query,
      tokens: {
        in: metrics.originalTokens,
        out: metrics.optimizedTokens,
        saved: metrics.tokensSaved,
        savingsPercent: metrics.savingsPercent
      },
      performance: {
        responseTime: metrics.responseTime,
        cacheHit: metrics.cacheHit
      },
      tools: metrics.toolsUsed,
      cumulative: {
        totalRequests: this.stats.totalRequests,
        totalTokensSaved: this.stats.totalTokensSaved,
        averageSavingsPercent: this.stats.averageSavingsPercent
      }
    };
    
    // Append to stats.json file
    const statsLogPath = path.join(path.dirname(this.statsPath), 'stats.json');
    const logEntry = JSON.stringify(detailedStats) + '\n';
    
    try {
      fs.appendFileSync(statsLogPath, logEntry);
    } catch (error) {
      this.logger.error('Failed to append to stats.json', { error });
    }
  }
  
  /**
   * Get hour key for time-based aggregation
   */
  private getHourKey(timestamp: Date): string {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:00`;
  }
  
  /**
   * Get current optimization statistics
   */
  getStats(): OptimizationStats {
    return { ...this.stats };
  }
  
  /**
   * Get formatted statistics for MCP tool
   */
  getFormattedStats(): {
    summary: string;
    details: Record<string, any>;
    raw: OptimizationStats;
  } {
    const hoursRunning = Math.max(
      1,
      (new Date().getTime() - this.stats.startTime.getTime()) / (1000 * 60 * 60)
    );
    
    const requestsPerHour = this.stats.totalRequests / hoursRunning;
    const tokensSavedPerHour = this.stats.totalTokensSaved / hoursRunning;
    
    // Calculate estimated cost savings (assuming $0.01 per 1000 tokens)
    const estimatedCostPerToken = 0.01 / 1000;
    const estimatedCostSaved = this.stats.totalTokensSaved * estimatedCostPerToken;
    
    // Get top 5 tools
    const topTools = Object.entries(this.stats.toolsUsage)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([tool, count]) => ({ tool, count }));
    
    // Get top 5 queries by savings
    const topQueriesBySavings = [...this.stats.topQueries]
      .sort((a, b) => b.savingsPercent - a.savingsPercent)
      .slice(0, 5);
    
    const summary = `Optimization Statistics:
• Total Requests: ${this.stats.totalRequests.toLocaleString()}
• Total Tokens In: ${this.stats.totalTokensIn.toLocaleString()}
• Total Tokens Out: ${this.stats.totalTokensOut.toLocaleString()}
• Total Tokens Saved: ${this.stats.totalTokensSaved.toLocaleString()} (${this.stats.averageSavingsPercent.toFixed(1)}%)
• Estimated Cost Saved: $${estimatedCostSaved.toFixed(2)}
• Running Since: ${this.stats.startTime.toLocaleString()}
• Requests/Hour: ${requestsPerHour.toFixed(1)}
• Tokens Saved/Hour: ${tokensSavedPerHour.toLocaleString()}`;
    
    return {
      summary,
      details: {
        hoursRunning: hoursRunning.toFixed(1),
        requestsPerHour: requestsPerHour.toFixed(1),
        tokensSavedPerHour: Math.round(tokensSavedPerHour),
        estimatedCostSaved: estimatedCostSaved.toFixed(2),
        topTools,
        topQueriesBySavings,
        hourlyBreakdown: {
          requests: Object.entries(this.stats.requestsByHour)
            .sort(([a], [b]) => b.localeCompare(a))
            .slice(0, 24),
          savings: Object.entries(this.stats.savingsByHour)
            .sort(([a], [b]) => b.localeCompare(a))
            .slice(0, 24)
        }
      },
      raw: { ...this.stats }
    };
  }
  
  /**
   * Reset statistics (for testing or maintenance)
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      totalTokensIn: 0,
      totalTokensOut: 0,
      totalTokensSaved: 0,
      averageSavingsPercent: 0,
      requestsByHour: {},
      savingsByHour: {},
      topQueries: [],
      toolsUsage: {},
      startTime: new Date(),
      lastUpdate: new Date()
    };
    
    this.saveStats();
    this.logger.info('Optimization stats reset');
  }
  
  /**
   * Export statistics to JSON file
   */
  exportStats(exportPath: string): void {
    try {
      const exportData = {
        stats: this.stats,
        exportTime: new Date().toISOString(),
        formatted: this.getFormattedStats()
      };
      
      fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
      this.logger.info('Statistics exported', { exportPath });
    } catch (error) {
      this.logger.error('Failed to export statistics', { error, exportPath });
    }
  }
  
  /**
   * Get Winston logger instance
   */
  getLogger(): winston.Logger {
    return this.logger;
  }
}