import algosdk from 'algosdk';
import { createAlgodClient, NETWORK_CONFIGS, validateAlgorandAddress } from '../../utils/algorandClient.js';

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

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { applicationId, walletAddress, network = 'testnet' } = JSON.parse(event.body);
    
    console.log(`📥 Received CloseOut request for app ${applicationId}`);
    
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
    
    const algodClient = createAlgodClient(network);
    
    // Verify the caller is the creator of the application
    const appInfo = await algodClient.getApplicationByID(applicationId).do();
    const creator = appInfo.params.creator.toString();
    
    if (creator !== validatedWalletAddress) {
      return {
        statusCode: 403,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          error: 'Only the creator of the application can CloseOut it' 
        })
      };
    }
    
    // Check if contract has minimal balance (allow up to 0.01 ALGO remaining)
    const appAddress = algosdk.getApplicationAddress(applicationId);
    const contractAccountInfo = await algodClient.accountInformation(appAddress).do();
    const contractBalance = Number(contractAccountInfo.amount);
    
    if (contractBalance > 10000) { // 0.01 ALGO in microAlgos
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: `Cannot CloseOut contract with significant balance. Current balance: ${contractBalance / 1000000} ALGO. Please refund or claim first.`
        })
      };
    }
    
    // Get suggested parameters
    const suggestedParams = await algodClient.getTransactionParams().do();
    
    // Create application deletion transaction
    const deleteTxn = algosdk.makeApplicationDeleteTxnFromObject({
      sender: validatedWalletAddress,
      suggestedParams: suggestedParams,
      appIndex: applicationId
    });
    
    // Encode transaction for signing
    const txnToSign = Buffer.from(algosdk.encodeUnsignedTransaction(deleteTxn)).toString('base64');
    const txId = deleteTxn.txID();
    
    console.log(`✅ CloseOut transaction created for app ${applicationId}: ${txId}`);
    
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transactionToSign: txnToSign,
        transactionId: txId,
        applicationId: applicationId,
        message: 'Transaction created successfully. Sign and submit to CloseOut the contract.'
      })
    };
    
  } catch (error) {
    console.error('❌ Error creating CloseOut transaction:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: error.message || 'Failed to create CloseOut transaction' 
      })
    };
  }
};