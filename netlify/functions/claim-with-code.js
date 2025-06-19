import algosdk from 'algosdk';
import crypto from 'crypto';
import { createAlgodClient, validateAlgorandAddress, NETWORK_CONFIGS } from '../../utils/algorandClient.js';

// Hash claim code for smart contract (must match create-claim.js)
function hashClaimCode(code) {
  // Ensure we're working with consistent UTF-8 encoding
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
    const { applicationId, claimCode, walletAddress, network = 'testnet' } = JSON.parse(event.body);
    
    console.log(`📥 Received claim-with-code request for app ${applicationId}`);
    
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
    
    // Validate wallet address
    let validatedWalletAddress;
    try {
      validatedWalletAddress = validateAlgorandAddress(walletAddress);
    } catch (addressError) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: `Invalid wallet address: ${addressError.message}` })
      };
    }
    
    // Create Algorand client
    const algodClient = createAlgodClient(network);
    
    // Get suggested parameters
    const suggestedParams = await algodClient.getTransactionParams().do();
    
    const normalizedClaimCode = claimCode.trim().toUpperCase();
    const claimHash = hashClaimCode(normalizedClaimCode);
    
    console.log('🔑 Claim attempt details:');
    console.log(`- Raw claim code: ${claimCode}`);
    console.log(`- Normalized claim code: ${normalizedClaimCode}`);
    console.log(`- Claim code length: ${normalizedClaimCode.length}`);
    console.log(`- Claim hash length: ${claimHash.length}`);
    console.log(`- Claim hash (hex): ${claimHash.toString('hex')}`);
    console.log(`- Application ID: ${applicationId}`);
    
    // Create application call transaction to claim funds
    const claimTxn = algosdk.makeApplicationCallTxnFromObject({
      sender: validatedWalletAddress,
      suggestedParams: suggestedParams,
      appIndex: applicationId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs: [
        new TextEncoder().encode('claim'),
        claimHash
      ]
    });
    
    // Encode transaction for signing
    const txnToSign = Buffer.from(algosdk.encodeUnsignedTransaction(claimTxn)).toString('base64');
    const txId = claimTxn.txID();
    
    console.log(`✅ Claim transaction created: ${txId}`);
    
    // Debug: Check application state before claim
    try {
      const appInfo = await algodClient.getApplicationByID(applicationId).do();
      console.log('📝 Application state before claim:');
      if (appInfo.params && appInfo.params['global-state']) {
        const globalState = appInfo.params['global-state'];
        for (const stateItem of globalState) {
          const key = Buffer.from(stateItem.key, 'base64').toString();
          let value;
          if (stateItem.value.type === 1) { // bytes
            value = Buffer.from(stateItem.value.bytes, 'base64').toString('hex');
          } else { // uint
            value = stateItem.value.uint;
          }
          console.log(`- ${key}: ${value}`);
        }
      }
    } catch (debugError) {
      console.log('⚠️ Could not read app state for debugging:', debugError.message);
    }
    
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transactionToSign: txnToSign,
        transactionId: txId,
        applicationId: applicationId
      })
    };
    
  } catch (error) {
    console.error('❌ Error creating claim transaction:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: error.message || 'Internal server error occurred while creating claim transaction' 
      })
    };
  }
};