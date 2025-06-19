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
    const { applicationId, amount, senderAddress, network = 'testnet' } = JSON.parse(event.body);
    
    console.log(`📥 Received fund-contract request for app ${applicationId}`);
    
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
    
    if (!amount || amount <= 0) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Amount must be greater than 0' })
      };
    }
    
    // Validate sender address
    let validatedSenderAddress;
    try {
      validatedSenderAddress = validateAlgorandAddress(senderAddress);
    } catch (addressError) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: `Invalid sender address: ${addressError.message}` })
      };
    }
    
    // Create Algorand client
    const algodClient = createAlgodClient(network);
    
    // Get suggested parameters
    const suggestedParams = await algodClient.getTransactionParams().do();
    
    // Get the application address
    const appAddress = algosdk.getApplicationAddress(applicationId);
    console.log(`📝 Contract address: ${appAddress}`);
    
    // Create payment transaction to fund the contract
    const fundingTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: validatedSenderAddress,
      receiver: appAddress,
      amount: Math.floor(amount * 1000000), // Convert ALGO to microAlgos
      suggestedParams: suggestedParams,
      note: new TextEncoder().encode('RandCash contract funding')
    });
    
    // Encode transaction for signing
    const txnToSign = Buffer.from(algosdk.encodeUnsignedTransaction(fundingTxn)).toString('base64');
    const txId = fundingTxn.txID();
    
    console.log(`✅ Funding transaction created:`);
    console.log(`- Amount: ${amount} ALGO`);
    console.log(`- To contract: ${appAddress}`);
    console.log(`- Transaction ID: ${txId}`);
    
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transactionToSign: txnToSign,
        transactionId: txId,
        contractAddress: appAddress.toString()
      })
    };
    
  } catch (error) {
    console.error('❌ Error creating funding transaction:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: error.message || 'Failed to create funding transaction' 
      })
    };
  }
};