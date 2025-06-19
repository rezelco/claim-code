import algosdk from 'algosdk';
import { createAlgodClient, validateAlgorandAddress, NETWORK_CONFIGS } from '../../utils/algorandClient.js';

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
    
    // Create application call transaction to claim funds
    const claimTxn = algosdk.makeApplicationCallTxnFromObject({
      sender: validatedWalletAddress,
      suggestedParams: suggestedParams,
      appIndex: applicationId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs: [
        new TextEncoder().encode('claim'),
        new TextEncoder().encode(claimCode.trim())
      ]
    });
    
    // Encode transaction for signing
    const txnToSign = Buffer.from(algosdk.encodeUnsignedTransaction(claimTxn)).toString('base64');
    const txId = claimTxn.txID();
    
    console.log(`✅ Claim transaction created: ${txId}`);
    
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