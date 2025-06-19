import { createAlgodClient, NETWORK_CONFIGS } from '../../utils/algorandClient.js';
import { isValidPicaConfig } from '../../utils/emailService.js';

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

    // Test Algorand connection
    const algodClient = createAlgodClient(network);
    const status = await algodClient.status().do();
    
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        algorand: {
          network: NETWORK_CONFIGS[network].name,
          node: NETWORK_CONFIGS[network].algodServer,
          lastRound: status['last-round']
        },
        services: {
          email: isValidPicaConfig ? 'connected' : 'simulated'
        }
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        status: 'ERROR', 
        timestamp: new Date().toISOString(),
        error: error.message 
      })
    };
  }
};