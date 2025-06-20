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
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'GET') {
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
    // Extract wallet address from query parameters
    const walletAddress = event.queryStringParameters?.walletAddress;
    const network = event.queryStringParameters?.network || 'testnet';
    
    if (!walletAddress) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Wallet address is required' })
      };
    }
    
    console.log(`📥 Received wallet-contracts request for ${walletAddress.substring(0, 8)}... on ${network}`);
    
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
    
    // Get account information to find created applications
    const accountInfo = await algodClient.accountInformation(validatedWalletAddress).do();
    const createdApps = accountInfo.createdApps || [];
    
    console.log(`📝 Found ${createdApps.length} applications created by wallet`);
    
    const contracts = [];
    
    // For each created application, get its current state
    for (const app of createdApps) {
      try {
        const appId = Number(app.id);
        const appAddress = algosdk.getApplicationAddress(appId);
        
        // Get application global state
        const appInfo = await algodClient.getApplicationByID(appId).do();
        const globalState = appInfo.params.globalState || [];
        
        // Parse global state
        const parsedState = {};
        globalState.forEach(item => {
          const key = Buffer.from(item.key, 'base64').toString();
          let value;
          if (item.value.type === 1) { // bytes
            value = Buffer.from(item.value.bytes, 'base64');
          } else if (item.value.type === 2) { // uint
            value = Number(item.value.uint); // Convert BigInt to Number
          }
          parsedState[key] = value;
        });
        
        // Get contract account balance
        let contractBalance = 0;
        try {
          const contractAccountInfo = await algodClient.accountInformation(appAddress).do();
          contractBalance = Number(contractAccountInfo.amount) / 1000000; // Convert to ALGO
        } catch (balanceError) {
          console.log(`⚠️ Could not get balance for contract ${appId}: ${balanceError.message}`);
        }
        
        // Determine contract status
        const claimed = parsedState.claimed === 1;
        const amount = parsedState.amount ? Number(parsedState.amount) / 1000000 : 0;
        const created = parsedState.created || 0;
        const currentTime = Math.floor(Date.now() / 1000);
        const canRefund = !claimed && (currentTime - created) > 300; // 5 minutes
        const canDelete = contractBalance === 0;
        
        let status = 'Unknown';
        if (claimed) {
          status = 'Claimed';
        } else if (contractBalance > 0) {
          status = canRefund ? 'Refundable' : 'Active';
        } else {
          status = 'Empty';
        }
        
        contracts.push({
          applicationId: appId,
          contractAddress: appAddress.toString(),
          status: status,
          amount: amount,
          balance: contractBalance,
          claimed: claimed,
          canRefund: canRefund,
          canDelete: canDelete,
          createdTimestamp: created,
          createdDate: created ? new Date(created * 1000).toISOString() : null
        });
        
      } catch (appError) {
        console.error(`❌ Error processing app ${app.id}:`, appError.message);
        // Continue with other apps even if one fails
      }
    }
    
    console.log(`✅ Processed ${contracts.length} contracts for wallet`);
    
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        walletAddress: validatedWalletAddress,
        network: network,
        contracts: contracts,
        totalContracts: contracts.length,
        activeContracts: contracts.filter(c => c.status === 'Active').length,
        claimedContracts: contracts.filter(c => c.status === 'Claimed').length,
        refundableContracts: contracts.filter(c => c.canRefund).length,
        deletableContracts: contracts.filter(c => c.canDelete).length
      })
    };
    
  } catch (error) {
    console.error('❌ Error getting wallet contracts:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: error.message || 'Failed to get wallet contracts' 
      })
    };
  }
};