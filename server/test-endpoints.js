// Simple test file to verify backend endpoints
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';

async function testHealthEndpoint() {
  try {
    console.log('Testing health endpoint...');
    const response = await fetch(`${BASE_URL}/api/health`);
    const data = await response.json();
    console.log('✅ Health endpoint working:', data);
    return true;
  } catch (error) {
    console.log('❌ Health endpoint failed:', error.message);
    return false;
  }
}

async function testCreateClaimEndpoint() {
  try {
    console.log('Testing create-claim endpoint...');
    const response = await fetch(`${BASE_URL}/api/create-claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: 1,
        recipient: 'test@example.com',
        message: 'Test message',
        senderAddress: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
      })
    });
    
    const data = await response.json();
    console.log('✅ Create-claim endpoint response:', data);
    return true;
  } catch (error) {
    console.log('❌ Create-claim endpoint failed:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Testing backend endpoints...\n');
  
  const healthOk = await testHealthEndpoint();
  console.log('');
  
  if (healthOk) {
    await testCreateClaimEndpoint();
  } else {
    console.log('⚠️  Skipping create-claim test since health check failed');
  }
  
  console.log('\n✨ Test complete!');
}

runTests();