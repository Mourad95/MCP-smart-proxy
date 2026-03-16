/**
 * Environment Variable Validator
 * 
 * Validates required environment variables and provides
 * helpful error messages if they are missing or invalid.
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

export interface EnvValidationRule {
  name: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean' | 'url' | 'port';
  defaultValue?: any;
  description: string;
  validation?: (value: string) => boolean;
  errorMessage?: string;
}

export class EnvValidator {
  private rules: EnvValidationRule[];
  private envFile: string;
  
  constructor(envFile: string = '.env') {
    this.envFile = envFile;
    
    // Default validation rules for MCP Smart Proxy
    this.rules = [
      {
        name: 'NODE_ENV',
        required: false,
        type: 'string',
        defaultValue: 'development',
        description: 'Node environment (development, production, test)',
        validation: (value) => ['development', 'production', 'test'].includes(value),
        errorMessage: 'NODE_ENV must be one of: development, production, test'
      },
      {
        name: 'MCP_PROXY_PORT',
        required: false,
        type: 'port',
        defaultValue: 3000,
        description: 'Port for the proxy server',
        validation: (value) => {
          const port = parseInt(value);
          return port > 0 && port <= 65535;
        },
        errorMessage: 'MCP_PROXY_PORT must be a valid port number (1-65535)'
      },
      {
        name: 'MCP_VECTOR_MEMORY_PATH',
        required: false,
        type: 'string',
        defaultValue: '/data/vector-index',
        description: 'Path for vector memory storage',
        validation: (value) => value.length > 0,
        errorMessage: 'MCP_VECTOR_MEMORY_PATH cannot be empty'
      },
      {
        name: 'MCP_OPTIMIZATION_ENABLED',
        required: false,
        type: 'boolean',
        defaultValue: true,
        description: 'Enable optimization features',
        validation: (value) => ['true', 'false', '1', '0'].includes(value.toLowerCase()),
        errorMessage: 'MCP_OPTIMIZATION_ENABLED must be true or false'
      },
      {
        name: 'MCP_MAX_CONTEXT_TOKENS',
        required: false,
        type: 'number',
        defaultValue: 1000,
        description: 'Maximum context tokens for optimization',
        validation: (value) => {
          const num = parseInt(value);
          return num >= 100 && num <= 10000;
        },
        errorMessage: 'MCP_MAX_CONTEXT_TOKENS must be between 100 and 10000'
      },
      {
        name: 'MCP_LOG_LEVEL',
        required: false,
        type: 'string',
        defaultValue: 'info',
        description: 'Logging level',
        validation: (value) => ['error', 'warn', 'info', 'debug'].includes(value.toLowerCase()),
        errorMessage: 'MCP_LOG_LEVEL must be one of: error, warn, info, debug'
      },
      // Security-related variables
      {
        name: 'MCP_SECRET_MASKING_ENABLED',
        required: false,
        type: 'boolean',
        defaultValue: true,
        description: 'Enable secret masking in responses',
        validation: (value) => ['true', 'false', '1', '0'].includes(value.toLowerCase()),
        errorMessage: 'MCP_SECRET_MASKING_ENABLED must be true or false'
      },
      {
        name: 'MCP_RATE_LIMIT_REQUESTS',
        required: false,
        type: 'number',
        defaultValue: 100,
        description: 'Maximum requests per minute per IP',
        validation: (value) => {
          const num = parseInt(value);
          return num >= 1 && num <= 10000;
        },
        errorMessage: 'MCP_RATE_LIMIT_REQUESTS must be between 1 and 10000'
      },
      // Optional variables (with validation if provided)
      {
        name: 'GITHUB_TOKEN',
        required: false,
        type: 'string',
        description: 'GitHub token for MCP GitHub server',
        validation: (value) => value.startsWith('ghp_') || value.startsWith('gho_') || value.startsWith('ghu_') || value.startsWith('ghs_') || value.startsWith('ghr_'),
        errorMessage: 'GITHUB_TOKEN must be a valid GitHub token'
      },
      {
        name: 'OPENAI_API_KEY',
        required: false,
        type: 'string',
        description: 'OpenAI API key (if using OpenAI embeddings)',
        validation: (value) => value.startsWith('sk-'),
        errorMessage: 'OPENAI_API_KEY must start with sk-'
      }
    ];
  }
  
  /**
   * Load and validate environment variables
   */
  validate(): {
    valid: boolean;
    errors: string[];
    warnings: string[];
    env: Record<string, string>;
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const env: Record<string, string> = {};
    
    // Try to load .env file
    this.loadEnvFile();
    
    // Validate each rule
    for (const rule of this.rules) {
      const value = process.env[rule.name];
      
      // Check if required variable is missing
      if (rule.required && (value === undefined || value === '')) {
        errors.push(`Required environment variable ${rule.name} is missing: ${rule.description}`);
        continue;
      }
      
      // Use default value if variable is not set
      if (value === undefined || value === '') {
        if (rule.defaultValue !== undefined) {
          env[rule.name] = rule.defaultValue.toString();
          process.env[rule.name] = rule.defaultValue.toString();
        }
        continue;
      }
      
      // Validate type
      let isValid = true;
      let validationError = '';
      
      switch (rule.type) {
        case 'number':
          if (isNaN(Number(value))) {
            isValid = false;
            validationError = `must be a number, got: ${value}`;
          }
          break;
          
        case 'boolean':
          const lowerValue = value.toLowerCase();
          if (!['true', 'false', '1', '0', 'yes', 'no'].includes(lowerValue)) {
            isValid = false;
            validationError = `must be a boolean (true/false), got: ${value}`;
          }
          break;
          
        case 'port':
          const port = parseInt(value);
          if (isNaN(port) || port < 1 || port > 65535) {
            isValid = false;
            validationError = `must be a valid port (1-65535), got: ${value}`;
          }
          break;
          
        case 'url':
          try {
            new URL(value);
          } catch {
            isValid = false;
            validationError = `must be a valid URL, got: ${value}`;
          }
          break;
      }
      
      // Run custom validation if provided
      if (isValid && rule.validation) {
        try {
          if (!rule.validation(value)) {
            isValid = false;
            validationError = rule.errorMessage || 'failed custom validation';
          }
        } catch (error) {
          isValid = false;
          validationError = `validation error: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
      
      if (!isValid) {
        errors.push(`Environment variable ${rule.name} ${validationError}`);
      } else {
        env[rule.name] = value;
      }
    }
    
    // Check for unknown variables (potential typos)
    const knownVars = new Set(this.rules.map(r => r.name));
    const allEnvVars = Object.keys(process.env);
    
    for (const envVar of allEnvVars) {
      if (envVar.startsWith('MCP_') && !knownVars.has(envVar)) {
        warnings.push(`Unknown MCP environment variable: ${envVar} (might be a typo)`);
      }
    }
    
    // Validate that required directories exist
    if (env.MCP_VECTOR_MEMORY_PATH) {
      const dir = path.dirname(env.MCP_VECTOR_MEMORY_PATH);
      try {
        if (!fs.existsSync(dir)) {
          warnings.push(`Directory does not exist: ${dir}. It will be created on first use.`);
        }
      } catch (error) {
        warnings.push(`Cannot access directory ${dir}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      env
    };
  }
  
  /**
   * Load environment file
   */
  private loadEnvFile(): void {
    const envPaths = [
      path.join(process.cwd(), this.envFile),
      path.join(process.cwd(), '.env.production'),
      path.join(process.cwd(), '.env.development'),
      path.join(process.cwd(), '.env.local')
    ];
    
    let loaded = false;
    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        try {
          dotenv.config({ path: envPath });
          console.log(`Loaded environment file: ${envPath}`);
          loaded = true;
          break;
        } catch (error) {
          console.warn(`Failed to load environment file ${envPath}:`, error);
        }
      }
    }
    
    if (!loaded && fs.existsSync(path.join(process.cwd(), '.env'))) {
      console.warn('No environment file loaded, using system environment variables');
    }
  }
  
  /**
   * Generate .env template file
   */
  generateEnvTemplate(outputPath: string = '.env.example'): void {
    const lines = [
      '# MCP Smart Proxy Environment Variables',
      '# Copy this file to .env and fill in the values',
      ''
    ];
    
    // Group variables by category
    const categories: Record<string, EnvValidationRule[]> = {
      'Core Configuration': this.rules.filter(r => 
        r.name.startsWith('MCP_') && 
        !r.name.includes('SECRET') && 
        !r.name.includes('TOKEN') && 
        !r.name.includes('KEY')
      ),
      'Security': this.rules.filter(r => 
        r.name.includes('SECRET') || 
        r.name.includes('RATE_LIMIT')
      ),
      'API Keys & Tokens': this.rules.filter(r => 
        r.name.includes('TOKEN') || 
        r.name.includes('KEY') ||
        r.name === 'GITHUB_TOKEN' ||
        r.name === 'OPENAI_API_KEY'
      )
    };
    
    for (const [category, rules] of Object.entries(categories)) {
      if (rules.length > 0) {
        lines.push(`# ${category}`);
        lines.push('');
        
        for (const rule of rules) {
          lines.push(`# ${rule.description}`);
          if (rule.defaultValue !== undefined) {
            lines.push(`# Default: ${rule.defaultValue}`);
          }
          if (rule.required) {
            lines.push(`# REQUIRED`);
          }
          
          let example = '';
          switch (rule.name) {
            case 'GITHUB_TOKEN':
              example = 'ghp_xxxxxxxxxxxxxxxxxxxx';
              break;
            case 'OPENAI_API_KEY':
              example = 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
              break;
            case 'MCP_PROXY_PORT':
              example = '3000';
              break;
            default:
              example = rule.defaultValue !== undefined ? rule.defaultValue.toString() : '';
          }
          
          lines.push(`${rule.name}=${example}`);
          lines.push('');
        }
      }
    }
    
    try {
      fs.writeFileSync(outputPath, lines.join('\n'));
      console.log(`Generated environment template: ${outputPath}`);
    } catch (error) {
      console.error(`Failed to generate environment template:`, error);
    }
  }
  
  /**
   * Get validation rules
   */
  getRules(): EnvValidationRule[] {
    return [...this.rules];
  }
  
  /**
   * Add custom validation rule
   */
  addRule(rule: EnvValidationRule): void {
    this.rules.push(rule);
  }
}