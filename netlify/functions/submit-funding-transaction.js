import algosdk from 'algosdk';
import { createAlgodClient, NETWORK_CONFIGS } from '../../utils/algorandClient.js';
import { getClaim, storeClaim } from '../../utils/storage.js';

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
    const { signedTransaction, network = 'testnet', claimCode } = JSON.parse(event.body);
    
    console.log(`📥 Received funding transaction submission`);
    
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

    // Create Algorand client
    const algodClient = createAlgodClient(network);

    // Decode and submit the signed transaction
    console.log('📤 Submitting funding transaction to Algorand network...');
    const signedTxnBytes = new Uint8Array(Buffer.from(signedTransaction, 'base64'));
    const txResponse = await algodClient.sendRawTransaction(signedTxnBytes).do();
    
    // Extract transaction ID
    const txId = txResponse?.txid || txResponse?.txId || txResponse?.transactionID;
    
    if (!txId) {
      console.error('❌ No transaction ID in response:', txResponse);
      throw new Error('No valid transaction ID was specified by the network');
    }
    
    console.log(`✅ Funding transaction submitted successfully: ${txId}`);
    
    // Wait for confirmation
    console.log('⏳ Waiting for transaction confirmation...');
    const confirmedTxn = await algosdk.waitForConfirmation(algodClient, txId, 15);
    
    console.log(`✅ Funding transaction confirmed in round ${confirmedTxn['confirmed-round']}`);

    // Update claim storage with funding transaction ID if claim code provided
    if (claimCode) {
      const claimInfo = getClaim(claimCode);
      if (claimInfo) {
        claimInfo.fundingTxId = txId;
        storeClaim(claimCode, claimInfo);
        console.log(`✅ Updated claim storage with funding TX ID ${txId}`);
      } else {
        console.log(`⚠️ Could not find claim for code ${claimCode} to update funding TX ID`);
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        transactionId: txId,
        confirmedRound: confirmedTxn['confirmed-round']
      })
    };

  } catch (error) {
    console.error('❌ Error submitting funding transaction:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: error.message || 'Failed to submit funding transaction' 
      })
    };
  }
};