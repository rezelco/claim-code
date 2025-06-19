import algosdk from 'algosdk';
import { createAlgodClient, NETWORK_CONFIGS } from '../../utils/algorandClient.js';
import { getClaim, storeClaim } from '../../utils/storage.js';
import { sendEmailNotification } from '../../utils/emailService.js';

// Helper function to safely extract and convert application ID to number
function extractApplicationId(confirmedTxn) {
  // Try multiple possible locations for the app ID
  let rawAppId = confirmedTxn['application-index'] || 
                 confirmedTxn['applicationIndex'] || 
                 confirmedTxn.applicationIndex ||
                 confirmedTxn['app-id'] ||
                 confirmedTxn.appId;
  
  // Check if it's nested in txn or other objects
  if (!rawAppId && confirmedTxn.txn) {
    rawAppId = confirmedTxn.txn['application-index'] || 
               confirmedTxn.txn.applicationIndex ||
               confirmedTxn.txn['app-id'] ||
               confirmedTxn.txn.appId;
  }
  
  console.log('📝 Raw application index:', rawAppId, 'type:', typeof rawAppId);
  
  // Ensure appId is a proper number - handle all possible types
  let appId = null;
  
  if (rawAppId !== null && rawAppId !== undefined) {
    if (typeof rawAppId === 'string') {
      const parsed = parseInt(rawAppId, 10);
      if (!isNaN(parsed) && parsed > 0) {
        appId = parsed;
      }
    } else if (typeof rawAppId === 'bigint') {
      const converted = Number(rawAppId);
      if (Number.isSafeInteger(converted) && converted > 0) {
        appId = converted;
      }
    } else if (typeof rawAppId === 'number') {
      if (Number.isInteger(rawAppId) && rawAppId > 0) {
        appId = rawAppId;
      }
    } else if (typeof rawAppId === 'object' && rawAppId !== null) {
      console.log('⚠️ Application ID is an object, attempting to extract numeric value:', rawAppId);
      
      // Try to find a numeric property that could be the app ID
      const possibleKeys = ['value', 'id', 'appId', 'applicationId', 'index'];
      for (const key of possibleKeys) {
        if (rawAppId[key] !== undefined) {
          const candidate = rawAppId[key];
          if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate > 0) {
            appId = candidate;
            console.log(`✅ Extracted app ID from object.${key}: ${appId}`);
            break;
          } else if (typeof candidate === 'string') {
            const parsed = parseInt(candidate, 10);
            if (!isNaN(parsed) && parsed > 0) {
              appId = parsed;
              console.log(`✅ Extracted and parsed app ID from object.${key}: ${appId}`);
              break;
            }
          }
        }
      }
      
      if (appId === null) {
        console.error('❌ Could not extract valid app ID from object:', rawAppId);
      }
    }
  }
  
  console.log('📝 Parsed application ID:', appId, 'type:', typeof appId);
  
  return appId;
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
    const { signedTransaction, signedTransactions, network = 'testnet', claimDetails } = JSON.parse(event.body);
    
    console.log(`📥 Received submit-transaction request for ${NETWORK_CONFIGS[network]?.name || network}`);
    
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
    
    // Only handle single transactions
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

    const algodClient = createAlgodClient(network);

    let txResponse;
    let primaryTxId;

    try {
      // Handle single transaction
      console.log('📤 Submitting single signed transaction to network...');
      const signedTxnBuffer = Buffer.from(signedTransaction, 'base64');
      console.log(`📝 Transaction buffer length: ${signedTxnBuffer.length} bytes`);
      
      txResponse = await algodClient.sendRawTransaction(signedTxnBuffer).do();
      primaryTxId = txResponse?.txid || txResponse?.txId || txResponse?.transactionID;
      
      console.log('✅ Transaction submitted successfully');
      console.log(`   - Transaction ID: ${primaryTxId}`);
    } catch (submitError) {
      console.error('❌ Failed to submit transaction:', submitError);
      throw new Error(`Transaction submission failed: ${submitError.message}`);
    }
    
    // Validate transaction ID
    if (!primaryTxId) {
      console.error('❌ No transaction ID found in response');
      throw new Error('No transaction ID returned from submission');
    }
    
    // Wait for confirmation
    console.log('⏳ Waiting for transaction confirmation...');
    const confirmedTxn = await algosdk.waitForConfirmation(algodClient, primaryTxId, 15);
    console.log(`✅ Transaction confirmed in round ${confirmedTxn['confirmed-round']}`);

    // Extract application ID from confirmed transaction
    let appId = null;
    let contractAddress = null;
    
    appId = extractApplicationId(confirmedTxn);
    if (appId && appId > 0) {
      contractAddress = algosdk.getApplicationAddress(appId).toString();
      console.log(`✅ App created with ID: ${appId}, Address: ${contractAddress}`);
    }

    // Update claim storage with actual application ID and contract address
    if (claimDetails && claimDetails.claimCode && appId) {
      const claimInfo = getClaim(claimDetails.claimCode);
      if (claimInfo) {
        claimInfo.applicationId = appId;
        claimInfo.contractAddress = contractAddress;
        storeClaim(claimDetails.claimCode, claimInfo);
        console.log(`✅ Updated claim storage with actual app ID ${appId}`);
      }
    }

    // Send email notification if claim details are provided
    let notificationResult = { success: false, method: 'not_attempted' };
    if (claimDetails) {
      console.log('📧 Sending email notification after successful deployment...');
      try {
        notificationResult = await sendEmailNotification(
          claimDetails.recipient,
          claimDetails.claimCode,
          claimDetails.amount,
          claimDetails.message,
          network,
          appId
        );
        console.log(`✅ Email notification: ${notificationResult.success ? 'sent' : 'failed'}`);
      } catch (emailError) {
        console.error('❌ Failed to send email notification:', emailError);
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
        transactionId: primaryTxId,
        applicationId: appId,
        contractAddress: contractAddress,
        confirmedRound: confirmedTxn['confirmed-round'],
        notificationSent: notificationResult.success,
        notificationMethod: notificationResult.method
      })
    };

  } catch (error) {
    console.error('❌ Error submitting transaction:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: error.message || 'Failed to submit transaction' 
      })
    };
  }
};