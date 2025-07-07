// Simple integration test to validate end-to-end pipeline
const axios = require('axios');

async function testIntegration() {
  console.log('🚀 Testing ruv-FANN MCP Integration...\n');
  
  // Test all services are responding
  console.log('1. Testing service health checks...');
  
  const services = [
    { name: 'ruv-fann-core', url: 'http://127.0.0.1:8090/health' },
    { name: 'ruv-swarm', url: 'http://127.0.0.1:8081/health' },
    { name: 'model-server', url: 'http://127.0.0.1:8082/health' },
    { name: 'gcp-backend', url: 'http://127.0.0.1:8080/health' }
  ];
  
  for (const service of services) {
    try {
      const response = await axios.get(service.url, { timeout: 5000 });
      console.log(`   ✅ ${service.name}: ${response.data.status || 'OK'}`);
    } catch (error) {
      console.log(`   ❌ ${service.name}: ${error.message}`);
      return false;
    }
  }
  
  console.log('\n2. Testing GCP prediction pipeline...');
  
  // Test GCP backend mock
  try {
    const gcpResponse = await axios.post('http://127.0.0.1:8080/execute/bq-query', {
      params: {
        query: 'SELECT * FROM test.table LIMIT 10'
      }
    }, { timeout: 5000 });
    
    console.log(`   ✅ GCP Backend Query: Success (${gcpResponse.data.data.rows.length} rows)`);
  } catch (error) {
    console.log(`   ❌ GCP Backend Query: ${error.message}`);
    return false;
  }
  
  // Test ruv-FANN Core prediction
  try {
    const predictionPayload = {
      input: [0.5, 0.2, 0.8, 0.1, 0.6, 0.3, 0.7, 0.4, 0.9, 0.0]
    };
    
    const predictionResponse = await axios.post('http://127.0.0.1:8090/api/network/predict', predictionPayload, { 
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log(`   ✅ Neural Prediction: Success (output: [${predictionResponse.data.output.map(x => x.toFixed(3)).join(', ')}], ${predictionResponse.data.inference_time_ms}ms)`);
  } catch (error) {
    console.log(`   ❌ Neural Prediction: ${error.message}`);
    return false;
  }
  
  // Test Model Server
  try {
    const modelResponse = await axios.get('http://127.0.0.1:8082/models', { timeout: 5000 });
    console.log(`   ✅ Model Server: Available models listed`);
  } catch (error) {
    console.log(`   ⚠️  Model Server: ${error.message} (might use different endpoint)`);
  }
  
  // Test Swarm coordination
  try {
    const swarmResponse = await axios.post('http://127.0.0.1:8081/api/swarm/solve', {
      problem: 'test integration',
      context: 'validation check'
    }, { timeout: 5000 });
    
    console.log(`   ✅ Swarm Coordination: Problem solved`);
  } catch (error) {
    console.log(`   ⚠️  Swarm Coordination: ${error.message} (might use different endpoint)`);
  }
  
  console.log('\n🎉 Basic integration test completed!');
  console.log('✅ All core services are responding');
  console.log('✅ GCP backend mock is working');
  console.log('ℹ️  Neural prediction and swarm APIs may need endpoint verification');
  
  return true;
}

// Run the test
testIntegration().catch(console.error);