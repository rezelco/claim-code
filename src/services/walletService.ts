import algosdk from 'algosdk';
import { getNetworkConfig } from './networkService';

class WalletService {
  private peraWallet: any = null;
  private connected: boolean = false;
  private account: string = '';
  
  // Timeout configuration
  private readonly INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
  private readonly WARNING_BEFORE_DISCONNECT_MS = 60 * 1000; // 1 minute warning
  private inactivityTimer: NodeJS.Timeout | null = null;
  private warningTimer: NodeJS.Timeout | null = null;
  private activityListeners: Array<{ type: string; handler: () => void }> = [];
  private onTimeoutWarning?: (timeRemaining: number) => void;
  private onAutoDisconnect?: () => void;

  constructor() {
    this.initializeFromStorage();
    this.initializeWallet();
    this.setupNetworkListener();
  }

  private async initializeWallet() {
    try {
      // Dynamically import Pera Wallet
      const { PeraWalletConnect } = await import('@perawallet/connect');
      const networkConfig = getNetworkConfig();
      
      this.peraWallet = new PeraWalletConnect({
        chainId: networkConfig.chainId
      });

      // Attempt to reconnect existing session on load
      this.attemptReconnectOnLoad();
    } catch (error) {
      console.error('Error initializing Pera wallet:', error);
    }
  }

  private async attemptReconnectOnLoad() {
    if (!this.peraWallet) return;

    try {
      const accounts = await this.peraWallet.reconnectSession();
      if (accounts.length > 0) {
        this.account = accounts[0];
        this.connected = true;
        localStorage.setItem('wallet_connected', 'true');
        localStorage.setItem('wallet_account', this.account);
        
        // Start activity tracking for auto-disconnect
        this.setupActivityTracking();
      }
    } catch (error) {
      // No existing session to reconnect, which is fine
      console.debug('No existing session to reconnect:', error);
    }
  }

  private initializeFromStorage() {
    const stored = localStorage.getItem('wallet_connected');
    const storedAccount = localStorage.getItem('wallet_account');
    
    if (stored === 'true' && storedAccount) {
      this.connected = true;
      this.account = storedAccount;
    }
  }

  private setupNetworkListener() {
    // Listen for network changes and reinitialize wallet
    window.addEventListener('networkChanged', () => {
      this.handleNetworkChange();
    });
  }

  private setupActivityTracking() {
    if (!this.connected) return;

    // Define activity events to track
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    const handleActivity = () => {
      this.resetInactivityTimer();
    };

    // Add event listeners
    activityEvents.forEach(event => {
      const listener = { type: event, handler: handleActivity };
      this.activityListeners.push(listener);
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Start the inactivity timer
    this.resetInactivityTimer();
  }

  private cleanupActivityTracking() {
    // Remove all activity event listeners
    this.activityListeners.forEach(({ type, handler }) => {
      document.removeEventListener(type, handler);
    });
    this.activityListeners = [];

    // Clear any existing timers
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }
  }

  private resetInactivityTimer() {
    // Clear existing timers
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }
    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
    }

    // Set warning timer (1 minute before disconnect)
    this.warningTimer = setTimeout(() => {
      if (this.onTimeoutWarning) {
        this.onTimeoutWarning(this.WARNING_BEFORE_DISCONNECT_MS / 1000); // Convert to seconds
      }
    }, this.INACTIVITY_TIMEOUT_MS - this.WARNING_BEFORE_DISCONNECT_MS);

    // Set disconnect timer
    this.inactivityTimer = setTimeout(() => {
      this.handleInactivityTimeout();
    }, this.INACTIVITY_TIMEOUT_MS);
  }

  private async handleInactivityTimeout() {
    console.log('Wallet auto-disconnecting due to inactivity');
    
    // Notify about auto-disconnect
    if (this.onAutoDisconnect) {
      this.onAutoDisconnect();
    }

    // Disconnect the wallet
    await this.disconnectWallet();
  }

  setTimeoutCallbacks(onWarning?: (timeRemaining: number) => void, onDisconnect?: () => void) {
    this.onTimeoutWarning = onWarning;
    this.onAutoDisconnect = onDisconnect;
  }

  private async handleNetworkChange() {
    const wasConnected = this.connected;
    
    if (wasConnected) {
      // Disconnect current wallet connection
      try {
        if (this.peraWallet) {
          await this.peraWallet.disconnect();
        }
      } catch (error) {
        console.warn('Error disconnecting wallet during network switch:', error);
      }
      
      // Clear connection state but keep account for reconnection
      this.connected = false;
      localStorage.setItem('wallet_connected', 'false');
    }
    
    // Reinitialize with new network
    await this.initializeWallet();
  }

  async connectWallet(): Promise<string> {
    try {
      if (!this.peraWallet) {
        throw new Error('Pera wallet not available');
      }

      let accounts: string[] = [];

      // First try to reconnect existing session
      try {
        accounts = await this.peraWallet.reconnectSession();
      } catch (error) {
        // No existing session, proceed with new connection
        console.debug('No existing session found, creating new connection');
      }

      // If no accounts from reconnection, create new connection
      if (accounts.length === 0) {
        accounts = await this.peraWallet.connect();
      }

      if (accounts.length === 0) {
        throw new Error('No accounts found');
      }

      this.account = accounts[0];
      this.connected = true;
      
      // Store in localStorage for persistence
      localStorage.setItem('wallet_connected', 'true');
      localStorage.setItem('wallet_account', this.account);
      
      // Start activity tracking for auto-disconnect
      this.setupActivityTracking();
      
      return this.account;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Check if the error is due to user cancellation
      const isUserCancellation = errorMessage.toLowerCase().includes('connect modal is closed by user') ||
                                errorMessage.toLowerCase().includes('user cancelled') ||
                                errorMessage.toLowerCase().includes('user canceled') ||
                                errorMessage.toLowerCase().includes('user rejected');
      
      if (isUserCancellation) {
        console.warn('Wallet connection cancelled by user:', errorMessage);
      } else {
        console.error('Wallet connection error:', error);
      }
      
      throw new Error(`Failed to connect Pera wallet: ${errorMessage}`);
    }
  }

  async disconnectWallet(): Promise<void> {
    try {
      if (this.peraWallet) {
        await this.peraWallet.disconnect();
      }
      
      this.connected = false;
      this.account = '';
      
      // Clean up activity tracking
      this.cleanupActivityTracking();
      
      localStorage.removeItem('wallet_connected');
      localStorage.removeItem('wallet_account');
    } catch (error) {
      console.error('Wallet disconnection error:', error);
      throw new Error('Failed to disconnect wallet');
    }
  }

  async isWalletConnected(): Promise<boolean> {
    return this.connected;
  }

  async getConnectedAccount(): Promise<string> {
    if (!this.connected) {
      throw new Error('Wallet not connected');
    }
    return this.account;
  }

  async signTransaction(transaction: algosdk.Transaction | string): Promise<Uint8Array> {
    if (!this.connected) {
      throw new Error('Wallet not connected');
    }

    try {
      if (!this.peraWallet) {
        throw new Error('Pera wallet not available for signing');
      }

      // Validate transaction input
      if (!transaction) {
        throw new Error('Transaction is required but was undefined or null');
      }

      // If transaction is a base64 string, decode it first
      let txn: algosdk.Transaction;
      if (typeof transaction === 'string') {
        if (transaction.trim() === '') {
          throw new Error('Transaction string is empty');
        }
        
        console.log('🔍 [Wallet] Decoding transaction string, length:', transaction.length);
        console.log('🔍 [Wallet] Transaction string preview:', transaction.substring(0, 50) + '...');
        
        try {
          const decodedTxn = new Uint8Array(Buffer.from(transaction, 'base64'));
          txn = algosdk.decodeUnsignedTransaction(decodedTxn);
          console.log('✅ [Wallet] Transaction decoded successfully');
        } catch (decodeError) {
          console.error('❌ [Wallet] Error decoding transaction:', decodeError);
          throw new Error(`Failed to decode transaction: ${decodeError instanceof Error ? decodeError.message : 'Unknown error'}`);
        }
      } else {
        console.log('🔍 [Wallet] Using transaction object directly');
        txn = transaction;
      }

      const txnToSign = [{
        txn: txn,
        signers: [this.account]
      }];
      const signedTxns = await this.peraWallet.signTransaction([txnToSign]);
      return signedTxns[0];
    } catch (error) {
      console.error('Transaction signing error:', error);
      throw new Error(`Failed to sign transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getWalletType(): 'pera' {
    return 'pera';
  }
}

const walletService = new WalletService();

export const connectWallet = () => walletService.connectWallet();
export const disconnectWallet = () => walletService.disconnectWallet();
export const isWalletConnected = () => walletService.isWalletConnected();
export const getConnectedAccount = () => walletService.getConnectedAccount();
export const signTransaction = (transaction: algosdk.Transaction | string) => walletService.signTransaction(transaction);
export const getWalletType = () => walletService.getWalletType();
export const setWalletTimeoutCallbacks = (onWarning?: (timeRemaining: number) => void, onDisconnect?: () => void) => 
  walletService.setTimeoutCallbacks(onWarning, onDisconnect);