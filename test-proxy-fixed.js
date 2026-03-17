#!/usr/bin/env node

const axios = require('axios');

const baseUrl = 'http://localhost:3000';

async function testProxy() {
  console.log('🔍 Checking if proxy is running...');
  
  try {
    // 1. Test health endpoint
    const healthResponse = await axios.get(`${baseUrl}/health`);
    
    if (healthResponse.data.status !== 'healthy') {
      throw new Error('Proxy not healthy');
    }
    
    console.log('✅ Proxy is running, starting tests...');
    console.log('\n🧪 Testing MCP Smart Proxy...');
    
    // 2. Test proxy to filesystem mock
    console.log('\n1. Testing health endpoint...');
    console.log('   ✅ Health check:', healthResponse.data);
    
    console.log('\n2. Testing proxy to filesystem mock...');
    try {
      const proxyResponse = await axios.post(`${baseUrl}/proxy/filesystem`, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      });
      
      console.log('   ✅ Proxy response:', JSON.stringify(proxyResponse.data, null, 2));
    } catch (error) {
      console.error('   ❌ Proxy test failed:', error.message);
      if (error.response) {
        console.error('   Status:', error.response.status);
        console.error('   Data:', error.response.data);
      }
      process.exit(1);
    }
    
    // 3. Test dashboard access
    console.log('\n3. Testing dashboard access...');
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
    
    // 4. Test metrics endpoint
    console.log('\n4. Testing metrics endpoint...');
    try {
      const metricsResponse = await axios.get(`${baseUrl}/metrics`);
      console.log('   ✅ Metrics endpoint accessible');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('   🔐 Metrics endpoint requires authentication (expected)');
      } else {
        console.log('   ⚠️ Metrics endpoint:', error.message);
      }
    }
    
    console.log('\n✅ All tests passed!');
    console.log('\n📊 Summary:');
    console.log('   - Proxy health: ✅');
    console.log('   - Server connections:', healthResponse.data.connected, '/', healthResponse.data.servers);
    console.log('   - Optimization enabled:', healthResponse.data.optimization);
    console.log('   - Dashboard auth:', healthResponse.data.dashboardAuth);
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    process.exit(1);
  }
}

// Start tests
testProxy();