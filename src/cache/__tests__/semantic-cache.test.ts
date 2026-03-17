import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SemanticCache } from '../semantic-cache';
import { MCPResponse } from '../../types/mcp-types';

const VEC_DIM = 384;

function makeNormalizedVector(seed: number): number[] {
  const v = new Array(VEC_DIM).fill(0);
  v[seed % VEC_DIM] = 1;
  return v;
}

function createTempDir(): string {
  const dir = path.join(os.tmpdir(), `mcp-semantic-cache-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupTempDir(dir: string): void {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    // ignore
  }
}

describe('SemanticCache', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
    delete process.env.SEMANTIC_CACHE_THRESHOLD;
    delete process.env.SEMANTIC_CACHE_TTL_SECONDS;
    delete process.env.SEMANTIC_CACHE_BYPASS_SERVERS;
    delete process.env.SEMANTIC_CACHE_BYPASS_FLAG;
  });

  describe('shouldBypass', () => {
    it('returns false when no bypass config', () => {
      const cache = new SemanticCache({ indexPath: tempDir, bypassServers: [], bypassFlag: undefined });
      expect(cache.shouldBypass()).toBe(false);
      expect(cache.shouldBypass('filesystem')).toBe(false);
    });

    it('returns true when server is in bypass list', () => {
      const cache = new SemanticCache({
        indexPath: tempDir,
        bypassServers: ['weather', 'time']
      });
      expect(cache.shouldBypass('weather')).toBe(true);
      expect(cache.shouldBypass('time')).toBe(true);
      expect(cache.shouldBypass('filesystem')).toBe(false);
    });

    it('returns true when params contain bypass flag', () => {
      const cache = new SemanticCache({
        indexPath: tempDir,
        bypassFlag: 'skip_semantic_cache'
      });
      expect(cache.shouldBypass(undefined, { arguments: { skip_semantic_cache: true } })).toBe(true);
      expect(cache.shouldBypass(undefined, { arguments: { skip_semantic_cache: 1 } })).toBe(true);
      expect(cache.shouldBypass(undefined, { arguments: { other: 1 } })).toBe(false);
      expect(cache.shouldBypass(undefined, { arguments: { skip_semantic_cache: false } })).toBe(false);
    });
  });

  describe('get / set', () => {
    it('misses when cache is empty', async () => {
      const cache = new SemanticCache({
        indexPath: tempDir,
        threshold: 0.95
      });
      const vec = makeNormalizedVector(0);
      const result = await cache.get(vec);
      expect(result).toEqual({ hit: false });
      expect(cache.getStats().misses).toBe(1);
    });

    it('hits when same embedding is stored and queried', async () => {
      const cache = new SemanticCache({
        indexPath: tempDir,
        threshold: 0.95,
        ttlSeconds: 60
      });
      await cache.initialize();
      const vec = makeNormalizedVector(0);
      const response: MCPResponse = { result: { content: [{ type: 'text', text: 'cached' }] }, id: 1 };
      await cache.set(vec, 'query', response, 'filesystem', 'read_file');
      const result = await cache.get(vec, 'filesystem');
      expect(result.hit).toBe(true);
      if (result.hit) {
        expect(result.response.result).toEqual(response.result);
      }
      expect(cache.getStats().hits).toBe(1);
    });

    it('misses when query vector is different (below threshold)', async () => {
      const cache = new SemanticCache({
        indexPath: tempDir,
        threshold: 0.95,
        ttlSeconds: 60
      });
      await cache.initialize();
      const vec0 = makeNormalizedVector(0);
      const vec1 = makeNormalizedVector(1);
      const response: MCPResponse = { result: {}, id: 1 };
      await cache.set(vec0, 'query', response);
      const result = await cache.get(vec1);
      expect(result).toEqual({ hit: false });
      expect(cache.getStats().misses).toBe(1);
    });

    it('does not return entry from another server when serverName filter is used', async () => {
      const cache = new SemanticCache({
        indexPath: tempDir,
        threshold: 0.95,
        ttlSeconds: 60
      });
      await cache.initialize();
      const vec = makeNormalizedVector(0);
      const response: MCPResponse = { result: { from: 'A' }, id: 1 };
      await cache.set(vec, 'q', response, 'serverA', 'tool');
      const resultB = await cache.get(vec, 'serverB');
      expect(resultB).toEqual({ hit: false });
      const resultA = await cache.get(vec, 'serverA');
      expect(resultA.hit).toBe(true);
      if (resultA.hit) expect(resultA.response.result).toEqual({ from: 'A' });
    });
  });

  describe('TTL', () => {
    it('misses when TTL is 0 after entry is older than 0ms', async () => {
      const cache = new SemanticCache({
        indexPath: tempDir,
        threshold: 0.5,
        ttlSeconds: 0
      });
      await cache.initialize();
      const vec = makeNormalizedVector(0);
      await cache.set(vec, 'q', { result: {} }, 's', 't');
      await new Promise((r) => setTimeout(r, 10));
      const result = await cache.get(vec);
      expect(result).toEqual({ hit: false });
    });
  });

  describe('getStats', () => {
    it('returns 0 hitRate when no requests', () => {
      const cache = new SemanticCache({ indexPath: tempDir });
      const st = cache.getStats();
      expect(st.hits).toBe(0);
      expect(st.misses).toBe(0);
      expect(st.hitRate).toBe(0);
    });

    it('updates hits and misses and hitRate', async () => {
      const cache = new SemanticCache({
        indexPath: tempDir,
        threshold: 0.95,
        ttlSeconds: 60
      });
      await cache.initialize();
      const vec = makeNormalizedVector(0);
      await cache.set(vec, 'q', { result: {} }, 's', 't');
      await cache.get(vec, 's');
      await cache.get(makeNormalizedVector(1));
      const st = cache.getStats();
      expect(st.hits).toBe(1);
      expect(st.misses).toBe(1);
      expect(st.hitRate).toBe(0.5);
    });
  });

  describe('getSize', () => {
    it('returns 0 when index empty or not created', async () => {
      const cache = new SemanticCache({ indexPath: tempDir });
      const size = await cache.getSize();
      expect(size).toBe(0);
    });

    it('returns entry count after inserts', async () => {
      const cache = new SemanticCache({
        indexPath: tempDir,
        threshold: 0.95,
        ttlSeconds: 60
      });
      await cache.initialize();
      await cache.set(makeNormalizedVector(0), 'q1', { result: {} });
      await cache.set(makeNormalizedVector(1), 'q2', { result: {} });
      const size = await cache.getSize();
      expect(size).toBe(2);
    });
  });
});
