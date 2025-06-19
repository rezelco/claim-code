import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import algosdk from 'algosdk';
import crypto from 'crypto';
import axios from 'axios';
import seedWalletService from './services/seedWalletService.js';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Network configurations
const NETWORK_CONFIGS = {
  testnet: {
    name: 'TestNet',
    algodToken: '',
    algodServer: 'https://testnet-api.4160.nodely.dev',
    algodPort: 443
  },
  mainnet: {
    name: 'MainNet',
    algodToken: '',
    algodServer: 'https://mainnet-api.4160.nodely.dev',
    algodPort: 443
  }
};

// Create Algorand client for specific network
function createAlgodClient(network = 'testnet') {
  const config = NETWORK_CONFIGS[network];
  if (!config) {
    throw new Error(`Unsupported network: ${network}`);
  }
  
  return new algosdk.Algodv2(config.algodToken, config.algodServer, config.algodPort);
}

// Initialize Pica/Resend email service
const picaSecretKey = process.env.PICA_SECRET_KEY;
const picaConnectionKey = process.env.PICA_RESEND_CONNECTION_KEY;
const picaFromEmail = process.env.PICA_FROM_EMAIL;

const isValidPicaConfig = 
  picaSecretKey && 
  picaConnectionKey && 
  picaFromEmail &&
  picaSecretKey !== 'your_pica_secret_key' &&
  picaConnectionKey !== 'your_pica_resend_connection_key' &&
  picaFromEmail !== 'noreply@randcash.app';

if (isValidPicaConfig) {
  console.log('✅ Pica/Resend email service configured');
} else {
  console.log('📧 Pica/Resend not configured - Email notifications will be simulated');
}

// In-memory storage for claim codes (in production, use a database)
const claimStorage = new Map();

// Generate secure random claim code
function generateClaimCode() {
  return crypto.randomBytes(16).toString('hex').toUpperCase();
}

// Hash claim code for smart contract
function hashClaimCode(code) {
  return crypto.createHash('sha256').update(code).digest();
}

// Store claim information
function storeClaim(claimCode, claimData) {
  claimStorage.set(claimCode, {
    ...claimData,
    createdAt: new Date(),
    claimed: false
  });
}

// Get claim information
function getClaim(claimCode) {
  return claimStorage.get(claimCode);
}

// Mark claim as used
function markClaimAsUsed(claimCode) {
  const claim = claimStorage.get(claimCode);
  if (claim) {
    claim.claimed = true;
    claim.claimedAt = new Date();
    claimStorage.set(claimCode, claim);
  }
}

// Create TEAL contract for hash-based claiming with refund after 5 minutes (for testing)
function createHashClaimContractTeal(hashedClaimCode, senderAddress, amount) {
  const tealProgram = `#pragma version 6

// Global state variables:
// "hash" - bytes: SHA256 hash of the claim code
// "amount" - uint64: Amount to be claimed in microAlgos
// "sender" - bytes: Original sender address for refunds
// "created" - uint64: Creation timestamp
// "claimed" - uint64: 1 if claimed, 0 if not

// Application call handling
txn ApplicationID
int 0
==
bnz creation

// Check if this is a NoOp call
txn OnCompletion
int NoOp
==
bnz handle_call

// Reject all other operations
int 0
return

creation:
// Store the hash, amount, sender, and creation time in global state
byte "hash"
txna ApplicationArgs 1
app_global_put

byte "amount"
txna ApplicationArgs 2
btoi
app_global_put

byte "sender"
txna ApplicationArgs 3
app_global_put

byte "created"
global LatestTimestamp
app_global_put

// Initialize claimed status
byte "claimed"
int 0
app_global_put

int 1
return

handle_call:
// Check the first argument to determine the operation
txna ApplicationArgs 0
byte "claim"
==
bnz handle_claim

txna ApplicationArgs 0
byte "refund"
==
bnz handle_refund

// Unknown operation
int 0
return

handle_claim:
// Verify the claim code by hashing the provided code
txna ApplicationArgs 1
sha256
byte "hash"
app_global_get
==
assert

// Check if already claimed
byte "claimed"
app_global_get
int 0
==
assert

// Mark as claimed
byte "claimed"
int 1
app_global_put

// Transfer funds to claimer with inner transaction
itxn_begin
int pay
itxn_field TypeEnum
txn Sender
itxn_field Receiver
byte "amount"
app_global_get
itxn_field Amount
int 1000
itxn_field Fee
// Send remaining balance back to claimer
txn Sender
itxn_field CloseRemainderTo
itxn_submit

int 1
return

handle_refund:
// Check if 5 minutes (300 seconds) have passed
global LatestTimestamp
byte "created"
app_global_get
-
int 300
>=
assert

// Check if not claimed yet
byte "claimed"
app_global_get
int 0
==
assert

// Check if caller is the original sender
txn Sender
byte "sender"
app_global_get
==
assert

// Mark as claimed to prevent double refund
byte "claimed"
int 1
app_global_put

// Refund to original sender with inner transaction
itxn_begin
int pay
itxn_field TypeEnum
byte "sender"
app_global_get
itxn_field Receiver
byte "amount"
app_global_get
itxn_field Amount
int 1000
itxn_field Fee
// Send remaining balance back to sender
byte "sender"
app_global_get
itxn_field CloseRemainderTo
itxn_submit

int 1
return`;

  return tealProgram;
}

// Compile TEAL program
async function compileTealProgram(tealSource, network = 'testnet') {
  try {
    const algodClient = createAlgodClient(network);
    
    // Test connection first
    await algodClient.status().do();
    
    const compileResponse = await algodClient.compile(tealSource).do();
    
    if (!compileResponse.result) {
      throw new Error('TEAL compilation failed - no result returned');
    }
    
    return {
      compiledProgram: new Uint8Array(Buffer.from(compileResponse.result, 'base64')),
      hash: compileResponse.hash
    };
  } catch (error) {
    console.error('Error compiling TEAL program:', error);
    throw new Error(`Failed to compile smart contract: ${error.message}`);
  }
}

// Validate Algorand address format
function validateAlgorandAddress(address) {
  if (!address || typeof address !== 'string') {
    throw new Error('Address must be a valid string');
  }
  
  const trimmedAddress = address.trim();
  if (!trimmedAddress) {
    throw new Error('Address cannot be empty');
  }
  
  // Use algosdk's built-in validation
  if (!algosdk.isValidAddress(trimmedAddress)) {
    throw new Error('Invalid Algorand address format');
  }
  
  // Additional validation by attempting to decode the address
  try {
    algosdk.decodeAddress(trimmedAddress);
  } catch (decodeError) {
    throw new Error(`Address validation failed: ${decodeError.message}`);
  }
  
  return trimmedAddress;
}

// Deploy smart contract to Algorand - clean single transaction
async function createSingleAppTransaction(compiledProgram, senderAddress, claimHash, amount, network = 'testnet') {
  try {
    console.log('🔍 Creating single app creation transaction');
    
    const validatedSenderAddress = validateAlgorandAddress(senderAddress);
    const algodClient = createAlgodClient(network);
    const suggestedParams = await algodClient.getTransactionParams().do();
    
    // Fix genesisHash if needed
    if (suggestedParams.genesisHash && !(suggestedParams.genesisHash instanceof Uint8Array)) {
      const hashArray = Object.values(suggestedParams.genesisHash);
      suggestedParams.genesisHash = new Uint8Array(hashArray);
    }

    // Create clear program
    const clearProgram = new Uint8Array([0x06, 0x81, 0x01]);
    
    // Prepare application arguments
    const appArgs = [
      new TextEncoder().encode('setup'),
      claimHash,
      algosdk.encodeUint64(Math.floor(amount * 1000000)),
      algosdk.decodeAddress(validatedSenderAddress).publicKey
    ];

    // Single Transaction: Application Creation
    const appCreateParams = { ...suggestedParams, fee: 1000, flatFee: true };
    const appCreateTxn = algosdk.makeApplicationCreateTxnFromObject({
      sender: validatedSenderAddress,
      suggestedParams: appCreateParams,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      approvalProgram: compiledProgram,
      clearProgram: clearProgram,
      numLocalInts: 0,
      numLocalByteSlices: 0,
      numGlobalInts: 3, // hash, amount, created, claimed
      numGlobalByteSlices: 2, // sender
      appArgs: appArgs
    });

    console.log('✅ Created single app creation transaction');
    
    return {
      transaction: appCreateTxn,
      txId: appCreateTxn.txID()
    };
  } catch (error) {
    console.error('❌ Error creating transaction:', error);
    throw new Error(`Failed to create transaction: ${error.message}`);
  }
}

async function deployContract(compiledProgram, senderAddress, claimHash, amount, network = 'testnet') {
  try {
    console.log('🔍 deployContract called with:', {
      compiledProgramLength: compiledProgram?.length,
      senderAddress: senderAddress,
      senderAddressType: typeof senderAddress,
      claimHashLength: claimHash?.length,
      amount: amount,
      network: network
    });
    
    // Validate inputs
    if (!compiledProgram || !(compiledProgram instanceof Uint8Array)) {
      throw new Error('Invalid compiled program - must be Uint8Array');
    }
    
    if (!claimHash || !(claimHash instanceof Uint8Array)) {
      throw new Error('Invalid claim hash - must be Uint8Array');
    }
    
    if (!amount || amount <= 0) {
      throw new Error('Invalid amount - must be positive number');
    }

    // Validate and clean the sender address
    const validatedSenderAddress = validateAlgorandAddress(senderAddress);

    const algodClient = createAlgodClient(network);
    
    // Test connection and get suggested params
    let suggestedParams;
    try {
      suggestedParams = await algodClient.getTransactionParams().do();
      console.log('✅ Successfully fetched transaction parameters');
      
      // Fix genesisHash if it's not a Uint8Array (bug in some algosdk versions)
      if (suggestedParams.genesisHash && !(suggestedParams.genesisHash instanceof Uint8Array)) {
        const hashArray = Object.values(suggestedParams.genesisHash);
        suggestedParams.genesisHash = new Uint8Array(hashArray);
        console.log('📝 Fixed genesisHash format');
      }
      
      // Ensure proper fee is set
      // For app creation, use standard fee
      if (!suggestedParams.fee || suggestedParams.fee === 0n) {
        // Application creation requires standard fee
        suggestedParams.fee = 1000n; // 0.001 ALGO
        suggestedParams.flatFee = true; // Use flat fee
        console.log('📝 Set transaction fee: 1000 microAlgos for app creation');
      }
    } catch (paramError) {
      console.error('❌ Failed to fetch transaction parameters:', paramError);
      throw new Error(`Network connection failed: ${paramError.message}`);
    }
    
    // Validate suggested params - using correct field names from algosdk
    if (!suggestedParams || suggestedParams.fee === undefined || !suggestedParams.firstValid || !suggestedParams.lastValid) {
      console.error('Invalid params structure:', {
        hasSuggestedParams: !!suggestedParams,
        hasFee: suggestedParams?.fee !== undefined,
        hasFirstValid: !!suggestedParams?.firstValid,
        hasLastValid: !!suggestedParams?.lastValid
      });
      throw new Error('Invalid transaction parameters received from network');
    }

    // Create clear program (simple program that always approves)
    const clearProgram = new Uint8Array([0x06, 0x81, 0x01]); // TEAL: #pragma version 6; int 1; return
    
    // Prepare application arguments as Uint8Array
    const appArgs = [
      new TextEncoder().encode('setup'),
      claimHash,
      algosdk.encodeUint64(Math.floor(amount * 1000000)) // Convert ALGO to microAlgos
    ];
    
    // Validate all appArgs are Uint8Array
    appArgs.forEach((arg, index) => {
      if (!(arg instanceof Uint8Array)) {
        throw new Error(`Application argument ${index} is not Uint8Array`);
      }
    });

    console.log('📝 Creating application transaction with:');
    console.log(`  - From: ${validatedSenderAddress}`);
    console.log(`  - Approval program size: ${compiledProgram.length} bytes`);
    console.log(`  - Clear program size: ${clearProgram.length} bytes`);
    console.log(`  - App args count: ${appArgs.length}`);
    console.log(`  - Amount (microAlgos): ${Math.floor(amount * 1000000)}`);
    console.log(`  ⚠️  Note: Account needs min balance for app creation (0.1 ALGO + 0.1 ALGO per global state var)`);
    
    // Log the suggestedParams to debug
    console.log('📝 Suggested params structure:', {
      flatFee: suggestedParams.flatFee,
      fee: suggestedParams.fee?.toString(),
      firstValid: suggestedParams.firstValid?.toString(),
      lastValid: suggestedParams.lastValid?.toString(),
      genesisID: suggestedParams.genesisID,
      minFee: suggestedParams.minFee?.toString()
    });

    // Log the exact parameters being passed
    console.log('📝 Transaction parameters:', {
      from: validatedSenderAddress,
      fromType: typeof validatedSenderAddress,
      fromValue: validatedSenderAddress,
      hasApprovalProgram: !!compiledProgram,
      hasClearProgram: !!clearProgram,
      appArgsLength: appArgs.length
    });

    // Create application creation transaction with all required parameters
    const appCreateTxn = algosdk.makeApplicationCreateTxnFromObject({
      sender: validatedSenderAddress,  // Changed from 'from' to 'sender'
      suggestedParams: suggestedParams,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      approvalProgram: compiledProgram,
      clearProgram: clearProgram,
      numLocalInts: 0,
      numLocalByteSlices: 0,
      numGlobalInts: 2, // amount, claimed
      numGlobalByteSlices: 1, // claim_hash
      appArgs: appArgs
      // Remove undefined fields as they might cause issues
    });

    console.log('✅ Application transaction created successfully');
    
    // For now, return just the app creation transaction
    // We'll handle funding after the app is created and we know the real app ID
    
    // Get transaction ID
    let txId;
    try {
      txId = appCreateTxn.txID();
      console.log(`  - Transaction ID: ${txId}`);
    } catch (txIdError) {
      console.error('❌ Error getting transaction ID:', txIdError);
      throw new Error('Failed to get transaction ID from created transaction');
    }

    return {
      transaction: appCreateTxn,
      txId: txId
    };
  } catch (error) {
    console.error('❌ Error creating contract deployment transaction:', error);
    
    // Provide more specific error information
    if (error.message.includes('Address must not be null')) {
      throw new Error('Invalid sender address provided to transaction creation');
    } else if (error.message.includes('suggestedParams')) {
      throw new Error('Failed to get valid network parameters - check network connectivity');
    } else if (error.message.includes('approvalProgram')) {
      throw new Error('Invalid approval program - compilation may have failed');
    } else {
      throw new Error(`Failed to create contract deployment transaction: ${error.message}`);
    }
  }
}

// Send email notification via Pica/Resend
async function sendEmailNotification(recipient, claimCode, amount, message, network = 'testnet', applicationId = null) {
  const networkName = NETWORK_CONFIGS[network].name;
  
  try {
    if (!isValidPicaConfig) {
      const notificationMessage = `You've received ${amount} ALGO on RandCash (${networkName})! ${message ? `Message: "${message}"` : ''} Use claim code: ${claimCode}${applicationId ? ` and Application ID: ${applicationId}` : ''} to claim your funds.`;
      console.log(`📧 [SIMULATED EMAIL] To: ${recipient}: ${notificationMessage}`);
      return { success: true, method: 'email_simulation' };
    }

    const emailData = {
      from: `RandCash <${picaFromEmail}>`,
      to: recipient,
      subject: `You've received ${amount} ALGO on RandCash (${networkName})!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="display: inline-block; width: 60px; height: 60px; background: linear-gradient(135deg, #2563eb, #4f46e5); border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
              <span style="color: white; font-size: 24px;">💸</span>
            </div>
            <h1 style="color: #1f2937; margin: 0; font-size: 28px; font-weight: bold;">You've received ${amount} ALGO!</h1>
          </div>
          
          <div style="background: #f8fafc; border-radius: 12px; padding: 24px; margin: 24px 0;">
            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
              Someone sent you cryptocurrency using RandCash on Algorand ${networkName}.
            </p>
            ${message ? `
              <div style="background: white; border-radius: 8px; padding: 16px; margin: 16px 0; border-left: 4px solid #2563eb;">
                <p style="color: #6b7280; font-size: 14px; margin: 0 0 4px 0; font-weight: 600;">Message:</p>
                <p style="color: #1f2937; font-size: 16px; margin: 0; font-style: italic;">"${message}"</p>
              </div>
            ` : ''}
          </div>
          
          <div style="background: linear-gradient(135deg, #eff6ff, #dbeafe); border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
            ${applicationId ? `
              <p style="color: #1e40af; font-size: 16px; font-weight: 600; margin: 0 0 12px 0;">Application ID:</p>
              <div style="background: white; border-radius: 8px; padding: 16px; margin: 12px 0; border: 2px solid #7c3aed;">
                <p style="font-family: 'Courier New', monospace; font-size: 24px; font-weight: bold; color: #1f2937; margin: 0; letter-spacing: 2px;">
                  ${applicationId}
                </p>
              </div>
            ` : ''}
            <p style="color: #1e40af; font-size: 16px; font-weight: 600; margin: ${applicationId ? '20px 0 12px 0' : '0 0 12px 0'};">Your Claim Code:</p>
            <div style="background: white; border-radius: 8px; padding: 16px; margin: 12px 0; border: 2px solid #2563eb;">
              <p style="font-family: 'Courier New', monospace; font-size: 24px; font-weight: bold; color: #1f2937; margin: 0; letter-spacing: 2px;">
                ${claimCode}
              </p>
            </div>
            <p style="color: #1e40af; font-size: 14px; margin: 12px 0 0 0;">
              ${applicationId ? 'Keep both codes safe - you\'ll need them to claim your funds!' : 'Keep this code safe - you\'ll need it to claim your funds!'}
            </p>
          </div>
          
          <div style="text-align: center; margin: 32px 0;">
            <a href="https://randcash.app" style="display: inline-block; background: linear-gradient(135deg, #2563eb, #4f46e5); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">
              Claim Your Funds →
            </a>
          </div>
          
          <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 32px;">
            <p style="color: #6b7280; font-size: 12px; text-align: center; margin: 0;">
              Network: Algorand ${networkName} • Powered by RandCash
            </p>
          </div>
        </div>
      `,
      text: `You've received ${amount} ALGO on RandCash (${networkName})!

${message ? `Message: "${message}"` : ''}

${applicationId ? `Application ID: ${applicationId}
` : ''}Your claim code: ${claimCode}

Visit RandCash to claim your funds by entering ${applicationId ? 'both codes' : 'this code'} and connecting your wallet.

Network: Algorand ${networkName}`,
      tags: [
        { name: 'service', value: 'randcash' },
        { name: 'type', value: 'claim_notification' },
        { name: 'network', value: network }
      ]
    };

    console.log('📧 Attempting to send email via Pica API...');
    console.log('📧 API URL: https://api.picaos.com/v1/passthrough/email');
    console.log('📧 Headers configured:', {
      'Content-Type': 'application/json',
      'x-pica-secret': picaSecretKey ? `${picaSecretKey.substring(0, 8)}...` : 'missing',
      'x-pica-connection-key': picaConnectionKey ? `${picaConnectionKey.substring(0, 8)}...` : 'missing',
      'x-pica-action-id': 'conn_mod_def::GC4q4JE4I28::x8Elxo0VRMK1X-uH1C3NeA'
    });
    
    const response = await axios.post('https://api.picaos.com/v1/passthrough/email', emailData, {
      headers: {
        'Content-Type': 'application/json',
        'x-pica-secret': picaSecretKey,
        'x-pica-connection-key': picaConnectionKey,
        'x-pica-action-id': 'conn_mod_def::GC4q4JE4I28::x8Elxo0VRMK1X-uH1C3NeA',
      }
    });

    console.log(`✅ Email sent successfully! Status: ${response.status}, ID: ${response.data?.id || 'unknown'}`);
    return { success: true, method: 'email', emailId: response.data?.id };

  } catch (error) {
    console.error('❌ Email sending failed:');
    console.error('   Status:', error.response?.status);
    console.error('   Status Text:', error.response?.statusText);
    console.error('   Response Data:', error.response?.data);
    console.error('   Request URL:', error.config?.url);
    console.error('   Error Message:', error.message);
    
    // Check for specific 404 error
    if (error.response?.status === 404) {
      console.error('🔍 404 Error - Possible causes:');
      console.error('   1. Incorrect API endpoint URL');
      console.error('   2. Invalid action ID');
      console.error('   3. Pica service configuration issue');
      console.error('   4. Missing or invalid authentication headers');
    }
    
    // Don't fail the entire transaction if notification fails
    return { 
      success: false, 
      error: `Email API error (${error.response?.status || 'network'}): ${error.response?.data?.message || error.message}`, 
      method: 'email' 
    };
  }
}

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
      // Handle case where rawAppId might be an object with numeric properties
      // This prevents objects from being passed through
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
      
      // If we still don't have a valid appId, this is an error
      if (appId === null) {
        console.error('❌ Could not extract valid app ID from object:', rawAppId);
      }
    }
  }
  
  console.log('📝 Parsed application ID:', appId, 'type:', typeof appId);
  
  return appId;
}

// Root endpoint to confirm server is running
app.get('/', (req, res) => {
  res.json({ 
    message: 'RandCash API Server is running!',
    version: '1.0.0',
    endpoints: [
      'GET /api/health',
      'POST /api/create-claim',
      'POST /api/submit-transaction',
      'POST /api/claim-funds'
    ],
    timestamp: new Date().toISOString()
  });
});

// API endpoint to create claim
app.post('/api/create-claim', async (req, res) => {
  try {
    const { amount, recipient, message, senderAddress, network = 'testnet' } = req.body;

    console.log(`📥 Received create-claim request:`, {
      amount,
      recipient: recipient ? `${recipient.substring(0, 5)}...` : 'undefined',
      senderAddress: senderAddress ? `${senderAddress.substring(0, 8)}...` : 'undefined',
      senderAddressType: typeof senderAddress,
      senderAddressValue: senderAddress,
      network,
      hasMessage: !!message
    });

    // Validate network
    if (!NETWORK_CONFIGS[network]) {
      return res.status(400).json({ error: 'Invalid network specified' });
    }

    // Validate input
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    
    if (!recipient || !recipient.trim()) {
      return res.status(400).json({ error: 'Recipient email is required' });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipient.trim())) {
      return res.status(400).json({ error: 'Please provide a valid email address' });
    }
    
    // Validate sender address using our helper function
    let validatedSenderAddress;
    try {
      validatedSenderAddress = validateAlgorandAddress(senderAddress);
    } catch (addressError) {
      return res.status(400).json({ error: `Invalid sender address: ${addressError.message}` });
    }

    // Additional validation for MainNet
    if (network === 'mainnet' && amount > 10) {
      return res.status(400).json({ error: 'Maximum amount on MainNet is 10 ALGO for safety' });
    }

    console.log(`✅ Creating claim for ${amount} ALGO from ${validatedSenderAddress} to ${recipient} on ${NETWORK_CONFIGS[network].name}`);

    // Generate claim code and hash it
    const claimCode = generateClaimCode();
    const hashedClaimCode = hashClaimCode(claimCode);
    
    // Create TEAL program
    console.log('📝 Creating TEAL program...');
    const tealProgram = createHashClaimContractTeal(hashedClaimCode, validatedSenderAddress, amount);
    
    // Compile the TEAL program
    console.log('🔨 Compiling TEAL program...');
    const { compiledProgram, hash: programHash } = await compileTealProgram(tealProgram, network);
    console.log(`✅ TEAL compilation successful, hash: ${programHash}`);
    
    // Create single app creation transaction
    console.log('📋 Creating single app creation transaction...');
    const { transaction, txId } = await createSingleAppTransaction(
      compiledProgram, 
      validatedSenderAddress, 
      hashedClaimCode, 
      amount,
      network
    );
    console.log('✅ Created single transaction');

    // No need to store claim information - everything is on-chain now

    console.log(`🎉 Single transaction created successfully on ${NETWORK_CONFIGS[network].name}:`);
    console.log(`- Claim code: ${claimCode}`);
    console.log(`- Transaction ID: ${txId}`);
    console.log(`- Program hash: ${programHash}`);
    console.log(`- Email will be sent after contract deployment`);

    // Return single transaction
    res.json({
      claimCode,
      transactionId: txId,
      programHash,
      deploymentTransaction: Buffer.from(algosdk.encodeUnsignedTransaction(transaction)).toString('base64'),
      claimDetails: {
        recipient,
        amount,
        message,
        network,
        claimCode
      }
    });

  } catch (error) {
    console.error('❌ Error creating claim:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error occurred while creating claim' 
    });
  }
});

// API endpoint to submit signed transaction (atomic group)
app.post('/api/submit-transaction', async (req, res) => {
  try {
    const { signedTransaction, signedTransactions, network = 'testnet', claimDetails } = req.body;
    
    console.log(`📥 Received submit-transaction request for ${NETWORK_CONFIGS[network]?.name || network}`);
    
    // Validate network
    if (!NETWORK_CONFIGS[network]) {
      return res.status(400).json({ error: 'Invalid network specified' });
    }
    
    // Only handle single transactions
    if (!signedTransaction) {
      return res.status(400).json({ error: 'Signed transaction is required' });
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
        // Don't fail the whole request if email fails - atomic group is already confirmed
      }
    }

    res.json({
      success: true,
      transactionId: primaryTxId,
      applicationId: appId,
      contractAddress: contractAddress,
      confirmedRound: confirmedTxn['confirmed-round'],
      notificationSent: notificationResult.success,
      notificationMethod: notificationResult.method
    });

  } catch (error) {
    console.error('❌ Error submitting transaction:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to submit transaction' 
    });
  }
});

// API endpoint to claim funds
app.post('/api/claim-funds', async (req, res) => {
  try {
    const { claimCode, walletAddress, network = 'testnet' } = req.body;
    
    console.log(`📥 Received claim-funds request:`, {
      claimCode: claimCode ? `${claimCode.substring(0, 8)}...` : 'undefined',
      walletAddress: walletAddress ? `${walletAddress.substring(0, 8)}...` : 'undefined',
      network
    });

    // Validate network
    if (!NETWORK_CONFIGS[network]) {
      return res.status(400).json({ error: 'Invalid network specified' });
    }

    // Validate input
    if (!claimCode || !claimCode.trim()) {
      return res.status(400).json({ error: 'Claim code is required' });
    }
    
    if (!walletAddress || !walletAddress.trim()) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    // Validate wallet address
    let validatedWalletAddress;
    try {
      validatedWalletAddress = validateAlgorandAddress(walletAddress);
    } catch (addressError) {
      return res.status(400).json({ error: `Invalid wallet address: ${addressError.message}` });
    }

    // Get claim information
    const claimInfo = getClaim(claimCode.trim().toUpperCase());
    if (!claimInfo) {
      return res.status(404).json({ error: 'Invalid claim code. Please check your code and try again.' });
    }

    // Check if already claimed
    if (claimInfo.claimed) {
      return res.status(400).json({ error: 'This claim code has already been used.' });
    }

    // Check if network matches
    if (claimInfo.network !== network) {
      return res.status(400).json({ 
        error: `This claim code is for ${NETWORK_CONFIGS[claimInfo.network].name}, but you're on ${NETWORK_CONFIGS[network].name}. Please switch networks.` 
      });
    }

    console.log(`✅ Valid claim found: ${claimInfo.amount} ALGO for ${claimInfo.recipient}`);
    console.log(`📝 Claim info details:`, {
      applicationId: claimInfo.applicationId,
      contractAddress: claimInfo.contractAddress,
      amount: claimInfo.amount,
      network: claimInfo.network,
      hasClaimHash: !!claimInfo.hashedClaimCode,
      hasFundingTxId: !!claimInfo.fundingTxId,
      txId: claimInfo.txId?.substring(0, 10) + '...',
      fundingTxId: claimInfo.fundingTxId?.substring(0, 10) + '...' || 'None',
      createdAt: claimInfo.createdAt
    });

    // Check if we have the application ID
    if (!claimInfo.applicationId) {
      return res.status(400).json({ 
        error: 'Contract not yet deployed. Please wait for the sender to complete the transaction first.' 
      });
    }

    // Create Algorand client for the network
    const algodClient = createAlgodClient(network);

    // Check if user needs seeding before proceeding with claim
    console.log('🔍 Checking if user needs seed funding...');
    try {
      const needsSeeding = await seedWalletService.needsSeeding(validatedWalletAddress, network, 0.001);
      
      if (needsSeeding) {
        console.log(`💰 User needs seed funding. Attempting to fund ${validatedWalletAddress}...`);
        
        const seedResult = await seedWalletService.fundAccount(
          validatedWalletAddress, 
          0.004, // 0.004 ALGO for transaction fees
          network, 
          claimCode.trim().toUpperCase()
        );
        
        if (seedResult.success) {
          console.log(`✅ Seed funding successful:`);
          console.log(`   - Amount: ${seedResult.amount} ALGO`);
          console.log(`   - TX ID: ${seedResult.transactionId}`);
          console.log(`   - Remaining seed balance: ${seedResult.seedWalletBalance} ALGO`);
        } else {
          console.log(`⚠️ Seed funding failed: ${seedResult.message}`);
          
          // For rate limiting, return specific error
          if (seedResult.reason === 'rate_limited') {
            return res.status(429).json({ 
              error: seedResult.message 
            });
          }
          
          // For other failures, warn but continue with claim attempt
          console.log('⚠️ Continuing with claim attempt despite seeding failure');
        }
      } else {
        console.log('✅ User has sufficient balance, no seeding needed');
      }
    } catch (seedError) {
      console.error('❌ Error during seeding check/attempt:', seedError);
      // Continue with claim attempt even if seeding fails
      console.log('⚠️ Continuing with claim attempt despite seeding error');
    }

    // Check claimer's balance - warn but don't block if low
    try {
      const claimerInfo = await algodClient.accountInformation(validatedWalletAddress).do();
      const claimerBalance = typeof claimerInfo.amount === 'bigint' ? claimerInfo.amount : BigInt(claimerInfo.amount);
      console.log(`💰 Claimer balance: ${Number(claimerBalance) / 1000000} ALGO (${claimerBalance.toString()} microAlgos)`);
      
      if (claimerBalance < 1000n) { // Need at least 0.001 ALGO for transaction fee
        console.log('⚠️ Claimer still has low balance after seeding attempt');
      }
    } catch (balanceError) {
      console.error('❌ Error checking claimer balance:', balanceError);
    }

    // Check contract balance before proceeding
    try {
      const appAddress = algosdk.getApplicationAddress(claimInfo.applicationId);
      console.log(`🔍 Checking balance for App ID ${claimInfo.applicationId} at address ${appAddress}`);
      
      const accountInfo = await algodClient.accountInformation(appAddress).do();
      const contractBalance = typeof accountInfo.amount === 'bigint' ? accountInfo.amount : BigInt(accountInfo.amount);
      console.log(`📊 Contract balance: ${Number(contractBalance) / 1000000} ALGO (${contractBalance.toString()} microAlgos)`);
      
      if (contractBalance === 0n) {
        console.log(`❌ Contract at ${appAddress} has 0 balance!`);
        console.log(`   App ID: ${claimInfo.applicationId}`);
        console.log(`   Expected amount: ${claimInfo.amount} ALGO`);
        console.log(`   Has funding TX ID: ${!!claimInfo.fundingTxId}`);
        console.log(`   Claim created: ${claimInfo.createdAt}`);
        
        // Provide different error messages based on whether this was atomic or not
        const errorMessage = claimInfo.fundingTxId 
          ? `Contract was not funded properly during creation. This may be an old claim code created before atomic transactions were enabled. Please ask the sender to create a new claim.`
          : `Contract has not been funded yet. This claim was created but the funding step failed. Please ask the sender to try sending again.`;
          
        return res.status(400).json({
          error: errorMessage,
          contractAddress: appAddress.toString(),
          applicationId: claimInfo.applicationId
        });
      }
      
      // Check if contract has enough to pay the claim amount + fee
      const claimAmountMicroAlgos = BigInt(Math.floor(claimInfo.amount * 1000000));
      const requiredAmount = claimAmountMicroAlgos + 1000n; // Amount + fee for inner tx
      if (contractBalance < requiredAmount) {
        return res.status(400).json({
          error: `Contract has insufficient funds. Has ${Number(contractBalance) / 1000000} ALGO but needs ${Number(requiredAmount) / 1000000} ALGO (${claimInfo.amount} + 0.001 for fees).`
        });
      }
    } catch (balanceError) {
      console.error('❌ Error checking contract balance:', balanceError);
      return res.status(500).json({
        error: 'Unable to verify contract balance. Please try again later.'
      });
    }

    // Get suggested parameters
    let suggestedParams;
    try {
      suggestedParams = await algodClient.getTransactionParams().do();
    } catch (paramError) {
      console.error('❌ Failed to fetch transaction parameters:', paramError);
      throw new Error(`Network connection failed: ${paramError.message}`);
    }

    // Create application call transaction to claim funds
    console.log('📝 Creating claim transaction...');
    const claimHash = hashClaimCode(claimCode.trim().toUpperCase());
    
    const appArgs = [
      new TextEncoder().encode('claim'),
      claimHash
    ];

    // Use minimum fee - we'll implement fee sponsorship in future
    // For now, the claimer needs minimal ALGO for fees

    const appCallTxn = algosdk.makeApplicationCallTxnFromObject({
      sender: validatedWalletAddress,
      suggestedParams: suggestedParams,
      appIndex: claimInfo.applicationId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs: appArgs
    });

    // Encode the transaction for signing
    const txnToSign = Buffer.from(algosdk.encodeUnsignedTransaction(appCallTxn)).toString('base64');

    console.log(`✅ Claim transaction created for app ${claimInfo.applicationId}`);
    console.log(`- Claimer: ${validatedWalletAddress}`);
    console.log(`- Amount: ${claimInfo.amount} ALGO`);

    // For now, return the transaction to be signed by the frontend
    // The frontend will sign and submit it back
    res.json({
      success: false, // Not yet complete - needs signing
      requiresSigning: true,
      transactionToSign: txnToSign,
      amount: claimInfo.amount,
      message: claimInfo.message,
      claimCode: claimCode.trim().toUpperCase()
    });

  } catch (error) {
    console.error('❌ Error claiming funds:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error occurred while claiming funds' 
    });
  }
});

// API endpoint to submit signed claim transaction
app.post('/api/submit-claim', async (req, res) => {
  try {
    const { signedTransaction, claimCode, network = 'testnet' } = req.body;
    
    console.log(`📥 Received submit-claim request for claim code ${claimCode?.substring(0, 8)}...`);
    
    // Validate network
    if (!NETWORK_CONFIGS[network]) {
      return res.status(400).json({ error: 'Invalid network specified' });
    }
    
    if (!signedTransaction) {
      return res.status(400).json({ error: 'Signed transaction is required' });
    }

    if (!claimCode) {
      return res.status(400).json({ error: 'Claim code is required' });
    }

    // Get claim information
    const claimInfo = getClaim(claimCode.trim().toUpperCase());
    if (!claimInfo) {
      return res.status(404).json({ error: 'Invalid claim code' });
    }

    // Check if already claimed
    if (claimInfo.claimed) {
      return res.status(400).json({ error: 'This claim code has already been used.' });
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

    res.json({
      success: true,
      transactionId: txId,
      amount: claimInfo.amount,
      confirmedRound: confirmedTxn['confirmed-round'],
      message: claimInfo.message
    });

  } catch (error) {
    console.error('❌ Error submitting claim transaction:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to submit claim transaction' 
    });
  }
});

// API endpoint to submit a simple signed transaction (for funding)
app.post('/api/submit-funding-transaction', async (req, res) => {
  try {
    const { signedTransaction, network = 'testnet', claimCode } = req.body;
    
    console.log(`📥 Received funding transaction submission`);
    
    // Validate network
    if (!NETWORK_CONFIGS[network]) {
      return res.status(400).json({ error: 'Invalid network specified' });
    }
    
    if (!signedTransaction) {
      return res.status(400).json({ error: 'Signed transaction is required' });
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

    res.json({
      success: true,
      transactionId: txId,
      confirmedRound: confirmedTxn['confirmed-round']
    });

  } catch (error) {
    console.error('❌ Error submitting funding transaction:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to submit funding transaction' 
    });
  }
});

// API endpoint to fund contract after creation
app.post('/api/fund-contract', async (req, res) => {
  try {
    const { applicationId, amount, senderAddress, network = 'testnet' } = req.body;
    
    console.log(`📥 Received fund-contract request for app ${applicationId}`);
    
    // Validate network
    if (!NETWORK_CONFIGS[network]) {
      return res.status(400).json({ error: 'Invalid network specified' });
    }
    
    // Validate inputs
    if (!applicationId || applicationId <= 0) {
      return res.status(400).json({ error: 'Valid application ID is required' });
    }
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }
    
    // Validate sender address
    let validatedSenderAddress;
    try {
      validatedSenderAddress = validateAlgorandAddress(senderAddress);
    } catch (addressError) {
      return res.status(400).json({ error: `Invalid sender address: ${addressError.message}` });
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
    
    res.json({
      transactionToSign: txnToSign,
      transactionId: txId,
      contractAddress: appAddress.toString()
    });
    
  } catch (error) {
    console.error('❌ Error creating funding transaction:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to create funding transaction' 
    });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const network = req.query.network || 'testnet';
    
    // Validate network
    if (!NETWORK_CONFIGS[network]) {
      return res.status(400).json({ error: 'Invalid network specified' });
    }

    // Test Algorand connection
    const algodClient = createAlgodClient(network);
    const status = await algodClient.status().do();
    
    // Check seed wallet status
    const seedWalletStatus = await seedWalletService.checkSeedWalletBalance(network);
    
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      algorand: {
        network: NETWORK_CONFIGS[network].name,
        node: NETWORK_CONFIGS[network].algodServer,
        lastRound: status['last-round']
      },
      services: {
        email: isValidPicaConfig ? 'connected' : 'simulated',
        seedWallet: seedWalletStatus.configured ? {
          status: 'configured',
          address: seedWalletStatus.address,
          balance: `${seedWalletStatus.balance} ALGO`
        } : {
          status: 'not_configured'
        }
      }
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      timestamp: new Date().toISOString(),
      error: error.message 
    });
  }
});

// API endpoint to get seed wallet address for contributions
app.get('/api/seed-wallet-address', async (req, res) => {
  try {
    const network = req.query.network || 'testnet';
    
    // Validate network
    if (!NETWORK_CONFIGS[network]) {
      return res.status(400).json({ error: 'Invalid network specified' });
    }
    
    // Check seed wallet status
    const seedWalletStatus = await seedWalletService.checkSeedWalletBalance(network);
    
    if (!seedWalletStatus.configured) {
      return res.status(503).json({ 
        error: 'Seed wallet service not configured',
        configured: false
      });
    }
    
    res.json({
      configured: true,
      address: seedWalletStatus.address,
      balance: seedWalletStatus.balance,
      recommendedContribution: 0.005 // ALGO
    });
  } catch (error) {
    console.error('❌ Error getting seed wallet address:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to get seed wallet address'
    });
  }
});

// Debug endpoint to check claim status (only for development)
app.get('/api/debug/claims', (req, res) => {
  try {
    const claims = Array.from(claimStorage.entries()).map(([code, data]) => ({
      code: code.substring(0, 8) + '...',
      amount: data.amount,
      recipient: data.recipient,
      applicationId: data.applicationId,
      contractAddress: data.contractAddress,
      claimed: data.claimed,
      fundingTxId: data.fundingTxId ? data.fundingTxId.substring(0, 10) + '...' : null,
      createdAt: data.createdAt,
      network: data.network
    }));
    
    res.json({
      totalClaims: claims.length,
      claims: claims
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to clear incomplete claims (only for development)
app.post('/api/debug/clear-incomplete-claims', (req, res) => {
  try {
    let removed = 0;
    const toRemove = [];
    
    for (const [code, data] of claimStorage.entries()) {
      // Remove claims that don't have applicationId (incomplete deployment)
      if (!data.applicationId) {
        toRemove.push(code);
        removed++;
      }
    }
    
    toRemove.forEach(code => claimStorage.delete(code));
    
    res.json({
      message: `Removed ${removed} incomplete claims`,
      removedCount: removed,
      remainingClaims: claimStorage.size
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to check seed wallet status
app.get('/api/debug/seed-wallet', async (req, res) => {
  try {
    const network = req.query.network || 'testnet';
    const seedWalletStatus = await seedWalletService.checkSeedWalletBalance(network);
    
    res.json({
      seedWallet: seedWalletStatus,
      isConfigured: seedWalletStatus.configured
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// New contract-based claim endpoint
app.post('/api/claim-with-code', async (req, res) => {
  try {
    const { applicationId, claimCode, walletAddress, network = 'testnet' } = req.body;
    
    console.log(`📥 Received claim-with-code request for app ${applicationId}`);
    
    // Validate network
    if (!NETWORK_CONFIGS[network]) {
      return res.status(400).json({ error: 'Invalid network specified' });
    }
    
    // Validate inputs
    if (!applicationId || applicationId <= 0) {
      return res.status(400).json({ error: 'Valid application ID is required' });
    }
    
    if (!claimCode || !claimCode.trim()) {
      return res.status(400).json({ error: 'Claim code is required' });
    }
    
    // Validate wallet address
    let validatedWalletAddress;
    try {
      validatedWalletAddress = validateAlgorandAddress(walletAddress);
    } catch (addressError) {
      return res.status(400).json({ error: `Invalid wallet address: ${addressError.message}` });
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
    
    res.json({
      transactionToSign: txnToSign,
      transactionId: txId,
      applicationId: applicationId
    });
    
  } catch (error) {
    console.error('❌ Error creating claim transaction:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error occurred while creating claim transaction' 
    });
  }
});

// New contract-based refund endpoint
app.post('/api/refund-funds', async (req, res) => {
  try {
    const { applicationId, walletAddress, network = 'testnet' } = req.body;
    
    console.log(`📥 Received refund-funds request for app ${applicationId}`);
    
    // Validate network
    if (!NETWORK_CONFIGS[network]) {
      return res.status(400).json({ error: 'Invalid network specified' });
    }
    
    // Validate inputs
    if (!applicationId || applicationId <= 0) {
      return res.status(400).json({ error: 'Valid application ID is required' });
    }
    
    // Validate wallet address
    let validatedWalletAddress;
    try {
      validatedWalletAddress = validateAlgorandAddress(walletAddress);
    } catch (addressError) {
      return res.status(400).json({ error: `Invalid wallet address: ${addressError.message}` });
    }
    
    // Create Algorand client
    const algodClient = createAlgodClient(network);
    
    // Get suggested parameters
    const suggestedParams = await algodClient.getTransactionParams().do();
    
    // Create application call transaction to refund funds
    const refundTxn = algosdk.makeApplicationCallTxnFromObject({
      sender: validatedWalletAddress,
      suggestedParams: suggestedParams,
      appIndex: applicationId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs: [
        new TextEncoder().encode('refund')
      ]
    });
    
    // Encode transaction for signing
    const txnToSign = Buffer.from(algosdk.encodeUnsignedTransaction(refundTxn)).toString('base64');
    const txId = refundTxn.txID();
    
    console.log(`✅ Refund transaction created: ${txId}`);
    
    res.json({
      transactionToSign: txnToSign,
      transactionId: txId,
      applicationId: applicationId
    });
    
  } catch (error) {
    console.error('❌ Error creating refund transaction:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error occurred while creating refund transaction' 
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 RandCash API server running on port ${PORT}`);
  console.log(`Supported networks:`);
  Object.entries(NETWORK_CONFIGS).forEach(([key, config]) => {
    console.log(`  - ${config.name}: ${config.algodServer}`);
  });
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📧 Pica/Resend Email: ${isValidPicaConfig ? 'Configured' : 'Not configured (will simulate)'}`);
  console.log(`💰 Seed Wallet: ${seedWalletService.isConfigured ? 'Configured' : 'Not configured (seeding will be skipped)'}`);
});