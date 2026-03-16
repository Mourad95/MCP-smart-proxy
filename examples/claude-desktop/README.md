# Claude Desktop Integration Example

This example shows how to configure Claude Desktop to use MCP Smart Proxy.

## Configuration

### 1. Start MCP Smart Proxy

First, start the proxy server:

```bash
cd /path/to/mcp-smart-proxy
npm start
```

Or with custom configuration:

```bash
npm start -- --config ./examples/claude-desktop/config.json
```

### 2. Configure Claude Desktop

Edit Claude Desktop's configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`  
**Linux:** `~/.config/Claude/claude_desktop_config.json`

Add the MCP Smart Proxy configuration:

```json
{
  "mcpServers": {
    "smart-proxy": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-smart-proxy",
        "start",
        "--config",
        "/path/to/mcp-smart-proxy/examples/claude-desktop/config.json"
      ],
      "env": {
        "MCP_PROXY_PORT": "3000",
        "MCP_OPTIMIZATION_ENABLED": "true"
      }
    }
  }
}
```

### 3. Alternative: Direct WebSocket Connection

If you have the proxy running as a service, you can connect directly:

```json
{
  "mcpServers": {
    "smart-proxy": {
      "url": "ws://localhost:3000"
    }
  }
}
```

## Example Configuration

See `config.json` in this directory for a complete example configuration that includes:

- Filesystem server
- GitHub server
- Search server
- Optimization settings
- Analytics dashboard

## Testing the Integration

1. Restart Claude Desktop after updating the configuration
2. Open Claude Desktop and check the MCP status
3. Ask Claude to perform operations that would use MCP tools
4. Monitor the proxy dashboard at `http://localhost:3000/dashboard`

## Troubleshooting

### Claude Desktop doesn't show MCP tools
- Check that the proxy is running: `curl http://localhost:3000/health`
- Verify Claude Desktop configuration syntax
- Check proxy logs for errors

### Connection errors
- Ensure the proxy port (default: 3000) is not in use
- Check firewall settings
- Verify WebSocket support

### Performance issues
- Adjust optimization settings in `config.json`
- Reduce `maxContextTokens` for faster responses
- Disable semantic routing if not needed

## Advanced Configuration

### Custom MCP Servers
Add your own MCP servers to the proxy configuration:

```json
{
  "mcpServers": [
    {
      "name": "my-custom-server",
      "url": "ws://localhost:9090",
      "description": "My custom MCP server",
      "priority": 1,
      "enabled": true
    }
  ]
}
```

### Optimization Tuning
Adjust optimization parameters for your use case:

```json
{
  "optimization": {
    "enabled": true,
    "maxContextTokens": 1500,
    "minRelevanceScore": 0.4,
    "cacheEnabled": true,
    "semanticRouting": true
  }
}
```

## Monitoring

Access the proxy dashboard at `http://localhost:3000/dashboard` to monitor:

- Token savings
- Cache performance
- Server connections
- Request metrics