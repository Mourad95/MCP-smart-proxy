# Semantic Cache

The semantic cache returns a stored MCP response when an incoming request is **semantically similar** to a previous one, avoiding redundant calls to MCP servers. It uses the same embedding model as the proxy’s semantic routing.

## How it works

1. **On each tool call** (`tools/call`), the proxy builds a query key from the tool name and arguments, then generates an embedding via the same `VectorMemory` used for routing.
2. **Lookup**: The cache compares this embedding to stored entries using **cosine similarity** (via the local vector index).
3. **Hit** (similarity ≥ threshold, default **0.95**): The cached MCP response is returned immediately; **no MCP server is called**.
4. **Miss**: The request is forwarded to the MCP server as usual. After a successful response, the tuple `[embedding, query text, response, timestamp]` is **stored** in the cache for future hits.

## Configuration

### Enable the cache

The semantic cache is **disabled by default**. Enable it in your config or via environment variables.

**Config file** (`config/default.json` or similar):

```json
{
  "optimization": {
    "semanticCacheEnabled": true,
    "semanticCacheThreshold": 0.95,
    "semanticCacheTtlSeconds": 3600,
    "semanticCacheBypassServers": [],
    "semanticCacheBypassFlag": "skip_semantic_cache"
  }
}
```

**Environment variables** (override or complement config):

| Variable | Description | Default |
|----------|-------------|---------|
| `SEMANTIC_CACHE_THRESHOLD` | Minimum similarity (0–1) to consider a hit | `0.95` |
| `SEMANTIC_CACHE_TTL_SECONDS` | Time-to-live for cache entries (seconds) | `3600` (1 hour) |
| `SEMANTIC_CACHE_BYPASS_FLAG` | Tool argument key that, when set, skips cache lookup and storage | `skip_semantic_cache` |
| `SEMANTIC_CACHE_BYPASS_SERVERS` | Comma-separated server names that never use the cache | *(empty)* |
| `SEMANTIC_CACHE_INDEX_PATH` | Directory for the vector index used by the cache | `./.mcp-semantic-cache` |

### TTL (volatile tools)

Some tools return real-time data (e.g. weather, build status, current time). Entries are expired after **TTL** seconds so that old cached answers are not reused. Default TTL is **1 hour**; adjust with `semanticCacheTtlSeconds` or `SEMANTIC_CACHE_TTL_SECONDS`.

### Bypass

- **By server**: List server names in `semanticCacheBypassServers` (or `SEMANTIC_CACHE_BYPASS_SERVERS`). Those servers are never looked up or stored in the semantic cache.
- **By request**: If the tool call includes the bypass flag in `arguments` (e.g. `skip_semantic_cache: true`), the cache is skipped for that call (no lookup, no store).

Example: exclude real-time servers in config:

```json
"semanticCacheBypassServers": ["weather", "time"]
```

Or via env:

```bash
export SEMANTIC_CACHE_BYPASS_SERVERS=weather,time
```

## Metrics

- **JSON**: `GET /metrics` includes `optimization.semanticCache` with `hits`, `misses`, `size`, and `hitRate`.
- **Prometheus**: `GET /metrics/prometheus` exposes:
  - `mcp_semantic_cache_hits_total`
  - `mcp_semantic_cache_misses_total`
  - `mcp_semantic_cache_entries`

Use these in your dashboard or alerts to monitor cache effectiveness.

## Implementation details

- **Embedding model**: Same as routing (`VectorMemory`, e.g. Xenova/all-MiniLM-L6-v2). Query key format: `toolName:JSON.stringify(arguments)`.
- **Similarity**: Cosine similarity on normalized vectors (handled by the vector index). Only entries with score ≥ threshold and within TTL are considered.
- **Storage**: A separate vector index (e.g. under `SEMANTIC_CACHE_INDEX_PATH`) stores one item per cached response; metadata holds the serialized MCP response and timestamp.
- **Response size**: Very large responses are truncated before storage (see `MAX_CACHED_RESPONSE_LENGTH` in code) to keep index metadata bounded.

## Related

- [Configuration](../config/default.json) — full proxy and optimization options
- [README — Monitoring](../README.md#-monitoring) — dashboard and metrics endpoints
