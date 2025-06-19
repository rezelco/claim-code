import algosdk from 'algosdk';
import { createAlgodClient, NETWORK_CONFIGS } from '../../utils/algorandClient.js';
import { getClaim, markClaimAsUsed } from '../../utils/storage.js';

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
    const { signedTransaction, claimCode, network = 'testnet' } = JSON.parse(event.body);
    
    console.log(`📥 Received submit-claim request for claim code ${claimCode?.substring(0, 8)}...`);
    
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
    
    if (!signedTransaction) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Signed transaction is required' })
      };
    }

    if (!claimCode) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Claim code is required' })
      };
    }

    // Get claim information
    const claimInfo = getClaim(claimCode.trim().toUpperCase());
    if (!claimInfo) {
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Invalid claim code' })
      };
    }

    // Check if already claimed
    if (claimInfo.claimed) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'This claim code has already been used.' })
      };
    }

    // Create Algorand client
    const algodClient = createAlgodClient(network);

    // Decode and submit the signed transaction
    console.log('📤 Submitting claim transaction to Algorand network...');
    const signedTxnBytes = new Uint8Array(Buffer.from(signedTransaction, 'base64'));
    const txResponse = await algodClient.sendRawTransaction(signedTxnBytes).do();
    
    // Extract transaction ID - handle different response formats
    const txId = txResponse?.txid || txResponse?.txId || txResponse?.transactionID;
    
    if (!txId) {
      console.error('❌ No transaction ID in response:', txResponse);
      throw new Error('No valid transaction ID was specified by the network');
    }
    
    console.log(`✅ Claim transaction submitted successfully: ${txId}`);
    
    // Wait for confirmation
    console.log('⏳ Waiting for transaction confirmation...');
    const confirmedTxn = await algosdk.waitForConfirmation(algodClient, txId, 15);
    
    console.log(`✅ Claim transaction confirmed in round ${confirmedTxn['confirmed-round']}`);

    // Mark claim as used
    markClaimAsUsed(claimCode.trim().toUpperCase());

    console.log(`🎉 Claim processed successfully:`);
    console.log(`- Amount: ${claimInfo.amount} ALGO`);
    console.log(`- Transaction ID: ${txId}`);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        transactionId: txId,
        amount: claimInfo.amount,
        confirmedRound: confirmedTxn['confirmed-round'],
        message: claimInfo.message
      })
    };

  } catch (error) {
    console.error('❌ Error submitting claim transaction:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: error.message || 'Failed to submit claim transaction' 
      })
    };
  }
};