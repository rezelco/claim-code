import algosdk from 'algosdk';
import { createAlgodClient } from './algorandClient.js';

// Copy of the seed wallet service for serverless functions
class SeedWalletService {
  constructor() {
    this.seedMnemonic = process.env.SEED_MNEMONIC;
    this.isConfigured = !!this.seedMnemonic && this.seedMnemonic !== 'your_25_word_mnemonic_here';
    
    if (this.isConfigured) {
      try {
        this.seedAccount = algosdk.mnemonicToSecretKey(this.seedMnemonic);
        console.log('✅ Seed wallet configured:', this.seedAccount.addr);
      } catch (error) {
        console.error('❌ Invalid seed mnemonic:', error.message);
        this.isConfigured = false;
      }
    } else {
      console.log('💰 Seed wallet not configured - seeding will be skipped');
    }
    
    // Rate limiting: track funding per address per hour
    this.fundingHistory = new Map(); // address -> timestamp[]
  }

  // Check if seeding is needed
  async needsSeeding(address, network = 'testnet', minimumBalance = 0.001) {
    if (!this.isConfigured) return false;
    
    try {
      const algodClient = createAlgodClient(network);
      const accountInfo = await algodClient.accountInformation(address).do();
      const balance = typeof accountInfo.amount === 'bigint' ? accountInfo.amount : BigInt(accountInfo.amount);
      const balanceAlgo = Number(balance) / 1000000;
      
      console.log(`💰 Account ${address} balance: ${balanceAlgo} ALGO`);
      return balanceAlgo < minimumBalance;
    } catch (error) {
      if (error.message.includes('account does not exist')) {
        console.log(`💰 Account ${address} does not exist, needs seeding`);
        return true;
      }
      console.error('❌ Error checking account balance:', error);
      return false;
    }
  }

  // Check rate limiting
  isRateLimited(address) {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    if (!this.fundingHistory.has(address)) {
      return false;
    }
    
    const addressHistory = this.fundingHistory.get(address);
    // Remove old entries
    const recentFunding = addressHistory.filter(timestamp => timestamp > oneHourAgo);
    this.fundingHistory.set(address, recentFunding);
    
    // Allow max 3 funding requests per hour per address
    return recentFunding.length >= 3;
  }

  // Record funding attempt
  recordFunding(address) {
    const now = Date.now();
    if (!this.fundingHistory.has(address)) {
      this.fundingHistory.set(address, []);
    }
    this.fundingHistory.get(address).push(now);
  }

  // Fund an account
  async fundAccount(targetAddress, amount = 0.004, network = 'testnet', claimCode = null) {
    if (!this.isConfigured) {
      return {
        success: false,
        message: 'Seed wallet not configured',
        reason: 'not_configured'
      };
    }

    // Check rate limiting
    if (this.isRateLimited(targetAddress)) {
      return {
        success: false,
        message: 'Rate limited: Too many funding requests for this address. Please wait before requesting more funds.',
        reason: 'rate_limited'
      };
    }

    try {
      const algodClient = createAlgodClient(network);
      
      // Check seed wallet balance
      const seedInfo = await algodClient.accountInformation(this.seedAccount.addr).do();
      const seedBalance = typeof seedInfo.amount === 'bigint' ? seedInfo.amount : BigInt(seedInfo.amount);
      const seedBalanceAlgo = Number(seedBalance) / 1000000;
      
      if (seedBalanceAlgo < (amount + 0.001)) {
        return {
          success: false,
          message: 'Insufficient seed wallet balance. Please contribute to the seed wallet.',
          reason: 'insufficient_balance'
        };
      }

      // Create funding transaction
      const suggestedParams = await algodClient.getTransactionParams().do();
      const fundingTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: this.seedAccount.addr,
        receiver: targetAddress,
        amount: Math.floor(amount * 1000000), // Convert to microAlgos
        suggestedParams: suggestedParams,
        note: new TextEncoder().encode(`RandCash seed funding${claimCode ? ` for claim ${claimCode}` : ''}`)
      });

      // Sign and submit
      const signedTxn = algosdk.signTransaction(fundingTxn, this.seedAccount.sk);
      const txResponse = await algodClient.sendRawTransaction(signedTxn).do();
      const txId = txResponse.txid || txResponse.txId;

      // Wait for confirmation
      await algosdk.waitForConfirmation(algodClient, txId, 10);

      // Record successful funding
      this.recordFunding(targetAddress);

      return {
        success: true,
        transactionId: txId,
        amount: amount,
        seedWalletBalance: seedBalanceAlgo - amount - 0.001
      };

    } catch (error) {
      console.error('❌ Seed funding failed:', error);
      return {
        success: false,
        message: `Seed funding failed: ${error.message}`,
        reason: 'transaction_failed'
      };
    }
  }

  // Check seed wallet balance
  async checkSeedWalletBalance(network = 'testnet') {
    if (!this.isConfigured) {
      return {
        configured: false,
        balance: 0,
        address: null
      };
    }

    try {
      const algodClient = createAlgodClient(network);
      const accountInfo = await algodClient.accountInformation(this.seedAccount.addr).do();
      const balance = typeof accountInfo.amount === 'bigint' ? accountInfo.amount : BigInt(accountInfo.amount);
      const balanceAlgo = Number(balance) / 1000000;

      return {
        configured: true,
        address: this.seedAccount.addr,
        balance: balanceAlgo
      };
    } catch (error) {
      console.error('❌ Error checking seed wallet balance:', error);
      return {
        configured: true,
        address: this.seedAccount.addr,
        balance: 0,
        error: error.message
      };
    }
  }
}

// Export singleton instance
export default new SeedWalletService();