import * as fs from 'fs';
import * as path from 'path';
import { ProxyConfig } from '../types/mcp-types';

/**
 * Configuration loader and validator for MCP Smart Proxy
 */

const DEFAULT_CONFIG: ProxyConfig = {
  port: 3000,
  mcpServers: [
    {
      name: 'example-filesystem',
      url: 'http://localhost:8080',
      description: 'Example filesystem server',
      priority: 1,
      enabled: true,
      timeout: 30000
    },
    {
      name: 'example-github',
      url: 'http://localhost:8081',
      description: 'Example GitHub server',
      priority: 2,
      enabled: true,
      timeout: 30000
    }
  ],
  optimization: {
    enabled: true,
    maxContextTokens: 1000,
    embeddingModel: 'Xenova/all-MiniLM-L6-v2',
    cacheEnabled: true,
    semanticRouting: true,
    minRelevanceScore: 0.3
  },
  logging: {
    level: 'info',
    format: 'text'
  },
  analytics: {
    enabled: true,
    retentionDays: 30,
    dashboardEnabled: true
  }
};

/**
 * Read configuration from file or use defaults
 */
export async function readConfig(configPath: string): Promise<ProxyConfig> {
  try {
    const fullPath = path.resolve(configPath);
    
    if (!fs.existsSync(fullPath)) {
      console.warn(`⚠️  Config file not found: ${fullPath}, using defaults`);
      
      // Create directory if it doesn't exist
      const configDir = path.dirname(fullPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      // Write default config
      fs.writeFileSync(fullPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
      console.log(`📝 Created default config at: ${fullPath}`);
      
      return { ...DEFAULT_CONFIG };
    }
    
    const configContent = fs.readFileSync(fullPath, 'utf-8');
    const config = JSON.parse(configContent);
    
    // Merge with defaults to ensure all properties exist
    return {
      ...DEFAULT_CONFIG,
      ...config,
      optimization: {
        ...DEFAULT_CONFIG.optimization,
        ...config.optimization
      },
      logging: {
        ...DEFAULT_CONFIG.logging,
        ...config.logging
      },
      analytics: {
        ...DEFAULT_CONFIG.analytics,
        ...config.analytics
      }
    };
    
  } catch (error) {
    console.error(`❌ Error reading config from ${configPath}:`, error);
    console.log('🔄 Using default configuration');
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Validate configuration
 */
export function validateConfig(config: ProxyConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  // Validate port
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    errors.push(`Invalid port: ${config.port}. Must be between 1 and 65535.`);
  }
  
  // Validate MCP servers
  if (!Array.isArray(config.mcpServers)) {
    errors.push('mcpServers must be an array');
  } else {
    config.mcpServers.forEach((server, index) => {
      if (!server.name || typeof server.name !== 'string') {
        errors.push(`Server ${index}: name is required and must be a string`);
      }
      
      if (!server.url || typeof server.url !== 'string') {
        errors.push(`Server ${index}: url is required and must be a string`);
      } else {
        try {
          new URL(server.url);
        } catch {
          errors.push(`Server ${index}: invalid URL format: ${server.url}`);
        }
      }
      
      if (server.priority !== undefined && (!Number.isInteger(server.priority) || server.priority < 0)) {
        errors.push(`Server ${index}: priority must be a positive integer`);
      }
      
      if (server.timeout !== undefined && (!Number.isInteger(server.timeout) || server.timeout < 0)) {
        errors.push(`Server ${index}: timeout must be a positive integer`);
      }
    });
  }
  
  // Validate optimization settings
  if (config.optimization.enabled) {
    if (!Number.isInteger(config.optimization.maxContextTokens) || config.optimization.maxContextTokens < 100) {
      errors.push(`maxContextTokens must be an integer >= 100, got: ${config.optimization.maxContextTokens}`);
    }
    
    if (config.optimization.minRelevanceScore < 0 || config.optimization.minRelevanceScore > 1) {
      errors.push(`minRelevanceScore must be between 0 and 1, got: ${config.optimization.minRelevanceScore}`);
    }
  }
  
  // Validate logging
  const validLogLevels = ['debug', 'info', 'warn', 'error'];
  if (!validLogLevels.includes(config.logging.level)) {
    errors.push(`Invalid log level: ${config.logging.level}. Must be one of: ${validLogLevels.join(', ')}`);
  }
  
  const validLogFormats = ['json', 'text'];
  if (!validLogFormats.includes(config.logging.format)) {
    errors.push(`Invalid log format: ${config.logging.format}. Must be one of: ${validLogFormats.join(', ')}`);
  }
  
  // Validate analytics
  if (!Number.isInteger(config.analytics.retentionDays) || config.analytics.retentionDays < 1) {
    errors.push(`retentionDays must be a positive integer, got: ${config.analytics.retentionDays}`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Generate configuration template
 */
export function generateConfigTemplate(): string {
  return JSON.stringify(DEFAULT_CONFIG, null, 2);
}

/**
 * Save configuration to file
 */
export function saveConfig(config: ProxyConfig, configPath: string): void {
  try {
    const fullPath = path.resolve(configPath);
    const configDir = path.dirname(fullPath);
    
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    fs.writeFileSync(fullPath, JSON.stringify(config, null, 2));
    console.log(`✅ Configuration saved to: ${fullPath}`);
  } catch (error) {
    console.error(`❌ Error saving config to ${configPath}:`, error);
    throw error;
  }
}