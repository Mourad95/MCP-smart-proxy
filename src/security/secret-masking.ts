/**
 * Secret Masking Middleware
 * 
 * Scans MCP server responses and replaces API keys, tokens,
 * and other sensitive information with [REDACTED]
 */

export class SecretMasking {
  private patterns: Array<{
    name: string;
    pattern: RegExp;
    replacement: string;
  }>;
  
  constructor() {
    // Common secret patterns
    this.patterns = [
      // API Keys (various formats)
      {
        name: 'api_key',
        pattern: /(?:api[_-]?key|apikey)[\s:=]+['"]?([a-zA-Z0-9_\-]{20,})['"]?/gi,
        replacement: '[REDACTED_API_KEY]'
      },
      {
        name: 'bearer_token',
        pattern: /Bearer\s+([a-zA-Z0-9_\-\.]{20,})/gi,
        replacement: 'Bearer [REDACTED_TOKEN]'
      },
      {
        name: 'jwt_token',
        pattern: /eyJ[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+/g,
        replacement: '[REDACTED_JWT]'
      },
      // GitHub tokens
      {
        name: 'github_token',
        pattern: /gh[pors]_[a-zA-Z0-9_]{36}/g,
        replacement: '[REDACTED_GITHUB_TOKEN]'
      },
      // OpenAI keys
      {
        name: 'openai_key',
        pattern: /sk-[a-zA-Z0-9]{48}/g,
        replacement: '[REDACTED_OPENAI_KEY]'
      },
      // AWS keys
      {
        name: 'aws_access_key',
        pattern: /AKIA[0-9A-Z]{16}/g,
        replacement: '[REDACTED_AWS_ACCESS_KEY]'
      },
      {
        name: 'aws_secret_key',
        pattern: /[a-zA-Z0-9+/]{40}/g,
        replacement: '[REDACTED_AWS_SECRET_KEY]'
      },
      // Database URLs
      {
        name: 'database_url',
        pattern: /(?:postgres|mysql|mongodb):\/\/[^:]+:[^@]+@[^\s]+/g,
        replacement: '[REDACTED_DATABASE_URL]'
      },
      // Email addresses (partial masking)
      {
        name: 'email',
        pattern: /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
        replacement: (match: string, user: string, domain: string) => 
          `${user.charAt(0)}***@${domain}`
      },
      // Credit card numbers (simplified)
      {
        name: 'credit_card',
        pattern: /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/g,
        replacement: '****-****-****-[REDACTED]'
      },
      // SSH private keys (beginning)
      {
        name: 'ssh_private_key',
        pattern: /-----BEGIN (?:RSA|DSA|EC|OPENSSH) PRIVATE KEY-----[a-zA-Z0-9+/=\s]+-----END (?:RSA|DSA|EC|OPENSSH) PRIVATE KEY-----/g,
        replacement: '[REDACTED_SSH_PRIVATE_KEY]'
      },
      // Generic tokens (catch-all for long strings that look like tokens)
      {
        name: 'generic_token',
        pattern: /\b[a-fA-F0-9]{32,}\b/g,
        replacement: '[REDACTED_TOKEN]'
      }
    ];
  }
  
  /**
   * Mask secrets in a string
   */
  maskSecrets(text: string): {
    masked: string;
    foundSecrets: Array<{ type: string; count: number }>;
  } {
    let masked = text;
    const foundSecrets: Array<{ type: string; count: number }> = [];
    
    for (const pattern of this.patterns) {
      const matches = masked.match(pattern.pattern);
      if (matches && matches.length > 0) {
        foundSecrets.push({
          type: pattern.name,
          count: matches.length
        });
        
        // Apply replacement
        if (typeof pattern.replacement === 'function') {
          masked = masked.replace(pattern.pattern, pattern.replacement as any);
        } else {
          masked = masked.replace(pattern.pattern, pattern.replacement);
        }
      }
    }
    
    return { masked, foundSecrets };
  }
  
  /**
   * Mask secrets in a JSON object (recursive)
   */
  maskSecretsInObject(obj: any): {
    masked: any;
    foundSecrets: Array<{ type: string; count: number; path?: string }>;
  } {
    const foundSecrets: Array<{ type: string; count: number; path?: string }> = [];
    
    const maskRecursive = (current: any, path: string = ''): any => {
      if (typeof current === 'string') {
        const result = this.maskSecrets(current);
        result.foundSecrets.forEach(secret => {
          foundSecrets.push({ ...secret, path });
        });
        return result.masked;
      }
      
      if (Array.isArray(current)) {
        return current.map((item, index) => 
          maskRecursive(item, `${path}[${index}]`)
        );
      }
      
      if (current !== null && typeof current === 'object') {
        const maskedObj: any = {};
        for (const key in current) {
          if (Object.prototype.hasOwnProperty.call(current, key)) {
            maskedObj[key] = maskRecursive(
              current[key],
              path ? `${path}.${key}` : key
            );
          }
        }
        return maskedObj;
      }
      
      return current;
    };
    
    const masked = maskRecursive(obj);
    return { masked, foundSecrets };
  }
  
  /**
   * Check if text contains secrets (without masking)
   */
  containsSecrets(text: string): boolean {
    for (const pattern of this.patterns) {
      if (pattern.pattern.test(text)) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Get statistics about found secrets
   */
  getSecretStats(): {
    patterns: Array<{ name: string; description: string }>;
    exampleDetections: Array<{ type: string; example: string }>;
  } {
    return {
      patterns: this.patterns.map(p => ({
        name: p.name,
        description: this.getPatternDescription(p.name)
      })),
      exampleDetections: [
        {
          type: 'api_key',
          example: 'api_key: "sk-1234567890abcdef" → [REDACTED_API_KEY]'
        },
        {
          type: 'jwt_token',
          example: 'eyJhbGciOiJIUzI1NiIs... → [REDACTED_JWT]'
        },
        {
          type: 'database_url',
          example: 'postgres://user:pass@localhost/db → [REDACTED_DATABASE_URL]'
        }
      ]
    };
  }
  
  /**
   * Get description for a pattern
   */
  private getPatternDescription(name: string): string {
    const descriptions: Record<string, string> = {
      'api_key': 'API keys and authentication tokens',
      'bearer_token': 'Bearer authentication tokens',
      'jwt_token': 'JSON Web Tokens',
      'github_token': 'GitHub personal access tokens',
      'openai_key': 'OpenAI API keys',
      'aws_access_key': 'AWS access key IDs',
      'aws_secret_key': 'AWS secret access keys',
      'database_url': 'Database connection strings with credentials',
      'email': 'Email addresses (partially masked)',
      'credit_card': 'Credit card numbers',
      'ssh_private_key': 'SSH private keys',
      'generic_token': 'Generic tokens and long hexadecimal strings'
    };
    
    return descriptions[name] || 'Unknown secret type';
  }
  
  /**
   * Create middleware function for Express
   */
  createMiddleware() {
    return (req: any, res: any, next: Function) => {
      const originalSend = res.send;
      const masking = this;
      
      res.send = function(body: any) {
        try {
          // Only mask if body is a string or object
          if (typeof body === 'string' || (body && typeof body === 'object')) {
            const { masked, foundSecrets } = masking.maskSecretsInObject(body);
            
            if (foundSecrets.length > 0) {
              // Log the secret detection (but don't log the actual secrets)
              console.warn('Secrets detected and masked in response:', {
                path: req.path,
                secretCount: foundSecrets.length,
                secretTypes: [...new Set(foundSecrets.map(s => s.type))],
                timestamp: new Date().toISOString()
              });
              
              // Add security headers
              res.set('X-Secrets-Masked', 'true');
              res.set('X-Secrets-Count', foundSecrets.length.toString());
            }
            
            body = masked;
          }
        } catch (error) {
          console.error('Error masking secrets:', error);
          // Don't fail the request if masking fails
        }
        
        return originalSend.call(this, body);
      };
      
      next();
    };
  }
}