import algosdk from 'algosdk';
import crypto from 'crypto';
import { createAlgodClient, validateAlgorandAddress, NETWORK_CONFIGS } from '../../utils/algorandClient.js';

// Hash claim code for smart contract (must match create-claim.js)
function hashClaimCode(code) {
  return crypto.createHash('sha256').update(code, 'utf8').digest();
}

export const handler = async (event, context) => {
  // Handle CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  try {
    const { applicationId, claimCode, network = 'testnet' } = JSON.parse(event.body);
    
    console.log(`📋 Checking claim status for app ${applicationId}`);
    
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
    
    // Validate inputs
    if (!applicationId || applicationId <= 0) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Valid application ID is required' })
      };
    }
    
    if (!claimCode || !claimCode.trim()) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Claim code is required' })
      };
    }
    
    // Create Algorand client
    const algodClient = createAlgodClient(network);
    
    try {
      // Get application information
      console.log(`🔍 Looking up application ID: ${applicationId} on ${network}`);
      const appInfo = await algodClient.getApplicationByID(applicationId).do();
      console.log(`✅ Found application: ${applicationId}`);
      console.log(`📝 Application info:`, JSON.stringify(appInfo, (key, value) => 
        typeof value === 'bigint' ? value.toString() : value, 2));
      
      if (!appInfo.params) {
        return {
          statusCode: 404,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            error: 'Application found but has no parameters',
            status: 'not_found'
          })
        };
      }
      
      // Check if global state exists - if not, this might be an unfunded contract or already claimed
      if (!appInfo.params['global-state'] || appInfo.params['global-state'].length === 0) {
        console.log('⚠️ Application exists but has no global state');
        
        // Check the contract's account balance to determine if it was already claimed
        try {
          const contractAddress = algosdk.getApplicationAddress(applicationId);
          console.log(`🔍 Checking contract balance for ${contractAddress}`);
          const accountInfo = await algodClient.accountInformation(contractAddress).do();
          const balance = BigInt(accountInfo.amount);
          console.log(`💰 Contract balance: ${balance.toString()} microAlgos (${Number(balance) / 1000000} ALGO)`);
          
          // Check for various low balance scenarios that indicate already claimed
          if (balance === 0n || balance <= 100000n) { // Less than or equal to 0.1 ALGO (minimum balance only)
            console.log(`⚠️ Balance too low (${balance.toString()} <= 100000), marking as already claimed`);
            return {
              statusCode: 200,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                status: 'already_claimed',
                message: 'These funds have already been claimed. Each claim code can only be used once.',
                amount: 0
              })
            };
          } else {
            console.log(`✅ Contract has sufficient balance (${balance.toString()} >= 100000), but no global state - allowing claim attempt`);
            // Contract has balance but no global state - let the claim attempt proceed
            // This might be a funded contract that needs to be claimed to initialize state
            return {
              statusCode: 200,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                status: 'available',
                message: 'Contract appears to be funded, proceeding with claim.',
                amount: Number(balance - 100000n) / 1000000 // Estimate claim amount (balance minus min balance)
              })
            };
          }
        } catch (balanceError) {
          console.log('⚠️ Could not check contract balance:', balanceError.message);
          console.log('⚠️ Full balance error:', balanceError);
          
          // If balance check fails, it might mean the account doesn't exist (already claimed and closed)
          if (balanceError.message && (
            balanceError.message.includes('account does not exist') ||
            balanceError.message.includes('not found') ||
            balanceError.response?.status === 404
          )) {
            return {
              statusCode: 200,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                status: 'already_claimed',
                message: 'These funds have already been claimed. Each claim code can only be used once.',
                amount: 0
              })
            };
          }
          
          // For other balance check failures, allow claim attempt
          return {
            statusCode: 200,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              status: 'available',
              message: 'Cannot verify contract status, proceeding with claim attempt.',
              amount: 0
            })
          };
        }
        
        // This return should never be reached now
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status: 'unfunded',
            message: 'Contract exists but appears to be unfunded. Please ask the sender to fund the contract.',
            amount: 0
          })
        };
      }
      
      // Parse global state
      const globalState = appInfo.params['global-state'];
      const state = {};
      
      for (const stateItem of globalState) {
        const key = Buffer.from(stateItem.key, 'base64').toString();
        let value;
        if (stateItem.value.type === 1) { // bytes
          value = Buffer.from(stateItem.value.bytes, 'base64');
        } else { // uint
          value = stateItem.value.uint;
        }
        state[key] = value;
      }
      
      console.log('📝 Contract state:', {
        claimed: state.claimed,
        amount: state.amount,
        created: state.created,
        hasHash: !!state.hash,
        hasSender: !!state.sender
      });
      
      // Check if already claimed
      if (state.claimed === 1) {
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status: 'already_claimed',
            message: 'These funds have already been claimed',
            amount: state.amount ? state.amount / 1000000 : 0,
            created: state.created
          })
        };
      }
      
      // Verify claim code matches
      const normalizedClaimCode = claimCode.trim().toUpperCase();
      const claimHash = hashClaimCode(normalizedClaimCode);
      
      if (state.hash && !claimHash.equals(state.hash)) {
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status: 'invalid_code',
            message: 'Invalid claim code',
          })
        };
      }
      
      // Check if refund period has passed (5 minutes = 300 seconds)
      const currentTime = Math.floor(Date.now() / 1000);
      const refundAvailable = state.created && (currentTime - state.created) >= 300;
      
      // Funds are available to claim
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'available',
          message: 'Funds are available to claim',
          amount: state.amount ? state.amount / 1000000 : 0,
          created: state.created,
          refundAvailable: refundAvailable
        })
      };
      
    } catch (appError) {
      console.log(`❌ Error looking up application ${applicationId}:`, appError.message);
      console.log(`❌ Full error:`, appError);
      
      if (appError.message && (
        appError.message.includes('application does not exist') ||
        appError.message.includes('application not found') ||
        appError.message.includes('does not exist') ||
        appError.response?.status === 404
      )) {
        return {
          statusCode: 404,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            error: `Application ID ${applicationId} not found on ${network}. Please verify the application ID is correct.`,
            status: 'not_found'
          })
        };
      }
      throw appError;
    }
    
  } catch (error) {
    console.error('❌ Error checking claim status:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: error.message || 'Internal server error occurred while checking claim status' 
      })
    };
  }
};