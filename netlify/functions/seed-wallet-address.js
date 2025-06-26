import { NETWORK_CONFIGS } from '../../utils/algorandClient.js';
import seedWalletService from '../../utils/seedWalletService.js';

export const handler = async (event, context) => {
  // Handle CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: ''
    };
  }

  try {
    const network = event.queryStringParameters?.network || 'testnet';
    
    // Validate network
    if (!NETWORK_CONFIGS[network]) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Invalid network specified' })
      };
    }
    
    // Check seed wallet status
    const seedWalletStatus = await seedWalletService.checkSeedWalletBalance(network);
    
    if (!seedWalletStatus.configured) {
      return {
        statusCode: 503,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          error: 'Seed wallet service not configured',
          configured: false
        })
      };
    }
    
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        configured: true,
        address: seedWalletStatus.address,
        balance: seedWalletStatus.balance,
        recommendedContribution: 0.005 // ALGO
      })
    };
  } catch (error) {
    console.error('❌ Error getting seed wallet address:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: error.message || 'Failed to get seed wallet address'
      })
    };
  }
};