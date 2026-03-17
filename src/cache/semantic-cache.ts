import { LocalIndex } from 'vectra';
import * as path from 'path';
import { MCPResponse } from '../types/mcp-types';

export interface SemanticCacheEntry {
  embedding: number[];
  queryText: string;
  response: MCPResponse;
  timestamp: number;
  serverName?: string;
  toolName?: string;
}

export interface SemanticCacheOptions {
  /** Index storage path */
  indexPath?: string;
  /** Minimum similarity (0–1) to consider a hit. Default from SEMANTIC_CACHE_THRESHOLD or 0.95 */
  threshold?: number;
  /** TTL in seconds for cache entries. Default from SEMANTIC_CACHE_TTL_SECONDS or 3600 */
  ttlSeconds?: number;
  /** Server names that should bypass the cache (e.g. real-time tools) */
  bypassServers?: string[];
  /** If present in tool arguments, skip cache lookup and store */
  bypassFlag?: string;
}

export interface SemanticCacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

const DEFAULT_THRESHOLD = 0.95;
const DEFAULT_TTL_SECONDS = 3600;
/** Max length of stringified response stored in index metadata; longer responses are truncated (may break JSON). */
const MAX_CACHED_RESPONSE_LENGTH = 200_000;

/**
 * Semantic cache: stores [embedding, queryText, response, timestamp] and
 * returns cached MCP response when a new request's embedding is similar enough.
 */
export class SemanticCache {
  private index: LocalIndex;
  private initialized = false;
  private readonly threshold: number;
  private readonly ttlMs: number;
  private readonly bypassServers: Set<string>;
  private readonly bypassFlag: string | undefined;
  private hits = 0;
  private misses = 0;

  constructor(options: SemanticCacheOptions = {}) {
    const indexPath =
      options.indexPath ??
      process.env.SEMANTIC_CACHE_INDEX_PATH ??
      path.join(process.cwd(), '.mcp-semantic-cache');
    this.index = new LocalIndex(indexPath);
    this.threshold =
      options.threshold ??
      (process.env.SEMANTIC_CACHE_THRESHOLD
        ? parseFloat(process.env.SEMANTIC_CACHE_THRESHOLD)
        : DEFAULT_THRESHOLD);
    const ttlSec =
      options.ttlSeconds ??
      (process.env.SEMANTIC_CACHE_TTL_SECONDS
        ? parseInt(process.env.SEMANTIC_CACHE_TTL_SECONDS, 10)
        : DEFAULT_TTL_SECONDS);
    this.ttlMs = ttlSec * 1000;
    this.bypassServers = new Set(
      options.bypassServers ??
        (process.env.SEMANTIC_CACHE_BYPASS_SERVERS
          ? process.env.SEMANTIC_CACHE_BYPASS_SERVERS.split(',').map((s) => s.trim()).filter(Boolean)
          : [])
    );
    this.bypassFlag =
      options.bypassFlag ?? process.env.SEMANTIC_CACHE_BYPASS_FLAG ?? undefined;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (!(await this.index.isIndexCreated())) {
      await this.index.createIndex();
    }
    this.initialized = true;
  }

  /**
   * Check if cache should be bypassed for this request.
   */
  shouldBypass(serverName?: string, params?: { arguments?: Record<string, unknown> }): boolean {
    if (serverName && this.bypassServers.has(serverName)) return true;
    if (this.bypassFlag && params?.arguments && typeof params.arguments === 'object') {
      const args = params.arguments as Record<string, unknown>;
      if (args[this.bypassFlag] !== undefined && args[this.bypassFlag] !== false) return true;
    }
    return false;
  }

  /**
   * Look up cache by query embedding. Returns cached response if similarity >= threshold and entry is within TTL.
   */
  async get(
    queryEmbedding: number[],
    serverName?: string
  ): Promise<{ hit: true; response: MCPResponse } | { hit: false }> {
    await this.initialize();
    const limit = 20;
    const results = await this.index.queryItems(queryEmbedding, limit);
    const now = Date.now();
    for (const r of results) {
      if (r.score == null || r.score < this.threshold) continue;
      const meta = r.item.metadata as Record<string, unknown>;
      const ts = typeof meta.timestamp === 'number' ? meta.timestamp : 0;
      if (now - ts > this.ttlMs) continue;
      if (serverName && meta.serverName && meta.serverName !== serverName) continue;
      try {
        const responseRaw = meta.response;
        const response: MCPResponse =
          typeof responseRaw === 'string' ? JSON.parse(responseRaw) : (responseRaw as MCPResponse);
        this.hits++;
        return { hit: true, response };
      } catch {
        continue;
      }
    }
    this.misses++;
    return { hit: false };
  }

  /**
   * Store a new entry in the cache.
   */
  async set(
    embedding: number[],
    queryText: string,
    response: MCPResponse,
    serverName?: string,
    toolName?: string
  ): Promise<void> {
    await this.initialize();
    const responseStr = JSON.stringify(response);
    // Do not store truncated responses: truncated JSON is invalid and would cause get() to fail (cache miss) and bloat the index
    if (responseStr.length > MAX_CACHED_RESPONSE_LENGTH) {
      return;
    }
    const id = `sc_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    await this.index.insertItem({
      vector: embedding,
      metadata: {
        id,
        queryText: queryText.slice(0, 2000),
        response: responseStr,
        timestamp: Date.now(),
        serverName: serverName ?? '',
        toolName: toolName ?? ''
      }
    });
  }

  getStats(): SemanticCacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: 0, // Vectra doesn't expose count easily; could be added via list if needed
      hitRate: total > 0 ? Math.round((this.hits / total) * 1000) / 1000 : 0
    };
  }

  /** For dashboard: record size by querying with a dummy vector and counting (optional). */
  async getSize(): Promise<number> {
    await this.initialize();
    if (!(await this.index.isIndexCreated())) return 0;
    try {
      const dummy = new Array(384).fill(0);
      const r = await this.index.queryItems(dummy, 10000);
      return r.length;
    } catch {
      return 0;
    }
  }
}
