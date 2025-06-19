import algosdk from 'algosdk';
import crypto from 'crypto';
import { createAlgodClient, validateAlgorandAddress, NETWORK_CONFIGS } from '../../utils/algorandClient.js';
import { storeClaim } from '../../utils/storage.js';

// Generate secure random claim code
function generateClaimCode() {
  return crypto.randomBytes(16).toString('hex').toUpperCase();
}

// Hash claim code for smart contract
function hashClaimCode(code) {
  return crypto.createHash('sha256').update(code).digest();
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

// Create single app creation transaction
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
    const { amount, recipient, message, senderAddress, network = 'testnet' } = JSON.parse(event.body);

    console.log(`📥 Received create-claim request:`, {
      amount,
      recipient: recipient ? `${recipient.substring(0, 5)}...` : 'undefined',
      senderAddress: senderAddress ? `${senderAddress.substring(0, 8)}...` : 'undefined',
      network,
      hasMessage: !!message
    });

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

    // Validate input
    if (!amount || amount <= 0) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Invalid amount' })
      };
    }
    
    if (!recipient || !recipient.trim()) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Recipient email is required' })
      };
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipient.trim())) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Please provide a valid email address' })
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

    // Additional validation for MainNet
    if (network === 'mainnet' && amount > 10) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Maximum amount on MainNet is 10 ALGO for safety' })
      };
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

    console.log(`🎉 Single transaction created successfully on ${NETWORK_CONFIGS[network].name}:`);
    console.log(`- Claim code: ${claimCode}`);
    console.log(`- Transaction ID: ${txId}`);
    console.log(`- Program hash: ${programHash}`);

    // Return response
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
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
      })
    };

  } catch (error) {
    console.error('❌ Error creating claim:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: error.message || 'Internal server error occurred while creating claim' 
      })
    };
  }
};