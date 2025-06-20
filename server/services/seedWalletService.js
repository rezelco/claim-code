import algosdk from 'algosdk';
import 'dotenv/config';

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

// Rate limiting storage (in production, use Redis or database)
const seedingHistory = new Map();

// Clean up old entries every hour
setInterval(() => {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [key, timestamp] of seedingHistory.entries()) {
    if (timestamp < oneHourAgo) {
      seedingHistory.delete(key);
    }
  }
}, 60 * 60 * 1000);

class SeedWalletService {
  constructor() {
    this.seedMnemonic = process.env.SEED_MNEMONIC;
    this.isConfigured = this.validateConfiguration();
    
    if (this.isConfigured) {
      console.log('✅ Seed wallet service configured');
    } else {
      console.log('⚠️ Seed wallet not configured - Zero-balance seeding will be skipped');
    }
  }

  validateConfiguration() {
    if (!this.seedMnemonic || this.seedMnemonic === 'your_seed_wallet_mnemonic_phrase_here') {
      return false;
    }

    // Normalize the mnemonic string - remove extra whitespace and ensure single spaces
    const normalizedMnemonic = this.seedMnemonic
      .trim()                           // Remove leading/trailing whitespace
      .replace(/\s+/g, ' ')            // Replace multiple whitespace with single space
      .toLowerCase();                   // Convert to lowercase for consistency

    try {
      // Validate mnemonic format - support both 24 and 25 word mnemonics
      const words = normalizedMnemonic.split(' ');
      if (!(words.length === 24 || words.length === 25)) {
        console.error(`❌ Seed mnemonic must be exactly 24 or 25 words, got ${words.length} words`);
        return false;
      }

      // Test if we can derive an account from the normalized mnemonic
      const account = algosdk.mnemonicToSecretKey(normalizedMnemonic);
      
      // Check if the derived address looks valid
      const addressString = account.addr.toString();
      if (!algosdk.isValidAddress(addressString)) {
        console.error('❌ Invalid seed wallet mnemonic - cannot derive valid address');
        console.error(`   - Derived address: ${addressString}`);
        return false;
      }

      console.log(`📝 Seed wallet address: ${addressString}`);
      return true;
    } catch (error) {
      console.error('❌ Error validating seed mnemonic:', error.message);
      console.error('   - This usually indicates an invalid mnemonic phrase');
      console.error('   - Please verify your mnemonic is correct and properly formatted');
      return false;
    }
  }

  getSeedAccount() {
    if (!this.isConfigured) {
      throw new Error('Seed wallet not configured');
    }
    return algosdk.mnemonicToSecretKey(this.seedMnemonic);
  }

  async checkSeedWalletBalance(network = 'testnet') {
    if (!this.isConfigured) {
      return { configured: false, balance: 0 };
    }

    try {
      const algodClient = createAlgodClient(network);
      const seedAccount = this.getSeedAccount();
      
      const accountInfo = await algodClient.accountInformation(seedAccount.addr.toString()).do();
      const balance = typeof accountInfo.amount === 'bigint' ? accountInfo.amount : BigInt(accountInfo.amount);
      
      return {
        configured: true,
        address: seedAccount.addr.toString(),
        balance: Number(balance) / 1000000, // Convert to ALGO
        balanceMicroAlgos: Number(balance)
      };
    } catch (error) {
      console.error('❌ Error checking seed wallet balance:', error);
      throw new Error(`Failed to check seed wallet balance: ${error.message}`);
    }
  }

  async checkAccountBalance(address, network = 'testnet') {
    try {
      const algodClient = createAlgodClient(network);
      const accountInfo = await algodClient.accountInformation(address).do();
      const balance = typeof accountInfo.amount === 'bigint' ? accountInfo.amount : BigInt(accountInfo.amount);
      
      return {
        address: address,
        balance: Number(balance) / 1000000, // Convert to ALGO
        balanceMicroAlgos: Number(balance)
      };
    } catch (error) {
      // Account might not exist yet (0 balance)
      if (error.message.includes('account does not exist')) {
        return {
          address: address,
          balance: 0,
          balanceMicroAlgos: 0
        };
      }
      throw error;
    }
  }

  checkRateLimit(address, claimCode) {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    // Check IP-based rate limiting (simplified - using address as proxy)
    const addressKey = `addr_${address}`;
    const lastSeedTime = seedingHistory.get(addressKey);
    if (lastSeedTime && (now - lastSeedTime) < oneHour) {
      const remainingTime = Math.ceil((oneHour - (now - lastSeedTime)) / 60000);
      throw new Error(`Rate limit exceeded. Please wait ${remainingTime} minutes before requesting seed funding again.`);
    }

    // Check claim code rate limiting
    const claimKey = `claim_${claimCode}`;
    if (seedingHistory.has(claimKey)) {
      throw new Error('This claim code has already been used for seed funding.');
    }

    return true;
  }

  recordSeeding(address, claimCode) {
    const now = Date.now();
    seedingHistory.set(`addr_${address}`, now);
    seedingHistory.set(`claim_${claimCode}`, now);
  }

  async fundAccount(address, amount, network = 'testnet', claimCode = null) {
    if (!this.isConfigured) {
      console.log('⚠️ Seed wallet not configured - skipping account funding');
      return {
        success: false,
        reason: 'not_configured',
        message: 'Seed wallet not configured'
      };
    }

    try {
      // Validate inputs
      if (!algosdk.isValidAddress(address)) {
        throw new Error('Invalid recipient address');
      }

      if (!amount || amount <= 0) {
        throw new Error('Invalid amount - must be positive');
      }

      // Check rate limiting if claim code provided
      if (claimCode) {
        this.checkRateLimit(address, claimCode);
      }

      // Check seed wallet balance
      const seedBalance = await this.checkSeedWalletBalance(network);
      const requiredAmount = amount + 0.001; // Amount + transaction fee
      
      if (seedBalance.balance < requiredAmount) {
        console.error(`❌ Insufficient seed wallet balance: ${seedBalance.balance} ALGO, need ${requiredAmount} ALGO`);
        return {
          success: false,
          reason: 'insufficient_balance',
          message: `Seed wallet has insufficient balance. Has ${seedBalance.balance} ALGO, needs ${requiredAmount} ALGO.`,
          seedBalance: seedBalance.balance
        };
      }

      // Create Algorand client and get transaction parameters
      const algodClient = createAlgodClient(network);
      const suggestedParams = await algodClient.getTransactionParams().do();
      
      // Get seed account
      const seedAccount = this.getSeedAccount();
      
      // Create payment transaction
      const amountMicroAlgos = Math.floor(amount * 1000000);
      const paymentTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: seedAccount.addr.toString(),
        receiver: address,
        amount: amountMicroAlgos,
        suggestedParams: suggestedParams,
        note: new TextEncoder().encode(`RandCash seed funding: ${amount} ALGO`)
      });

      // Sign the transaction
      const signedTxn = paymentTxn.signTxn(seedAccount.sk);
      
      // Submit the transaction
      console.log(`💰 Sending ${amount} ALGO from seed wallet to ${address}...`);
      const txResponse = await algodClient.sendRawTransaction(signedTxn).do();
      const txId = txResponse?.txid || txResponse?.txId || txResponse?.transactionID;
      
      if (!txId) {
        throw new Error('No transaction ID returned from network');
      }

      // Wait for confirmation
      console.log('⏳ Waiting for seed funding confirmation...');
      const confirmedTxn = await algosdk.waitForConfirmation(algodClient, txId, 10);
      
      console.log(`✅ Seed funding successful:`);
      console.log(`   - Amount: ${amount} ALGO`);
      console.log(`   - To: ${address}`);
      console.log(`   - TX ID: ${txId}`);
      console.log(`   - Round: ${confirmedTxn['confirmed-round']}`);

      // Record the seeding for rate limiting
      if (claimCode) {
        this.recordSeeding(address, claimCode);
      }

      return {
        success: true,
        transactionId: txId,
        amount: amount,
        confirmedRound: confirmedTxn['confirmed-round'],
        seedWalletBalance: seedBalance.balance - amount - 0.001
      };

    } catch (error) {
      console.error('❌ Error funding account:', error);
      
      // Handle specific error types
      if (error.message.includes('Rate limit exceeded')) {
        return {
          success: false,
          reason: 'rate_limited',
          message: error.message
        };
      }
      
      if (error.message.includes('account does not exist')) {
        return {
          success: false,
          reason: 'account_not_found',
          message: 'Recipient account does not exist on the network'
        };
      }

      return {
        success: false,
        reason: 'funding_failed',
        message: `Failed to fund account: ${error.message}`
      };
    }
  }

  async needsSeeding(address, network = 'testnet', threshold = 0.001) {
    try {
      const accountInfo = await this.checkAccountBalance(address, network);
      return accountInfo.balance < threshold;
    } catch (error) {
      console.error('❌ Error checking if account needs seeding:', error);
      // If we can't check, assume it needs seeding to be safe
      return true;
    }
  }
}

// Create singleton instance
const seedWalletService = new SeedWalletService();

export default seedWalletService;
export { SeedWalletService };