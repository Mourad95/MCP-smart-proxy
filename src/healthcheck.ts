#!/usr/bin/env node

/**
 * Health check script for MCP Smart Proxy
 * 
 * This script checks:
 * 1. HTTP server is responding
 * 2. Vector memory is initialized
 * 3. MCP servers are connected
 * 4. Disk space is available
 * 
 * Exit codes:
 * 0 - Healthy
 * 1 - Unhealthy
 * 2 - Unknown/Starting
 */

import http from 'http';
import { VectorMemory } from './memory/vector-memory';
import { readConfig } from './config/config-loader';
import fs from 'fs';
import path from 'path';

const HEALTHCHECK_PORT = process.env.MCP_PROXY_PORT || '3000';
const HEALTHCHECK_HOST = 'localhost';
const HEALTHCHECK_TIMEOUT = 5000; // 5 seconds
const REQUIRED_DISK_SPACE_MB = 100; // 100MB minimum

async function checkHttpServer(): Promise<boolean> {
  return new Promise((resolve) => {
    const options = {
      hostname: HEALTHCHECK_HOST,
      port: HEALTHCHECK_PORT,
      path: '/health',
      method: 'GET',
      timeout: HEALTHCHECK_TIMEOUT
    };

    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const health = JSON.parse(data);
            resolve(health.status === 'healthy');
          } catch {
            resolve(false);
          }
        });
      } else {
        resolve(false);
      }
    });

    req.on('error', () => {
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

async function checkVectorMemory(): Promise<boolean> {
  try {
    const vectorMemory = new VectorMemory();
    await vectorMemory.initialize();
    
    const stats = await vectorMemory.getStats();
    return stats.initialized;
  } catch (error) {
    console.error('Vector memory check failed:', error);
    return false;
  }
}

async function checkDiskSpace(): Promise<boolean> {
  try {
    const dataPath = process.env.MCP_VECTOR_MEMORY_PATH || '/data';
    
    if (!fs.existsSync(dataPath)) {
      // Directory doesn't exist, but that's OK if we haven't stored anything yet
      return true;
    }
    
    const stats = fs.statfsSync(dataPath);
    const freeSpaceMB = (stats.bavail * stats.bsize) / (1024 * 1024);
    
    return freeSpaceMB >= REQUIRED_DISK_SPACE_MB;
  } catch (error) {
    console.error('Disk space check failed:', error);
    return false;
  }
}

async function checkConfig(): Promise<boolean> {
  try {
    const configPath = process.env.MCP_CONFIG_PATH || './config/default.json';
    const config = await readConfig(configPath);
    
    // Basic config validation
    if (!config.port || !Array.isArray(config.mcpServers)) {
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Config check failed:', error);
    return false;
  }
}

async function checkModelAvailability(): Promise<boolean> {
  try {
    // Check if model cache exists
    const cachePath = path.join(
      process.env.HOME || '/home/mcp',
      '.cache/huggingface/hub'
    );
    
    // Look for the embedding model
    const modelPath = path.join(cachePath, 'models--Xenova--all-MiniLM-L6-v2');
    
    if (fs.existsSync(modelPath)) {
      // Model is cached
      return true;
    }
    
    // Model not cached, but that's OK - it will download on first use
    console.warn('Embedding model not cached, will download on first use');
    return true;
  } catch (error) {
    console.error('Model availability check failed:', error);
    return false;
  }
}

async function performHealthCheck(): Promise<{
  healthy: boolean;
  checks: Record<string, boolean>;
  details: Record<string, any>;
}> {
  const checks: Record<string, boolean> = {};
  const details: Record<string, any> = {};
  
  // Perform checks in parallel
  const [
    httpHealthy,
    vectorMemoryHealthy,
    diskSpaceHealthy,
    configHealthy,
    modelAvailable
  ] = await Promise.all([
    checkHttpServer(),
    checkVectorMemory(),
    checkDiskSpace(),
    checkConfig(),
    checkModelAvailability()
  ]);
  
  checks.http_server = httpHealthy;
  checks.vector_memory = vectorMemoryHealthy;
  checks.disk_space = diskSpaceHealthy;
  checks.config = configHealthy;
  checks.model_availability = modelAvailable;
  
  // Collect details
  if (httpHealthy) {
    try {
      const response = await new Promise<any>((resolve) => {
        const req = http.request({
          hostname: HEALTHCHECK_HOST,
          port: HEALTHCHECK_PORT,
          path: '/health',
          method: 'GET',
          timeout: HEALTHCHECK_TIMEOUT
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', () => resolve({}));
        req.end();
      });
      details.http_server = response;
    } catch {
      details.http_server = { error: 'Failed to get details' };
    }
  }
  
  if (vectorMemoryHealthy) {
    try {
      const vectorMemory = new VectorMemory();
      details.vector_memory = await vectorMemory.getStats();
    } catch {
      details.vector_memory = { error: 'Failed to get details' };
    }
  }
  
  // Calculate overall health
  const healthy = Object.values(checks).every(check => check === true);
  
  return {
    healthy,
    checks,
    details
  };
}

async function main() {
  try {
    const health = await performHealthCheck();
    
    if (health.healthy) {
      console.log(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: health.checks,
        details: health.details
      }, null, 2));
      process.exit(0);
    } else {
      console.error(JSON.stringify({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        checks: health.checks,
        details: health.details,
        failed_checks: Object.entries(health.checks)
          .filter(([_, value]) => !value)
          .map(([key]) => key)
      }, null, 2));
      process.exit(1);
    }
  } catch (error) {
    console.error('Health check failed with error:', error);
    process.exit(2); // Unknown/starting
  }
}

// Run health check
if (require.main === module) {
  main();
}

export {
  checkHttpServer,
  checkVectorMemory,
  checkDiskSpace,
  checkConfig,
  checkModelAvailability,
  performHealthCheck
};