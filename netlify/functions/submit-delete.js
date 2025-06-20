import algosdk from 'algosdk';
import { createAlgodClient, NETWORK_CONFIGS } from '../../utils/algorandClient.js';

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
    const { signedTransaction, applicationId, network = 'testnet' } = JSON.parse(event.body);
    
    console.log(`📥 Received submit-delete request for app ${applicationId}`);
    
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

    if (!applicationId) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Application ID is required' })
      };
    }

    // Create Algorand client
    const algodClient = createAlgodClient(network);

    // Decode and submit the signed transaction
    console.log('📤 Submitting delete transaction to Algorand network...');
    const signedTxnBytes = new Uint8Array(Buffer.from(signedTransaction, 'base64'));
    const txResponse = await algodClient.sendRawTransaction(signedTxnBytes).do();
    
    // Extract transaction ID
    const txId = txResponse?.txid || txResponse?.txId || txResponse?.transactionID;
    
    if (!txId) {
      console.error('❌ No transaction ID in response:', txResponse);
      throw new Error('No valid transaction ID was specified by the network');
    }
    
    console.log(`✅ Delete transaction submitted successfully: ${txId}`);
    
    // Wait for confirmation
    console.log('⏳ Waiting for transaction confirmation...');
    const confirmedTxn = await algosdk.waitForConfirmation(algodClient, txId, 15);
    
    console.log(`✅ Delete transaction confirmed in round ${confirmedTxn['confirmed-round']}`);
    
    console.log(`🗑️ Contract ${applicationId} deleted successfully`);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        transactionId: txId,
        applicationId: applicationId,
        confirmedRound: confirmedTxn['confirmed-round'],
        message: 'Contract deleted successfully. Minimum balance has been freed.'
      })
    };

  } catch (error) {
    console.error('❌ Error submitting delete transaction:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: error.message || 'Failed to submit delete transaction' 
      })
    };
  }
};