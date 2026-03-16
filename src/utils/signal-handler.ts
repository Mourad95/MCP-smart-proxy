/**
 * Signal Handler for Graceful Shutdown
 * 
 * Handles SIGTERM, SIGINT, and other signals to ensure
 * proper cleanup and data persistence before shutdown.
 */

import { VectorMemory } from '../memory/vector-memory';
import { OptimizationStatsManager } from '../analytics/optimization-stats';
import fs from 'fs';
import path from 'path';

export interface ShutdownHandlerOptions {
  vectorMemory?: VectorMemory;
  statsManager?: OptimizationStatsManager;
  cleanupTasks?: Array<{
    name: string;
    task: () => Promise<void> | void;
    timeout?: number;
  }>;
  shutdownTimeout?: number;
  dataBackupPath?: string;
}

export class SignalHandler {
  private isShuttingDown = false;
  private vectorMemory?: VectorMemory;
  private statsManager?: OptimizationStatsManager;
  private cleanupTasks: Array<{
    name: string;
    task: () => Promise<void> | void;
    timeout: number;
  }>;
  private shutdownTimeout: number;
  private dataBackupPath?: string;
  
  constructor(options: ShutdownHandlerOptions = {}) {
    this.vectorMemory = options.vectorMemory;
    this.statsManager = options.statsManager;
    this.shutdownTimeout = options.shutdownTimeout || 30000; // 30 seconds default
    this.dataBackupPath = options.dataBackupPath;
    
    this.cleanupTasks = [
      {
        name: 'vector_memory_backup',
        task: () => this.backupVectorMemory(),
        timeout: 10000 // 10 seconds
      },
      {
        name: 'stats_save',
        task: () => this.saveStatistics(),
        timeout: 5000 // 5 seconds
      },
      ...(options.cleanupTasks || []).map(t => ({
        name: t.name,
        task: t.task,
        timeout: t.timeout || 5000
      }))
    ];
  }
  
  /**
   * Initialize signal handlers
   */
  initialize(): void {
    console.log('Initializing signal handlers for graceful shutdown...');
    
    // SIGTERM - Termination signal (Docker stop, Kubernetes, etc.)
    process.on('SIGTERM', () => {
      console.log('Received SIGTERM signal, initiating graceful shutdown...');
      this.handleShutdown('SIGTERM');
    });
    
    // SIGINT - Interrupt signal (Ctrl+C)
    process.on('SIGINT', () => {
      console.log('Received SIGINT signal, initiating graceful shutdown...');
      this.handleShutdown('SIGINT');
    });
    
    // SIGUSR2 - Custom signal for debugging
    process.on('SIGUSR2', () => {
      console.log('Received SIGUSR2 signal, dumping debug information...');
      this.dumpDebugInfo();
    });
    
    // Uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      this.handleShutdown('uncaughtException', error);
    });
    
    // Unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled promise rejection:', reason);
      console.error('Promise:', promise);
      this.handleShutdown('unhandledRejection', reason);
    });
    
    console.log('Signal handlers initialized');
  }
  
  /**
   * Handle shutdown process
   */
  private async handleShutdown(signal: string, error?: any): Promise<void> {
    if (this.isShuttingDown) {
      console.log('Shutdown already in progress, ignoring signal:', signal);
      return;
    }
    
    this.isShuttingDown = true;
    
    console.log(`Initiating graceful shutdown due to: ${signal}`);
    
    if (error) {
      console.error('Error that triggered shutdown:', error);
    }
    
    try {
      // Execute cleanup tasks with timeout protection
      await this.executeCleanupTasks();
      
      console.log('Cleanup completed successfully');
      
      // Exit with appropriate code
      const exitCode = error ? 1 : 0;
      console.log(`Exiting with code ${exitCode}`);
      process.exit(exitCode);
      
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
      console.log('Forcing exit due to cleanup failure');
      process.exit(1);
    }
  }
  
  /**
   * Execute all cleanup tasks with timeout protection
   */
  private async executeCleanupTasks(): Promise<void> {
    const tasks = [...this.cleanupTasks];
    
    for (const task of tasks) {
      try {
        console.log(`Executing cleanup task: ${task.name}`);
        
        // Execute task with timeout
        await Promise.race([
          Promise.resolve(task.task()),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Task ${task.name} timeout`)), task.timeout)
          )
        ]);
        
        console.log(`Cleanup task completed: ${task.name}`);
        
      } catch (taskError) {
        console.error(`Cleanup task failed: ${task.name}`, taskError);
        // Continue with other tasks even if one fails
      }
    }
  }
  
  /**
   * Backup vector memory to disk
   */
  private async backupVectorMemory(): Promise<void> {
    if (!this.vectorMemory) {
      console.log('No vector memory instance provided, skipping backup');
      return;
    }
    
    try {
      console.log('Starting vector memory backup...');
      
      // Get vector memory stats
      const stats = await this.vectorMemory.getStats();
      console.log('Vector memory stats:', stats);
      
      // Export vector memory if it has data
      if (stats.estimatedItems > 0) {
        const exportData = await this.vectorMemory.exportItems(1000);
        console.log(`Exported ${exportData.count} vector items`);
        
        // Save backup if backup path is provided
        if (this.dataBackupPath) {
          const backupFile = path.join(
            this.dataBackupPath,
            `vector-backup-${Date.now()}.json`
          );
          
          fs.writeFileSync(backupFile, JSON.stringify(exportData, null, 2));
          console.log(`Vector memory backup saved to: ${backupFile}`);
        }
      } else {
        console.log('Vector memory is empty, skipping backup');
      }
      
      console.log('Vector memory backup completed');
      
    } catch (error) {
      console.error('Vector memory backup failed:', error);
      throw error;
    }
  }
  
  /**
   * Save statistics before shutdown
   */
  private async saveStatistics(): Promise<void> {
    if (!this.statsManager) {
      console.log('No stats manager instance provided, skipping stats save');
      return;
    }
    
    try {
      console.log('Saving optimization statistics...');
      
      // Get current stats
      const stats = this.statsManager.getFormattedStats();
      console.log('Current optimization stats:', {
        totalRequests: stats.raw.totalRequests,
        totalTokensSaved: stats.raw.totalTokensSaved,
        averageSavingsPercent: stats.raw.averageSavingsPercent
      });
      
      // Export stats to backup file
      if (this.dataBackupPath) {
        const backupFile = path.join(
          this.dataBackupPath,
          `stats-backup-${Date.now()}.json`
        );
        
        this.statsManager.exportStats(backupFile);
        console.log(`Statistics backup saved to: ${backupFile}`);
      }
      
      console.log('Statistics save completed');
      
    } catch (error) {
      console.error('Statistics save failed:', error);
      throw error;
    }
  }
  
  /**
   * Dump debug information (for SIGUSR2)
   */
  private dumpDebugInfo(): void {
    console.log('=== DEBUG INFORMATION ===');
    console.log('Process ID:', process.pid);
    console.log('Node version:', process.version);
    console.log('Platform:', process.platform);
    console.log('Architecture:', process.arch);
    console.log('Uptime:', process.uptime(), 'seconds');
    console.log('Memory usage:', process.memoryUsage());
    console.log('Environment:', process.env.NODE_ENV || 'not set');
    console.log('Shutdown in progress:', this.isShuttingDown);
    console.log('=========================');
  }
  
  /**
   * Add custom cleanup task
   */
  addCleanupTask(name: string, task: () => Promise<void> | void, timeout: number = 5000): void {
    this.cleanupTasks.push({ name, task, timeout });
  }
  
  /**
   * Check if shutdown is in progress
   */
  isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }
  
  /**
   * Create a shutdown handler for Docker containers
   */
  static createForDocker(options: Omit<ShutdownHandlerOptions, 'dataBackupPath'> = {}): SignalHandler {
    // In Docker, backup to /data directory
    const dataBackupPath = '/data/backups';
    
    // Ensure backup directory exists
    try {
      if (!fs.existsSync(dataBackupPath)) {
        fs.mkdirSync(dataBackupPath, { recursive: true });
      }
    } catch (error) {
      console.warn(`Could not create backup directory ${dataBackupPath}:`, error);
    }
    
    return new SignalHandler({
      ...options,
      dataBackupPath,
      shutdownTimeout: 30000 // Docker gives 30 seconds by default
    });
  }
}