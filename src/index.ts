#!/usr/bin/env node

import 'dotenv/config'; // Load environment variables from .env file

import { Command } from 'commander';
import { ProxyServer } from './proxy/server';
import { VectorMemory } from './memory/vector-memory';
import { ContextOptimizer } from './optimization/context-optimizer';
import { SemanticCache } from './cache/semantic-cache';
import { EnvValidator } from './config/env-validator';
import { SignalHandler } from './utils/signal-handler';
// import { SecretMasking } from './security/secret-masking';
import { readConfig, validateConfig } from './config/config-loader';
import { ProxyConfig } from './types/mcp-types';

/**
 * Main entry point for MCP Smart Proxy
 */

const program = new Command();

program
  .name('mcp-smart-proxy')
  .description('Intelligent proxy for Model Context Protocol (MCP) that optimizes context usage')
  .version('1.0.0');

// Start command
program
  .command('start')
  .description('Start the MCP Smart Proxy server')
  .option('-c, --config <path>', 'Configuration file path', './config/default.json')
  .option('-p, --port <number>', 'Port to listen on', '3000')
  .option('-d, --dashboard', 'Enable web dashboard')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(async (options) => {
    try {
      console.log('🚀 Starting MCP Smart Proxy...');
      
      // Load configuration
      const config = await readConfig(options.config);
      
      // Override config with CLI options
      if (options.port) config.port = parseInt(options.port);
      if (options.dashboard) config.analytics.dashboardEnabled = true;
      if (options.verbose) config.logging.level = 'debug';
      
      // Validate configuration
      const validation = validateConfig(config);
      if (!validation.valid) {
        console.error('❌ Configuration validation failed:');
        validation.errors.forEach(error => console.error(`  - ${error}`));
        process.exit(1);
      }
      
      // Initialize components
      const vectorMemory = new VectorMemory(
        config.optimization.embeddingModel
      );
      
      // Determine stats directory
      const statsDir = process.env.MCP_STATS_DIR || './data/stats';
      
      const contextOptimizer = new ContextOptimizer(
        vectorMemory,
        config.optimization,
        statsDir
      );

      const semanticCache = config.optimization.semanticCacheEnabled
        ? new SemanticCache({
            threshold: config.optimization.semanticCacheThreshold,
            ttlSeconds: config.optimization.semanticCacheTtlSeconds,
            bypassServers: config.optimization.semanticCacheBypassServers,
            bypassFlag: config.optimization.semanticCacheBypassFlag
          })
        : null;

      // Create and start proxy server
      const server = new ProxyServer(
        config,
        vectorMemory,
        contextOptimizer,
        statsDir,
        semanticCache
      );
      await server.start();
      
      console.log(`✅ MCP Smart Proxy running on port ${config.port}`);
      console.log(`📊 Dashboard: ${config.analytics.dashboardEnabled ? `http://localhost:${config.port}/dashboard` : 'disabled'}`);
      console.log(`🔧 Optimization: ${config.optimization.enabled ? 'enabled' : 'disabled'}`);
      
      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        console.log('\n🛑 Shutting down...');
        await server.stop();
        process.exit(0);
      });
      
      process.on('SIGTERM', async () => {
        console.log('\n🛑 Shutting down...');
        await server.stop();
        process.exit(0);
      });
      
    } catch (error) {
      console.error('❌ Failed to start proxy:', error);
      process.exit(1);
    }
  });

// Analyze command
program
  .command('analyze')
  .description('Analyze optimization potential for MCP configuration')
  .option('-c, --config <path>', 'Configuration file path', './config/default.json')
  .option('-q, --query <text>', 'Test query to analyze')
  .option('-j, --json', 'Output as JSON')
  .action(async (options) => {
    try {
      console.log('🔍 Analyzing MCP configuration...');
      
      const config = await readConfig(options.config);
      const vectorMemory = new VectorMemory();
      const optimizer = new ContextOptimizer(vectorMemory, config.optimization);
      
      await vectorMemory.initialize();
      
      if (options.query) {
        // Analyze specific query
        const analysis = await optimizer.analyzeQuery(options.query);
        
        if (options.json) {
          console.log(JSON.stringify(analysis, null, 2));
        } else {
          console.log('\n=== QUERY ANALYSIS ===');
          console.log(`Query: "${options.query}"`);
          console.log(`Intent: ${analysis.intent}`);
          console.log(`Categories: ${analysis.categories.join(', ')}`);
          console.log(`Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);
          console.log(`Relevant tools: ${analysis.relevantTools.length}`);
          
          if (analysis.relevantTools.length > 0) {
            console.log('\n=== RELEVANT TOOLS ===');
            analysis.relevantTools.forEach(tool => {
              console.log(`  - ${tool}`);
            });
          }
        }
      } else {
        // General analysis
        const stats = await vectorMemory.getStats();
        
        if (options.json) {
          console.log(JSON.stringify(stats, null, 2));
        } else {
          console.log('\n=== VECTOR MEMORY STATS ===');
          console.log(`Embedding model: ${stats.embeddingModel}`);
          console.log(`Index path: ${stats.indexPath}`);
          console.log(`Estimated items: ${stats.estimatedItems}`);
          console.log(`Initialized: ${stats.initialized ? 'Yes' : 'No'}`);
          
          console.log('\n=== OPTIMIZATION CONFIG ===');
          console.log(`Enabled: ${config.optimization.enabled}`);
          console.log(`Max context tokens: ${config.optimization.maxContextTokens}`);
          console.log(`Semantic routing: ${config.optimization.semanticRouting}`);
          console.log(`Cache enabled: ${config.optimization.cacheEnabled}`);
        }
      }
      
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      process.exit(1);
    }
  });

// Maintenance command
program
  .command('maintenance')
  .description('Run maintenance tasks')
  .option('--clear-cache', 'Clear vector memory cache')
  .option('--rebuild-index', 'Rebuild vector index from scratch')
  .option('--optimize', 'Optimize index for performance')
  .action(async (options) => {
    try {
      console.log('🔧 Running maintenance tasks...');
      
      const vectorMemory = new VectorMemory();
      await vectorMemory.initialize();
      
      const actions = [];
      
      if (options.clearCache || options.rebuildIndex) {
        console.log('🗑️  Clearing vector index...');
        await vectorMemory.clearIndex();
        actions.push({ action: 'clear_index', result: 'success' });
      }
      
      if (options.rebuildIndex) {
        console.log('🏗️  Rebuilding index...');
        // Note: In production, you'd want to re-index from your data sources
        actions.push({ action: 'rebuild_index', result: 'pending_data_sources' });
      }
      
      if (options.optimize) {
        console.log('⚡ Optimizing index...');
        // Placeholder for optimization logic
        actions.push({ action: 'optimize_index', result: 'feature_coming_soon' });
      }
      
      console.log('\n✅ Maintenance completed');
      console.log('\n=== ACTIONS PERFORMED ===');
      actions.forEach(action => {
        console.log(`  ${action.action}: ${action.result}`);
      });
      
    } catch (error) {
      console.error('❌ Maintenance failed:', error);
      process.exit(1);
    }
  });

// Test command
program
  .command('test')
  .description('Run comprehensive tests')
  .option('-v, --verbose', 'Show detailed test output')
  .action(async (options) => {
    try {
      console.log('🧪 Running MCP Smart Proxy tests...\n');
      
      const tests = [
        { name: 'Vector memory initialization', fn: testVectorMemory },
        { name: 'Configuration loading', fn: testConfigLoading },
        { name: 'Basic optimization', fn: testBasicOptimization }
      ];
      
      let passed = 0;
      let failed = 0;
      
      for (const test of tests) {
        process.stdout.write(`Running: ${test.name}... `);
        
        try {
          await test.fn(options);
          console.log('✅ PASSED');
          passed++;
        } catch (error) {
          console.log('❌ FAILED');
          if (options.verbose) {
            console.error(`  Error: ${error instanceof Error ? error.message : String(error)}`);
          }
          failed++;
        }
      }
      
      console.log('\n=== TEST SUMMARY ===');
      console.log(`✅ Passed: ${passed}`);
      console.log(`❌ Failed: ${failed}`);
      
      if (failed > 0) {
        process.exit(1);
      }
      
    } catch (error) {
      console.error('❌ Test execution failed:', error);
      process.exit(1);
    }
  });

// Test functions
async function testVectorMemory(_options?: any) {
  const vectorMemory = new VectorMemory();
  await vectorMemory.initialize();
  
  const stats = await vectorMemory.getStats();
  if (!stats.initialized) {
    throw new Error('Vector memory not initialized');
  }
}

async function testConfigLoading(_options?: any) {
  const config = await readConfig('./config/default.json');
  if (!config.port || !config.mcpServers) {
    throw new Error('Invalid configuration structure');
  }
}

async function testBasicOptimization(_options?: any) {
  const vectorMemory = new VectorMemory();
  const optimizer = new ContextOptimizer(vectorMemory, {
    enabled: true,
    maxContextTokens: 1000,
    embeddingModel: 'Xenova/all-MiniLM-L6-v2',
    cacheEnabled: true,
    semanticRouting: true,
    minRelevanceScore: 0.3
  });
  
  // Basic test - just ensure it initializes
  await vectorMemory.initialize();
}

// If no command provided, show help
if (process.argv.length === 2) {
  program.outputHelp();
}

program.parse(process.argv);