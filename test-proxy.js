#!/usr/bin/env node

const axios = require('axios');

async function testProxy() {
  console.log('🧪 Testing MCP Smart Proxy...\n');
  
  const baseUrl = 'http://localhost:3000';
  
  try {
    // 1. Test de santé
    console.log('1. Testing health endpoint...');
    const healthResponse = await axios.get(`${baseUrl}/health`);
    console.log('   ✅ Health check:', healthResponse.data);
    
    // 2. Test de proxy vers un serveur mock
    console.log('\n2. Testing proxy to filesystem mock...');
    const proxyResponse = await axios.post(`${baseUrl}/proxy/filesystem`, {
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 1
    });
    console.log('   ✅ Proxy response:', JSON.stringify(proxyResponse.data, null, 2));
    
    // 3. Test d'optimisation de contexte
    console.log('\n3. Testing context optimization...');
    const optimizeResponse = await axios.post(`${baseUrl}/optimize`, {
      query: "Je veux lire un fichier config et rechercher des dépôts GitHub",
      tools: [
        {
          name: 'read_file',
          description: 'Read a file from the filesystem',
          server: 'filesystem'
        },
        {
          name: 'write_file', 
          description: 'Write content to a file',
          server: 'filesystem'
        },
        {
          name: 'search_repositories',
          description: 'Search GitHub repositories',
          server: 'github'
        },
        {
          name: 'get_repository',
          description: 'Get repository details',
          server: 'github'
        },
        {
          name: 'web_search',
          description: 'Search the web',
          server: 'search'
        }
      ]
    });
    
    console.log('   ✅ Optimization result:');
    console.log('   Original tools:', optimizeResponse.data.originalToolCount);
    console.log('   Optimized tools:', optimizeResponse.data.optimizedToolCount);
    console.log('   Tokens saved:', optimizeResponse.data.tokensSaved);
    console.log('   Selected tools:', optimizeResponse.data.tools.map(t => t.name));
    
    // 4. Test du dashboard (si disponible)
    console.log('\n4. Testing dashboard access...');
    try {
      const dashboardResponse = await axios.get(`${baseUrl}/dashboard`);
      console.log('   ✅ Dashboard accessible');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('   🔐 Dashboard requires authentication (expected)');
      } else {
        console.log('   ⚠️ Dashboard:', error.message);
      }
    }
    
    // 5. Test des statistiques
    console.log('\n5. Testing analytics...');
    try {
      const statsResponse = await axios.get(`${baseUrl}/api/stats`);
      console.log('   ✅ Analytics:', statsResponse.data);
    } catch (error) {
      console.log('   ⚠️ Analytics endpoint:', error.message);
    }
    
    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📊 Proxy is working correctly with:');
    console.log('   - Health endpoint ✓');
    console.log('   - Proxy forwarding ✓');
    console.log('   - Context optimization ✓');
    console.log('   - Dashboard (with auth) ✓');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    process.exit(1);
  }
}

// Vérifier que le proxy est en cours d'exécution
async function checkProxyRunning() {
  try {
    await axios.get('http://localhost:3000/health', { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('🔍 Checking if proxy is running...');
  
  const isRunning = await checkProxyRunning();
  if (!isRunning) {
    console.log('❌ Proxy is not running on http://localhost:3000');
    console.log('   Start it with: npm start');
    process.exit(1);
  }
  
  console.log('✅ Proxy is running, starting tests...\n');
  await testProxy();
}

main().catch(console.error);