/**
 * Secret masking: detect and redact sensitive data in MCP responses.
 * Used before sending responses to clients to avoid leaking API keys, tokens, DB URLs, etc.
 */

import type { MCPResponse } from '../types/mcp-types';

export type SecretType =
  | 'api_key'
  | 'jwt_token'
  | 'bearer_token'
  | 'database_url'
  | 'email'
  | 'credit_card'
  | 'ssh_private_key'
  | 'generic_secret';

export interface MaskResult {
  masked: MCPResponse;
  secretsDetected: number;
  secretTypes: SecretType[];
}

/** Placeholders used when redacting (aligned with SECURITY.md) */
const REDACT = {
  api_key: '[REDACTED_API_KEY]',
  jwt_token: '[REDACTED_JWT]',
  bearer_token: '[REDACTED_BEARER_TOKEN]',
  database_url: '[REDACTED_DATABASE_URL]',
  email: '[REDACTED_EMAIL]',
  credit_card: '[REDACTED_CARD]',
  ssh_private_key: '[REDACTED_PRIVATE_KEY]',
  generic_secret: '[REDACTED]'
} as const;

/** Regexes and their secret type. Order matters: more specific first. */
const PATTERNS: Array<{ type: SecretType; regex: RegExp; replacement: string }> = [
  // SSH private key block (multiline)
  {
    type: 'ssh_private_key',
    regex: /-----BEGIN [A-Z\s]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z\s]+ PRIVATE KEY-----/g,
    replacement: REDACT.ssh_private_key
  },
  // Bearer token (before generic token to avoid double-tagging)
  {
    type: 'bearer_token',
    regex: /Bearer\s+[^\s"']+/gi,
    replacement: `Bearer ${REDACT.bearer_token}`
  },
  // JWT (xxx.yyy.zzz)
  {
    type: 'jwt_token',
    regex: /\b(eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g,
    replacement: REDACT.jwt_token
  },
  // Database URLs with credentials (postgres://, mysql://, mongodb://, redis://)
  {
    type: 'database_url',
    regex:
      /(postgres|postgresql|mysql|mongodb|redis):\/\/[^:\s]+:[^@\s]+@[^\s'")\]]+/gi,
    replacement: REDACT.database_url
  },
  // API key patterns
  { type: 'api_key', regex: /\bsk-[a-zA-Z0-9]{20,}\b/g, replacement: REDACT.api_key },
  { type: 'api_key', regex: /\bAKIA[A-Z0-9]{16}\b/g, replacement: REDACT.api_key },
  { type: 'api_key', regex: /\bghp_[a-zA-Z0-9]{36}\b/g, replacement: REDACT.api_key },
  { type: 'api_key', regex: /\bgho_[a-zA-Z0-9]{36}\b/g, replacement: REDACT.api_key },
  { type: 'api_key', regex: /\bglpat-[a-zA-Z0-9\-]{20,}\b/g, replacement: REDACT.api_key },
  // Email (partial mask: keep first char and domain)
  {
    type: 'email',
    regex: /\b([a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
    replacement: `$1***@$2`
  },
  // Credit card (simple 4x4 digits; may have spaces/dashes)
  {
    type: 'credit_card',
    regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    replacement: REDACT.credit_card
  }
];

export class SecretMasking {
  /**
   * Mask a string: apply all patterns and return masked string + set of detected secret types.
   */
  maskString(value: string): { masked: string; types: Set<SecretType> } {
    let masked = value;
    const types = new Set<SecretType>();

    for (const { type, regex, replacement } of PATTERNS) {
      const before = masked;
      // Use string replacement so $1, $2 etc. work for capture groups (e.g. email)
      masked = masked.replace(regex, replacement);
      if (masked !== before) {
        types.add(type);
      }
    }

    return { masked, types };
  }

  /**
   * Recursively mask all string values in a JSON-serializable object.
   * Returns deep clone with strings masked and stats.
   */
  maskObject(obj: unknown): { masked: unknown; secretsDetected: number; secretTypes: SecretType[] } {
    const allTypes = new Set<SecretType>();
    let count = 0;

    function visit(val: unknown): unknown {
      if (val === null || val === undefined) {
        return val;
      }
      if (typeof val === 'string') {
        const { masked, types } = this.maskString(val);
        types.forEach((t) => allTypes.add(t));
        if (types.size > 0) count += 1;
        return masked;
      }
      if (Array.isArray(val)) {
        return val.map((item) => visit.call(this, item));
      }
      if (typeof val === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(val)) {
          out[k] = visit.call(this, v);
        }
        return out;
      }
      return val;
    }

    const masked = visit.call(this, obj) as unknown;
    return {
      masked,
      secretsDetected: count,
      secretTypes: Array.from(allTypes)
    };
  }

  /**
   * Mask an MCP response before sending to client.
   */
  maskResponse(response: MCPResponse): MaskResult {
    const { masked, secretsDetected, secretTypes } = this.maskObject(response);
    return {
      masked: masked as MCPResponse,
      secretsDetected,
      secretTypes
    };
  }
}
