import algosdk from 'algosdk';
import crypto from 'crypto';
import { createAlgodClient, validateAlgorandAddress, NETWORK_CONFIGS } from '../../utils/algorandClient.js';

// Generate secure random claim code
function generateClaimCode() {
  return crypto.randomBytes(16).toString('hex').toUpperCase();
}

// Hash claim code for smart contract
function hashClaimCode(code) {
  // Ensure we're working with consistent UTF-8 encoding
  return crypto.createHash('sha256').update(code, 'utf8').digest();
}

// Create TEAL contract for hash-based claiming with refund after 5 minutes (for testing)
function createHashClaimContractTeal(hashedClaimCode, senderAddress, amount) {
  const tealProgram = `#pragma version 6

// Branch on application lifecycle call
txn ApplicationID
int 0
==
bnz handle_creation

txn OnCompletion
int NoOp
==
bnz handle_noop

txn OnCompletion
int CloseOut
==
bnz handle_closeout

txn OnCompletion
int DeleteApplication
==
bnz handle_delete

// Default: reject
int 0
return

////////////////////////
// Handle App Creation
////////////////////////
handle_creation:
    // Store: hash, amount, sender, created, claimed = 0
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

    byte "claimed"
    int 0
    app_global_put

    int 1
    return

////////////////////////
// Handle NoOp (claim or refund)
////////////////////////
handle_noop:
    txna ApplicationArgs 0
    byte "claim"
    ==
    bnz handle_claim

    txna ApplicationArgs 0
    byte "refund"
    ==
    bnz handle_refund

    int 0
    return

////////////////////////
// Secure Claim
////////////////////////
handle_claim:
    // Require: hash(plaintext_code) == stored hash AND not claimed
    txna ApplicationArgs 1
    sha256
    byte "hash"
    app_global_get
    ==
    assert

    byte "claimed"
    app_global_get
    int 0
    ==
    assert

    // Set claimed = 1
    byte "claimed"
    int 1
    app_global_put

    // Ensure contract has sufficient balance
    global CurrentApplicationAddress
    balance
    byte "amount"
    app_global_get
    >=
    assert

    // Send amount to caller (txn Sender)
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

    txn Sender
    itxn_field CloseRemainderTo

    itxn_submit

    int 1
    return

////////////////////////
// Refund (after 5 minutes, if not claimed, by original sender)
////////////////////////
handle_refund:
    // Must be > 5 minutes since creation
    global LatestTimestamp
    byte "created"
    app_global_get
    -
    int 300
    >=
    assert

    // Must not already be claimed
    byte "claimed"
    app_global_get
    int 0
    ==
    assert

    // Must be original sender
    txn Sender
    byte "sender"
    app_global_get
    ==
    assert

    // Set claimed = 1
    byte "claimed"
    int 1
    app_global_put

    // Ensure contract has sufficient balance
    global CurrentApplicationAddress
    balance
    byte "amount"
    app_global_get
    >=
    assert

    // Refund sender
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

    byte "sender"
    app_global_get
    itxn_field CloseRemainderTo

    itxn_submit

    int 1
    return

////////////////////////
// CloseOut Safety (only if balance is 0 and caller is sender)
////////////////////////
handle_closeout:
    txn Sender
    byte "sender"
    app_global_get
    ==
    assert

    global CurrentApplicationAddress
    balance
    int 10000  // Allow up to 0.01 ALGO remaining (for fees/minimum balance)
    <=
    assert

    int 1
    return

////////////////////////
// Delete Application (only if balance is minimal and caller is sender)
////////////////////////
handle_delete:
    txn Sender
    byte "sender"
    app_global_get
    ==
    assert

    global CurrentApplicationAddress
    balance
    int 10000  // Allow up to 0.01 ALGO remaining (for fees/minimum balance)
    <=
    assert

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
    // Parse and validate request body
    let requestBody;
    try {
      requestBody = JSON.parse(event.body);
    } catch (parseError) {
      console.error('❌ Invalid JSON in request body:', parseError.message);
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Invalid JSON in request body',
          details: parseError.message
        })
      };
    }

    const { amount, recipient, message, senderAddress, network = 'testnet' } = requestBody;

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
    
    // Email is now optional - only validate format if provided
    if (recipient && recipient.trim()) {
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
    
    console.log('🔑 Claim code details:');
    console.log(`- Claim code: ${claimCode}`);
    console.log(`- Claim code length: ${claimCode.length}`);
    console.log(`- Hash length: ${hashedClaimCode.length}`);
    console.log(`- Hash (hex): ${hashedClaimCode.toString('hex')}`);
    
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

    // No longer storing claim information - keeping system stateless
    console.log(`✅ Created claim transaction - no server storage needed`);

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