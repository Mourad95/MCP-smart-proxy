#!/usr/bin/env node

const { WebSocketServer } = require('ws');
const http = require('http');

// Serveur MCP mock 1: Filesystem
function createFilesystemMock(port = 8080) {
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  
  wss.on('connection', (ws) => {
    console.log(`[Filesystem Mock:${port}] Client connected`);
    
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      console.log(`[Filesystem Mock:${port}] Received:`, message.method);
      
      // Réponse mock
      if (message.method === 'tools/list') {
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            tools: [
              {
                name: 'read_file',
                description: 'Read a file from the filesystem',
                inputSchema: {
                  type: 'object',
                  properties: {
                    path: { type: 'string', description: 'File path' }
                  },
                  required: ['path']
                }
              },
              {
                name: 'write_file',
                description: 'Write content to a file',
                inputSchema: {
                  type: 'object',
                  properties: {
                    path: { type: 'string', description: 'File path' },
                    content: { type: 'string', description: 'File content' }
                  },
                  required: ['path', 'content']
                }
              }
            ]
          }
        }));
      } else if (message.method === 'resources/list') {
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          result: { resources: [] }
        }));
      }
    });
    
    ws.on('close', () => {
      console.log(`[Filesystem Mock:${port}] Client disconnected`);
    });
  });
  
  server.listen(port, () => {
    console.log(`📁 Filesystem MCP Mock listening on ws://localhost:${port}`);
  });
  
  return server;
}

// Serveur MCP mock 2: GitHub
function createGitHubMock(port = 8081) {
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  
  wss.on('connection', (ws) => {
    console.log(`[GitHub Mock:${port}] Client connected`);
    
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      console.log(`[GitHub Mock:${port}] Received:`, message.method);
      
      // Réponse mock
      if (message.method === 'tools/list') {
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            tools: [
              {
                name: 'search_repositories',
                description: 'Search GitHub repositories',
                inputSchema: {
                  type: 'object',
                  properties: {
                    query: { type: 'string', description: 'Search query' },
                    limit: { type: 'number', description: 'Result limit', default: 10 }
                  },
                  required: ['query']
                }
              },
              {
                name: 'get_repository',
                description: 'Get repository details',
                inputSchema: {
                  type: 'object',
                  properties: {
                    owner: { type: 'string', description: 'Repository owner' },
                    repo: { type: 'string', description: 'Repository name' }
                  },
                  required: ['owner', 'repo']
                }
              }
            ]
          }
        }));
      }
    });
  });
  
  server.listen(port, () => {
    console.log(`🐙 GitHub MCP Mock listening on ws://localhost:${port}`);
  });
  
  return server;
}

// Serveur MCP mock 3: Search
function createSearchMock(port = 8082) {
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  
  wss.on('connection', (ws) => {
    console.log(`[Search Mock:${port}] Client connected`);
    
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      console.log(`[Search Mock:${port}] Received:`, message.method);
      
      if (message.method === 'tools/list') {
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            tools: [
              {
                name: 'web_search',
                description: 'Search the web',
                inputSchema: {
                  type: 'object',
                  properties: {
                    query: { type: 'string', description: 'Search query' },
                    num_results: { type: 'number', description: 'Number of results', default: 5 }
                  },
                  required: ['query']
                }
              }
            ]
          }
        }));
      }
    });
  });
  
  server.listen(port, () => {
    console.log(`🔍 Search MCP Mock listening on ws://localhost:${port}`);
  });
  
  return server;
}

// Démarrer tous les serveurs mock
console.log('🚀 Starting MCP Mock Servers for testing...\n');

const servers = [
  createFilesystemMock(8080),
  createGitHubMock(8081),
  createSearchMock(8082)
];

// Gestion de l'arrêt propre
process.on('SIGINT', () => {
  console.log('\n\n🛑 Stopping MCP Mock Servers...');
  servers.forEach(server => server.close());
  process.exit(0);
});

console.log('\n✅ All MCP mock servers are running!');
console.log('📁 Filesystem: ws://localhost:8080');
console.log('🐙 GitHub:     ws://localhost:8081');
console.log('🔍 Search:     ws://localhost:8082');
console.log('\nPress Ctrl+C to stop all servers.');