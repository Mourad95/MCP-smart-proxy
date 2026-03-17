import { SecretMasking } from '../secret-masking';
import type { MCPResponse } from '../../types/mcp-types';

describe('SecretMasking', () => {
  let masking: SecretMasking;

  beforeEach(() => {
    masking = new SecretMasking();
  });

  describe('maskString', () => {
    it('leaves safe text unchanged', () => {
      const text = 'Hello world, no secrets here.';
      const { masked, types } = masking.maskString(text);
      expect(masked).toBe(text);
      expect(types.size).toBe(0);
    });

    it('masks OpenAI-style API key (sk-...)', () => {
      const text = 'Use key sk-1234567890abcdefghijklmnop';
      const { masked, types } = masking.maskString(text);
      expect(masked).toContain('[REDACTED_API_KEY]');
      expect(masked).not.toContain('sk-1234567890');
      expect(types.has('api_key')).toBe(true);
    });

    it('masks AWS access key (AKIA...)', () => {
      const text = 'AKIAIOSFODNN7EXAMPLE';
      const { masked, types } = masking.maskString(text);
      expect(masked).toBe('[REDACTED_API_KEY]');
      expect(types.has('api_key')).toBe(true);
    });

    it('masks GitHub personal access token (ghp_...)', () => {
      // ghp_ + exactly 36 alphanumeric chars per pattern
      const text = 'token ghp_abcdefghijklmnopqrstuvwxyz1234567890';
      const { masked } = masking.maskString(text);
      expect(masked).toContain('[REDACTED_API_KEY]');
      expect(masked).not.toContain('ghp_abcdef');
    });

    it('masks Bearer token', () => {
      const text = 'Authorization: Bearer secret_token_xyz_123';
      const { masked, types } = masking.maskString(text);
      expect(masked).toContain('Bearer [REDACTED_BEARER_TOKEN]');
      expect(masked).not.toContain('secret_token_xyz');
      expect(types.has('bearer_token')).toBe(true);
    });

    it('masks JWT', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const { masked, types } = masking.maskString(jwt);
      expect(masked).toBe('[REDACTED_JWT]');
      expect(types.has('jwt_token')).toBe(true);
    });

    it('masks database URL with credentials', () => {
      const text = 'Connect via postgres://user:secretpass@localhost:5432/mydb';
      const { masked, types } = masking.maskString(text);
      expect(masked).toContain('[REDACTED_DATABASE_URL]');
      expect(masked).not.toContain('secretpass');
      expect(types.has('database_url')).toBe(true);
    });

    it('masks MongoDB URL', () => {
      const text = 'mongodb://admin:pwd123@host.example.com:27017/db';
      const { masked } = masking.maskString(text);
      expect(masked).toContain('[REDACTED_DATABASE_URL]');
      expect(masked).not.toContain('pwd123');
    });

    it('masks email with partial redaction', () => {
      const text = 'Contact john.doe@example.com for help';
      const { masked, types } = masking.maskString(text);
      // First char + *** + @ + domain (e.g. j***@example.com)
      expect(masked).toMatch(/j\*\*\*@example\.com/);
      expect(masked).not.toContain('john.doe');
      expect(types.has('email')).toBe(true);
    });

    it('masks credit card number (4x4 digits)', () => {
      const text = 'Card 4111 1111 1111 1111';
      const { masked, types } = masking.maskString(text);
      expect(masked).toContain('[REDACTED_CARD]');
      expect(masked).not.toContain('4111');
      expect(types.has('credit_card')).toBe(true);
    });

    it('masks credit card with dashes', () => {
      const text = '4111-1111-1111-1111';
      const { masked } = masking.maskString(text);
      expect(masked).toBe('[REDACTED_CARD]');
    });

    it('masks SSH private key block', () => {
      const text = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA...
-----END RSA PRIVATE KEY-----`;
      const { masked, types } = masking.maskString(text);
      expect(masked).toBe('[REDACTED_PRIVATE_KEY]');
      expect(types.has('ssh_private_key')).toBe(true);
    });

    it('masks multiple secrets in one string', () => {
      const text = 'Key: sk-abcdef123456789012345678901234 and postgres://u:p@host/db';
      const { masked, types } = masking.maskString(text);
      expect(masked).toContain('[REDACTED_API_KEY]');
      expect(masked).toContain('[REDACTED_DATABASE_URL]');
      expect(types.has('api_key')).toBe(true);
      expect(types.has('database_url')).toBe(true);
    });
  });

  describe('maskObject', () => {
    it('preserves null and undefined', () => {
      const obj = { a: null, b: undefined };
      const { masked } = masking.maskObject(obj);
      expect((masked as Record<string, unknown>).a).toBeNull();
      expect((masked as Record<string, unknown>).b).toBeUndefined();
    });

    it('leaves numbers and booleans unchanged', () => {
      const obj = { n: 42, flag: true };
      const { masked, secretsDetected } = masking.maskObject(obj);
      expect((masked as Record<string, unknown>).n).toBe(42);
      expect((masked as Record<string, unknown>).flag).toBe(true);
      expect(secretsDetected).toBe(0);
    });

    it('masks strings in nested object', () => {
      const obj = { outer: { inner: 'api key sk-xxxxxxxxxxxxxxxxxxxxxxxxxx' } };
      const { masked, secretsDetected, secretTypes } = masking.maskObject(obj);
      const inner = (masked as Record<string, unknown>).outer as Record<string, unknown>;
      expect(inner.inner).toContain('[REDACTED_API_KEY]');
      expect(inner.inner).not.toContain('sk-xxxxxxxx');
      expect(secretsDetected).toBe(1);
      expect(secretTypes).toContain('api_key');
    });

    it('masks strings in arrays', () => {
      // ghp_ + 36 chars required by pattern
      const obj = { keys: ['safe', 'ghp_abcdefghijklmnopqrstuvwxyz1234567890', 'normal'] };
      const { masked, secretsDetected } = masking.maskObject(obj);
      const arr = (masked as Record<string, unknown>).keys as string[];
      expect(arr[0]).toBe('safe');
      expect(arr[1]).toBe('[REDACTED_API_KEY]');
      expect(arr[2]).toBe('normal');
      expect(secretsDetected).toBe(1);
    });

    it('does not mutate original object', () => {
      const obj = { secret: 'sk-abcdefghijklmnopqrstuvwxyz12' };
      const original = JSON.stringify(obj);
      masking.maskObject(obj);
      expect(JSON.stringify(obj)).toBe(original);
    });
  });

  describe('maskResponse', () => {
    it('masks MCP result content with secrets', () => {
      const response: MCPResponse = {
        result: {
          content: [
            {
              type: 'text',
              text: 'Your key is sk-1234567890abcdefghijklmnop and DB: postgres://u:p@localhost/db'
            }
          ]
        },
        id: 1
      };
      const { masked, secretsDetected, secretTypes } = masking.maskResponse(response);
      const text = (masked.result as any).content[0].text;
      expect(text).toContain('[REDACTED_API_KEY]');
      expect(text).toContain('[REDACTED_DATABASE_URL]');
      expect(text).not.toContain('sk-1234567890');
      expect(text).not.toContain('postgres://');
      expect(secretsDetected).toBe(1);
      expect(secretTypes).toContain('api_key');
      expect(secretTypes).toContain('database_url');
    });

    it('returns same response when no secrets', () => {
      const response: MCPResponse = {
        result: { tools: [{ name: 'read_file', description: 'Read a file' }] },
        id: 2
      };
      const { masked, secretsDetected, secretTypes } = masking.maskResponse(response);
      expect(masked.result).toEqual(response.result);
      expect(secretsDetected).toBe(0);
      expect(secretTypes).toEqual([]);
    });

    it('masks error message if it contains secrets', () => {
      const response: MCPResponse = {
        error: {
          code: 500,
          message: 'Failed with token ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
        },
        id: 3
      };
      const { masked, secretsDetected } = masking.maskResponse(response);
      expect(masked.error!.message).toContain('[REDACTED_API_KEY]');
      expect(masked.error!.message).not.toContain('ghp_');
      expect(secretsDetected).toBe(1);
    });

    it('handles tools/call result with secret in content', () => {
      const response: MCPResponse = {
        result: {
          content: [
            { type: 'text', text: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c' }
          ]
        },
        id: 4
      };
      const { masked } = masking.maskResponse(response);
      const text = (masked.result as any).content[0].text;
      // Bearer pattern matches first, so token is redacted as bearer_token
      expect(text).toContain('[REDACTED_BEARER_TOKEN]');
      expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]+/);
    });
  });
});
