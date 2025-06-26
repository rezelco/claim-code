import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Wallet, Mail, Phone, MessageSquare, CheckCircle, AlertCircle, Loader2, Info, RefreshCw, AlertTriangle, Copy, ExternalLink, Download, Clock, Trash2, List, Eye, EyeOff, HelpCircle } from 'lucide-react';
import { connectWallet, disconnectWallet, getConnectedAccount, isWalletConnected, signTransaction, setWalletTimeoutCallbacks } from '../services/walletService';
import { createClaim, submitTransaction, claimWithCode, refundFunds, fundContract, submitFundingTransaction, checkClaimStatus, getWalletContracts, deleteContract, submitDelete } from '../services/apiService';
import { getCurrentNetwork, getNetworkConfig, isTestNet, isMainNet } from '../services/networkService';
import { NetworkType } from '../types/network';
import NetworkSelector from './NetworkSelector';
import algosdk from 'algosdk';

interface ClaimResult {
  claimCode: string;
  transactionId: string;
  applicationId?: number;
  contractAddress?: string;
  notificationSent: boolean;
  notificationMethod: string;
  recipient: string;
  amount: number;
  message?: string;
  fundingTransactionId?: string;
  seedTransactionId?: string;
}

interface ClaimFundsResult {
  success: boolean;
  transactionId: string;
  amount: number;
  message?: string;
}

type TabType = 'send' | 'claim' | 'refund';

function MainApp() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('send');
  const [walletConnected, setWalletConnected] = useState(false);
  const [connectedAccount, setConnectedAccount] = useState<string>('');
  const walletConnectedRef = useRef(false);
  const [, setForceUpdate] = useState(0);
  const [, setCurrentNetwork] = useState<NetworkType>(getCurrentNetwork());
  
  // Send Money State
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [error, setError] = useState<string>('');
  const [step, setStep] = useState<'form' | 'signing' | 'submitting' | 'complete'>('form');
  const [showReconnectPrompt, setShowReconnectPrompt] = useState(false);
  const [copiedField, setCopiedField] = useState<string>('');
  const [showResultClaimCode, setShowResultClaimCode] = useState(false);

  // Claim Money State
  const [claimCode, setClaimCode] = useState('');
  const [showClaimCode, setShowClaimCode] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimResult, setClaimResult] = useState<ClaimFundsResult | null>(null);
  const [claimError, setClaimError] = useState<string>('');
  const [claimStep, setClaimStep] = useState<'form' | 'signing' | 'submitting' | 'complete'>('form');
  
  // Refund Money State
  const [refundApplicationId, setRefundApplicationId] = useState('');
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundResult, setRefundResult] = useState<ClaimFundsResult | null>(null);
  const [refundError, setRefundError] = useState<string>('');
  const [refundStep, setRefundStep] = useState<'form' | 'signing' | 'submitting' | 'complete'>('form');
  
  // Contract Management State
  const [contracts, setContracts] = useState<Array<{
    applicationId: number;
    contractAddress: string;
    status: string;
    amount: number;
    balance: number;
    claimed: boolean;
    canRefund: boolean;
    canDelete: boolean;
    createdTimestamp: number;
    createdDate: string | null;
  }>>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [contractsError, setContractsError] = useState<string>('');
  const [showContracts, setShowContracts] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<{[key: number]: boolean}>({});
  
  // Timeout warning state
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [timeoutSeconds, setTimeoutSeconds] = useState(60);

  useEffect(() => {
    checkWalletConnection();
    setupNetworkListener();
    
    // Setup wallet timeout callbacks
    setWalletTimeoutCallbacks(
      (remainingSeconds) => {
        setTimeoutSeconds(remainingSeconds);
        setShowTimeoutWarning(true);
      },
      () => {
        setShowTimeoutWarning(false);
        handleDisconnectWallet();
      }
    );
  }, []);

  const checkWalletConnection = async () => {
    const isConnected = await isWalletConnected();
    console.log(`🔍 Checking wallet connection: ${isConnected}`);
    
    if (isConnected) {
      const account = await getConnectedAccount();
      console.log(`📋 Got connected account: ${account}`);
      setWalletConnected(true);
      setConnectedAccount(account);
      walletConnectedRef.current = true;
    } else {
      console.log('❌ No wallet connected');
      setWalletConnected(false);
      setConnectedAccount('');
      walletConnectedRef.current = false;
    }
    
    // Force re-render to update UI
    setForceUpdate(prev => prev + 1);
  };

  const setupNetworkListener = () => {
    const handleNetworkChange = () => {
      console.log('🌐 Network changed, updating state');
      setCurrentNetwork(getCurrentNetwork());
      setForceUpdate(prev => prev + 1);
    };

    // Listen for custom network change events
    window.addEventListener('networkChanged', handleNetworkChange);
    
    return () => {
      window.removeEventListener('networkChanged', handleNetworkChange);
    };
  };

  const handleConnectWallet = async () => {
    setShowReconnectPrompt(false);
    try {
      console.log('🔌 Attempting to connect wallet...');
      const success = await connectWallet();
      console.log(`🔌 Wallet connection result: ${success}`);
      
      if (success) {
        await checkWalletConnection();
      }
    } catch (error) {
      console.error('❌ Wallet connection failed:', error);
    }
  };

  const handleDisconnectWallet = async () => {
    try {
      console.log('🔌 Disconnecting wallet...');
      await disconnectWallet();
      setWalletConnected(false);
      setConnectedAccount('');
      walletConnectedRef.current = false;
      setShowTimeoutWarning(false);
    } catch (error) {
      console.error('❌ Error disconnecting wallet:', error);
    }
  };

  const handleNetworkChange = (network: NetworkType) => {
    console.log(`🌐 Network changed to: ${network}`);
    setCurrentNetwork(network);
    // Clear any existing results/errors when switching networks
    setResult(null);
    setError('');
    setClaimResult(null);
    setClaimError('');
    setRefundResult(null);
    setRefundError('');
    setContracts([]);
    setShowContracts(false);
  };

  const resetSendForm = () => {
    setAmount('');
    setRecipient('');
    setMessage('');
    setResult(null);
    setError('');
    setStep('form');
    setShowReconnectPrompt(false);
  };

  const resetClaimForm = () => {
    setClaimCode('');
    setClaimResult(null);
    setClaimError('');
    setClaimStep('form');
  };

  const resetRefundForm = () => {
    setRefundApplicationId('');
    setRefundResult(null);
    setRefundError('');
    setRefundStep('form');
  };

  const handleSendMoney = async () => {
    if (!walletConnected || !connectedAccount) {
      console.log('⚠️ Wallet not connected, prompting user');
      setShowReconnectPrompt(true);
      return;
    }

    const amountFloat = parseFloat(amount);
    if (isNaN(amountFloat) || amountFloat <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (!recipient.trim()) {
      setError('Please enter a recipient email');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipient.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    setError('');
    setStep('signing');

    try {
      console.log('💰 Creating claim transaction...');
      
      // Create claim first
      const claimResponse = await createClaim({
        amount: amountFloat,
        recipient: recipient.trim(),
        message: message.trim(),
        senderAddress: connectedAccount
      });

      console.log('📋 Claim created:', claimResponse);

      if (claimResponse.isAtomic && claimResponse.deploymentTransactions) {
        // Handle atomic group transactions
        console.log('⚛️ Processing atomic group transactions...');
        setStep('signing');

        // Convert base64 transactions to Uint8Arrays for signing
        const unsignedTxns = claimResponse.deploymentTransactions.map(txnB64 => {
          const txnBytes = new Uint8Array(Buffer.from(txnB64, 'base64'));
          return algosdk.decodeUnsignedTransaction(txnBytes);
        });

        // Sign the atomic group
        const signedTxns = await signTransaction(unsignedTxns);
        console.log('✅ Atomic group signed successfully');

        setStep('submitting');

        // Submit the signed atomic group
        const submitResponse = await submitTransaction({
          signedTransactions: signedTxns
        });

        console.log('🎉 Atomic group submitted:', submitResponse);

        setResult({
          claimCode: claimResponse.claimCode,
          transactionId: submitResponse.transactionId,
          applicationId: submitResponse.applicationId,
          contractAddress: submitResponse.contractAddress,
          notificationSent: submitResponse.notificationSent || false,
          notificationMethod: submitResponse.notificationMethod || 'none',
          recipient: recipient.trim(),
          amount: amountFloat,
          message: message.trim()
        });
        setStep('complete');
      } else {
        // Handle legacy single transaction
        console.log('🔄 Processing single transaction...');
        const transactionToSign = claimResponse.deploymentTransaction;
        
        if (!transactionToSign) {
          throw new Error('No transaction to sign received from server');
        }

        setStep('signing');
        console.log('✍️ Signing transaction...');

        // Decode and sign the transaction
        const txnBytes = new Uint8Array(Buffer.from(transactionToSign, 'base64'));
        const unsignedTxn = algosdk.decodeUnsignedTransaction(txnBytes);
        const signedTxn = await signTransaction([unsignedTxn]);

        console.log('✅ Transaction signed successfully');
        setStep('submitting');

        // Submit the signed transaction
        const submitResponse = await submitTransaction({
          signedTransaction: signedTxn[0],
          claimDetails: {
            recipient: recipient.trim(),
            amount: amountFloat,
            message: message.trim(),
            claimCode: claimResponse.claimCode
          }
        });

        console.log('🎉 Transaction submitted:', submitResponse);

        setResult({
          claimCode: claimResponse.claimCode,
          transactionId: submitResponse.transactionId,
          applicationId: submitResponse.applicationId,
          contractAddress: submitResponse.contractAddress,
          notificationSent: submitResponse.notificationSent || false,
          notificationMethod: submitResponse.notificationMethod || 'none',
          recipient: recipient.trim(),
          amount: amountFloat,
          message: message.trim()
        });
        setStep('complete');
      }
    } catch (error) {
      console.error('❌ Send money failed:', error);
      setError(error instanceof Error ? error.message : 'Failed to send money');
      setStep('form');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClaimFunds = async () => {
    if (!walletConnected || !connectedAccount) {
      setShowReconnectPrompt(true);
      return;
    }

    if (!claimCode.trim()) {
      setClaimError('Please enter a claim code');
      return;
    }

    // Parse the claim code - it could be "appId-claimCode" or just "claimCode"
    let applicationId: number;
    let actualClaimCode: string;

    const parts = claimCode.trim().split('-');
    if (parts.length === 2) {
      // Format: "12345678-ABCD1234"
      applicationId = parseInt(parts[0]);
      actualClaimCode = parts[1];
      
      if (isNaN(applicationId)) {
        setClaimError('Invalid claim code format. Expected format: 12345678-ABCD1234');
        return;
      }
    } else if (parts.length === 1) {
      // Legacy format: just "ABCD1234"
      actualClaimCode = parts[0];
      // We'll need to prompt for the application ID or try to determine it
      setClaimError('Please use the full claim code format: ApplicationID-ClaimCode');
      return;
    } else {
      setClaimError('Invalid claim code format. Expected format: 12345678-ABCD1234');
      return;
    }

    setClaimLoading(true);
    setClaimError('');
    setClaimStep('signing');

    try {
      console.log('🎯 Creating claim transaction...');
      
      // Create claim transaction
      const claimResponse = await claimWithCode({
        applicationId: applicationId,
        claimCode: actualClaimCode,
        walletAddress: connectedAccount
      });

      console.log('📋 Claim transaction created:', claimResponse);
      setClaimStep('signing');

      // Sign the transaction
      const txnBytes = new Uint8Array(Buffer.from(claimResponse.transactionToSign, 'base64'));
      const unsignedTxn = algosdk.decodeUnsignedTransaction(txnBytes);
      const signedTxn = await signTransaction([unsignedTxn]);

      console.log('✅ Claim transaction signed');
      setClaimStep('submitting');

      // Submit the signed transaction
      const submitResponse = await submitTransaction({
        signedTransaction: signedTxn[0]
      });

      console.log('🎉 Claim submitted:', submitResponse);

      setClaimResult({
        success: true,
        transactionId: submitResponse.transactionId,
        amount: 0, // Will be updated by the response if available
        message: 'Funds claimed successfully!'
      });
      setClaimStep('complete');
    } catch (error) {
      console.error('❌ Claim failed:', error);
      setClaimError(error instanceof Error ? error.message : 'Failed to claim funds');
      setClaimStep('form');
    } finally {
      setClaimLoading(false);
    }
  };

  const handleRefundFunds = async () => {
    if (!walletConnected || !connectedAccount) {
      setShowReconnectPrompt(true);
      return;
    }

    const appId = parseInt(refundApplicationId);
    if (isNaN(appId) || appId <= 0) {
      setRefundError('Please enter a valid application ID');
      return;
    }

    setRefundLoading(true);
    setRefundError('');
    setRefundStep('signing');

    try {
      console.log('💸 Creating refund transaction...');
      
      // Create refund transaction
      const refundResponse = await refundFunds({
        applicationId: appId,
        walletAddress: connectedAccount
      });

      console.log('📋 Refund transaction created:', refundResponse);
      setRefundStep('signing');

      // Sign the transaction
      const txnBytes = new Uint8Array(Buffer.from(refundResponse.transactionToSign, 'base64'));
      const unsignedTxn = algosdk.decodeUnsignedTransaction(txnBytes);
      const signedTxn = await signTransaction([unsignedTxn]);

      console.log('✅ Refund transaction signed');
      setRefundStep('submitting');

      // Submit the signed transaction
      const submitResponse = await submitTransaction({
        signedTransaction: signedTxn[0]
      });

      console.log('🎉 Refund submitted:', submitResponse);

      setRefundResult({
        success: true,
        transactionId: submitResponse.transactionId,
        amount: 0, // Will be updated by the response if available
        message: 'Funds refunded successfully!'
      });
      setRefundStep('complete');
    } catch (error) {
      console.error('❌ Refund failed:', error);
      setRefundError(error instanceof Error ? error.message : 'Failed to refund funds');
      setRefundStep('form');
    } finally {
      setRefundLoading(false);
    }
  };

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(''), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const getExplorerUrl = (txId: string): string => {
    const config = getNetworkConfig();
    return `${config.explorerUrl}/tx/${txId}`;
  };

  const loadContracts = async () => {
    if (!walletConnected || !connectedAccount) {
      setContractsError('Please connect your wallet first');
      return;
    }

    setContractsLoading(true);
    setContractsError('');

    try {
      const response = await getWalletContracts(connectedAccount);
      setContracts(response.contracts);
    } catch (error) {
      setContractsError(error instanceof Error ? error.message : 'Failed to load contracts');
    } finally {
      setContractsLoading(false);
    }
  };

  const handleDeleteContract = async (applicationId: number) => {
    if (!walletConnected || !connectedAccount) {
      setContractsError('Please connect your wallet first');
      return;
    }

    setDeleteLoading(prev => ({ ...prev, [applicationId]: true }));
    setContractsError('');

    try {
      // Create delete transaction
      const deleteResponse = await deleteContract({
        applicationId,
        walletAddress: connectedAccount
      });

      // Sign the transaction
      const txnBytes = new Uint8Array(Buffer.from(deleteResponse.transactionToSign, 'base64'));
      const unsignedTxn = algosdk.decodeUnsignedTransaction(txnBytes);
      const signedTxn = await signTransaction([unsignedTxn]);

      // Submit the signed transaction
      const submitResponse = await submitDelete({
        signedTransaction: signedTxn[0],
        applicationId
      });

      console.log('Contract deleted successfully:', submitResponse);
      
      // Reload contracts to reflect the change
      await loadContracts();
    } catch (error) {
      console.error('Failed to delete contract:', error);
      setContractsError(error instanceof Error ? error.message : 'Failed to delete contract');
    } finally {
      setDeleteLoading(prev => ({ ...prev, [applicationId]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-800 via-purple-900 to-purple-950 relative overflow-hidden">
      
      {/* Content wrapper with relative positioning */}
      <div className="relative z-10">
      {/* Timeout Warning Modal */}
      {showTimeoutWarning && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 h-5 text-orange-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">Wallet Timeout Warning</h3>
                <p className="text-gray-600 mt-1">
                  Your wallet will automatically disconnect in {timeoutSeconds} seconds due to inactivity.
                </p>
                <div className="mt-4 flex space-x-3">
                  <button
                    onClick={() => {
                      setShowTimeoutWarning(false);
                      // Any interaction will reset the timer
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                  >
                    Keep Connected
                  </button>
                  <button
                    onClick={async () => {
                      setShowTimeoutWarning(false);
                      await handleDisconnectWallet();
                    }}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
                  >
                    Disconnect Now
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-purple-900/90 backdrop-blur-sm border-b border-purple-800/30 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center">
              <Send className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">RandCash</h1>
              <p className="text-sm text-purple-100">Send crypto with claim codes</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Network Selector */}
            <NetworkSelector onNetworkChange={handleNetworkChange} />
            
            {/* Help Button */}
            <button
              onClick={() => navigate('/guide')}
              className="p-2 bg-purple-500/30 hover:bg-purple-500/50 text-white rounded-lg transition-all"
              title="View Guide"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            
            {(() => {
              console.log(`🔄 Rendering header: walletConnected=${walletConnected}, connectedAccount=${connectedAccount}`);
              return walletConnected;
            })() ? (
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <p className="text-sm font-medium text-white">Pera Wallet</p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(connectedAccount);
                      setCopiedField('walletAddress');
                      setTimeout(() => setCopiedField(''), 2000);
                    }}
                    className="text-xs text-purple-200 hover:text-white hover:bg-purple-500/20 px-2 py-1 rounded transition-all cursor-pointer flex items-center gap-1 group relative"
                    title={connectedAccount}
                  >
                    {copiedField === 'walletAddress' ? (
                      <>
                        <CheckCircle size={12} className="text-green-400" />
                        <span className="text-green-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        {connectedAccount.slice(0, 8)}...{connectedAccount.slice(-6)}
                        <Copy size={12} className="opacity-60 group-hover:opacity-100 transition-opacity" />
                      </>
                    )}
                  </button>
                </div>
                <button
                  onClick={handleDisconnectWallet}
                  className="px-4 py-2 bg-purple-500/50 hover:bg-purple-500/70 text-white rounded-lg font-medium transition-colors"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnectWallet}
                className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex gap-8">
          {/* Main Cards */}
          <div className="flex-1 space-y-6">
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-purple-500/20">
              {/* Tab Navigation - Inside the card */}
              <div className="flex space-x-2 mb-8">
                <button
                  onClick={() => {
                    setActiveTab('send');
                    resetSendForm();
                  }}
                  className={`px-8 py-3 rounded-xl font-medium transition-all shadow-lg ${
                    activeTab === 'send'
                      ? 'bg-purple-800/30 text-white shadow-xl transform scale-105 border-2 border-cyan-400 backdrop-blur-sm'
                      : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
                  }`}
                >
                  Send
                </button>
                <button
                  onClick={() => {
                    setActiveTab('claim');
                    resetClaimForm();
                  }}
                  className={`px-8 py-3 rounded-xl font-medium transition-all shadow-lg ${
                    activeTab === 'claim'
                      ? 'bg-purple-800/30 text-white shadow-xl transform scale-105 border-2 border-cyan-400 backdrop-blur-sm'
                      : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
                  }`}
                >
                  Claim
                </button>
                <button
                  onClick={() => {
                    setActiveTab('refund');
                    resetRefundForm();
                    setShowContracts(false);
                  }}
                  className={`px-8 py-3 rounded-xl font-medium transition-all shadow-lg ${
                    activeTab === 'refund'
                      ? 'bg-purple-800/30 text-white shadow-xl transform scale-105 border-2 border-cyan-400 backdrop-blur-sm'
                      : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
                  }`}
                >
                  Contracts
                </button>
              </div>

              {/* Send Money Tab */}
              {activeTab === 'send' && (
                <div className="space-y-6">
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-white mb-2">Send Funds</h2>
                  </div>

                  {step === 'complete' && result ? (
                    <div className="space-y-6">
                      <div className="bg-gradient-to-r from-purple-500/20 to-purple-600/20 rounded-xl p-6 border border-purple-400/30">
                        <div className="flex items-center space-x-3 mb-4">
                          <CheckCircle className="w-8 h-8 text-green-400" />
                          <div>
                            <h3 className="text-xl font-semibold text-white">Funds Sent!</h3>
                            <p className="text-purple-200">
                              {result.amount} ALGO sent to {result.recipient}
                            </p>
                          </div>
                        </div>
                        
                        <div className="space-y-3">
                          <div className="bg-purple-800/20 rounded-xl p-4 border border-purple-500/20">
                            <div className="flex items-center justify-between">
                              <label className="text-purple-200 font-medium">Claim Code</label>
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => setShowResultClaimCode(!showResultClaimCode)}
                                  className="p-1 text-purple-300 hover:text-white transition-colors"
                                  title={showResultClaimCode ? "Hide code" : "Show code"}
                                >
                                  {showResultClaimCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                                <button
                                  onClick={() => copyToClipboard(
                                    result.applicationId ? `${result.applicationId}-${result.claimCode}` : result.claimCode,
                                    'result-claim-code'
                                  )}
                                  className="p-1 text-purple-300 hover:text-white transition-colors"
                                  title="Copy to clipboard"
                                >
                                  {copiedField === 'result-claim-code' ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>
                            <div className="mt-2">
                              <code className="text-white font-mono text-lg block bg-purple-900/30 p-3 rounded-lg border border-purple-600/30">
                                {showResultClaimCode 
                                  ? (result.applicationId ? `${result.applicationId}-${result.claimCode}` : result.claimCode)
                                  : '••••••••••••••••••••••••••••••'
                                }
                              </code>
                            </div>
                            <p className="text-purple-300 text-sm mt-2">
                              Share this code with the recipient to claim their funds
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-purple-300">Transaction ID:</p>
                              <div className="flex items-center space-x-2">
                                <code className="text-white font-mono text-xs bg-purple-900/30 p-1 rounded">{result.transactionId.slice(0, 8)}...</code>
                                <a
                                  href={getExplorerUrl(result.transactionId)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-purple-300 hover:text-white transition-colors"
                                  title="View on AlgoExplorer"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              </div>
                            </div>
                            <div>
                              <p className="text-purple-300">App ID:</p>
                              <code className="text-white font-mono text-xs bg-purple-900/30 p-1 rounded">{result.applicationId}</code>
                            </div>
                          </div>

                          {result.notificationSent && (
                            <div className="flex items-center space-x-2 text-green-400 text-sm">
                              <CheckCircle className="w-4 h-4" />
                              <span>Email notification sent successfully</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          resetSendForm();
                          setResult(null);
                        }}
                        className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium transition-colors"
                      >
                        Send Another Payment
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <div>
                          <label className="block text-purple-200 font-medium mb-2">
                            Recipient Email
                          </label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-purple-400" />
                            <input
                              type="email"
                              value={recipient}
                              onChange={(e) => setRecipient(e.target.value)}
                              placeholder="Enter recipient's email"
                              className="w-full pl-10 pr-4 py-3 bg-purple-900/30 border border-purple-600/30 rounded-xl text-white placeholder-purple-400 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20"
                              disabled={isLoading}
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-purple-200 font-medium mb-2">
                            Amount (ALGO)
                          </label>
                          <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.0"
                            step="0.001"
                            min="0.001"
                            className="w-full px-4 py-3 bg-purple-900/30 border border-purple-600/30 rounded-xl text-white placeholder-purple-400 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20"
                            disabled={isLoading}
                          />
                        </div>
                      </div>

                      {error && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                          <div className="flex items-center space-x-2">
                            <AlertCircle className="w-5 h-5 text-red-400" />
                            <p className="text-red-300">{error}</p>
                          </div>
                        </div>
                      )}

                      {showReconnectPrompt && (
                        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
                          <div className="flex items-center space-x-2">
                            <AlertTriangle className="w-5 h-5 text-yellow-400" />
                            <p className="text-yellow-300">Please connect your wallet to continue</p>
                          </div>
                        </div>
                      )}

                      <button
                        onClick={walletConnected ? handleSendMoney : handleConnectWallet}
                        disabled={isLoading}
                        className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-xl font-medium transition-all transform hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                      >
                        {isLoading ? (
                          <div className="flex items-center justify-center space-x-2">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>
                              {step === 'signing' ? 'Sign transaction in wallet...' :
                               step === 'submitting' ? 'Submitting...' : 'Processing...'}
                            </span>
                          </div>
                        ) : walletConnected ? (
                          'Send Funds'
                        ) : (
                          'Connect'
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Claim Money Tab */}
              {activeTab === 'claim' && (
                <div className="space-y-6">
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-white mb-2">Claim Funds</h2>
                  </div>

                  {claimStep === 'complete' && claimResult ? (
                    <div className="space-y-6">
                      <div className="bg-gradient-to-r from-purple-500/20 to-purple-600/20 rounded-xl p-6 border border-purple-400/30">
                        <div className="flex items-center space-x-3 mb-4">
                          <CheckCircle className="w-8 h-8 text-green-400" />
                          <div>
                            <h3 className="text-xl font-semibold text-white">Funds Claimed!</h3>
                            <p className="text-purple-200">Funds received in your wallet</p>
                          </div>
                        </div>
                        
                        <div className="space-y-3">
                          <div className="text-sm">
                            <p className="text-purple-300">Transaction ID:</p>
                            <div className="flex items-center space-x-2">
                              <code className="text-white font-mono text-xs bg-purple-900/30 p-1 rounded">{claimResult.transactionId.slice(0, 8)}...</code>
                              <a
                                href={getExplorerUrl(claimResult.transactionId)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-purple-300 hover:text-white transition-colors"
                                title="View on AlgoExplorer"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          resetClaimForm();
                          setClaimResult(null);
                        }}
                        className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium transition-colors"
                      >
                        Claim Another Code
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <div>
                          <label className="block text-purple-200 font-medium mb-2">
                            Claim Code
                          </label>
                          <div className="relative">
                            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
                              <Gift className="w-5 h-5 text-purple-400" />
                            </div>
                            <input
                              type="text"
                              value={claimCode}
                              onChange={(e) => setClaimCode(e.target.value)}
                              placeholder="12345678-ABCD1234"
                              className="w-full pl-10 pr-12 py-3 bg-purple-900/30 border border-purple-600/30 rounded-xl text-white placeholder-purple-400 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 font-mono"
                              disabled={claimLoading}
                            />
                            <button
                              onClick={() => setShowClaimCode(!showClaimCode)}
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-purple-400 hover:text-white transition-colors"
                              title={showClaimCode ? "Hide code" : "Show code"}
                            >
                              {showClaimCode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                          </div>
                          <p className="text-purple-300 text-sm mt-2">
                            Enter the claim code from your email (format: 12345678-ABCD1234)
                          </p>
                        </div>
                      </div>

                      {claimError && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                          <div className="flex items-center space-x-2">
                            <AlertCircle className="w-5 h-5 text-red-400" />
                            <p className="text-red-300">{claimError}</p>
                          </div>
                        </div>
                      )}

                      <button
                        onClick={walletConnected ? handleClaimFunds : handleConnectWallet}
                        disabled={claimLoading}
                        className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-xl font-medium transition-all transform hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                      >
                        {claimLoading ? (
                          <div className="flex items-center justify-center space-x-2">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>
                              {claimStep === 'signing' ? 'Sign transaction in wallet...' :
                               claimStep === 'submitting' ? 'Submitting...' : 'Processing...'}
                            </span>
                          </div>
                        ) : walletConnected ? (
                          'Claim Funds'
                        ) : (
                          'Connect'
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Refund/Contracts Tab */}
              {activeTab === 'refund' && (
                <div className="space-y-6">
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-white mb-2">View Contracts</h2>
                  </div>

                  {!showContracts ? (
                    <div className="space-y-4">
                      <div className="text-center">
                        <p className="text-purple-200 mb-4">
                          View and manage your sent contracts
                        </p>
                        <button
                          onClick={walletConnected ? () => {
                            setShowContracts(true);
                            loadContracts();
                          } : handleConnectWallet}
                          disabled={contractsLoading}
                          className="px-8 py-4 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-xl font-medium transition-all transform hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                        >
                          {contractsLoading ? (
                            <div className="flex items-center space-x-2">
                              <Loader2 className="w-5 h-5 animate-spin" />
                              <span>Loading...</span>
                            </div>
                          ) : walletConnected ? (
                            'Connect'
                          ) : (
                            'Connect'
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-white">Your Contracts</h3>
                        <button
                          onClick={loadContracts}
                          disabled={contractsLoading}
                          className="p-2 bg-purple-600/50 hover:bg-purple-600/70 text-white rounded-lg transition-colors disabled:opacity-50"
                          title="Refresh contracts"
                        >
                          <RefreshCw className={`w-4 h-4 ${contractsLoading ? 'animate-spin' : ''}`} />
                        </button>
                      </div>

                      {contractsError && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                          <div className="flex items-center space-x-2">
                            <AlertCircle className="w-5 h-5 text-red-400" />
                            <p className="text-red-300">{contractsError}</p>
                          </div>
                        </div>
                      )}

                      {contractsLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                          <span className="ml-2 text-purple-200">Loading contracts...</span>
                        </div>
                      ) : contracts.length === 0 ? (
                        <div className="text-center py-8">
                          <List className="w-12 h-12 text-purple-400 mx-auto mb-4" />
                          <p className="text-purple-200">No contracts found</p>
                          <p className="text-purple-300 text-sm">Send some funds to see contracts here</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {contracts.map((contract) => (
                            <div
                              key={contract.applicationId}
                              className="bg-purple-800/20 rounded-xl p-4 border border-purple-600/30"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center space-x-3 mb-2">
                                    <div className="text-sm font-mono text-white">
                                      App ID: {contract.applicationId}
                                    </div>
                                    <span className={`px-2 py-1 text-xs rounded-full ${
                                      contract.claimed 
                                        ? 'bg-green-500/20 text-green-300'
                                        : contract.canRefund
                                        ? 'bg-yellow-500/20 text-yellow-300'
                                        : 'bg-blue-500/20 text-blue-300'
                                    }`}>
                                      {contract.status}
                                    </span>
                                  </div>
                                  
                                  <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                      <p className="text-purple-300">Amount: <span className="text-white">{contract.amount} ALGO</span></p>
                                      <p className="text-purple-300">Balance: <span className="text-white">{contract.balance} ALGO</span></p>
                                    </div>
                                    <div>
                                      <p className="text-purple-300">Created: <span className="text-white text-xs">{contract.createdDate || 'Unknown'}</span></p>
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="flex space-x-2">
                                  {contract.canRefund && (
                                    <button
                                      onClick={() => {
                                        setRefundApplicationId(contract.applicationId.toString());
                                        handleRefundFunds();
                                      }}
                                      disabled={refundLoading}
                                      className="px-3 py-1 bg-yellow-600/50 hover:bg-yellow-600/70 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                                      title="Refund this contract"
                                    >
                                      Refund
                                    </button>
                                  )}
                                  
                                  {contract.canDelete && (
                                    <button
                                      onClick={() => handleDeleteContract(contract.applicationId)}
                                      disabled={deleteLoading[contract.applicationId]}
                                      className="px-3 py-1 bg-red-600/50 hover:bg-red-600/70 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                                      title="Delete this contract"
                                    >
                                      {deleteLoading[contract.applicationId] ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Trash2 className="w-3 h-3" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* How It Works Sidebar */}
          <div className="w-80">
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 shadow-2xl border border-purple-500/20 sticky top-24">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                <Info className="w-5 h-5 mr-2" />
                How It Works
              </h3>
              <div className="space-y-4 text-purple-100">
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-sm font-bold">1</span>
                  </div>
                  <p className="text-sm">Enter recipient's email and amount to send</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-sm font-bold">2</span>
                  </div>
                  <p className="text-sm">Connect your Pera Wallet and sign the transaction</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-sm font-bold">3</span>
                  </div>
                  <p className="text-sm">Recipient gets an email with a claim code</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-sm font-bold">4</span>
                  </div>
                  <p className="text-sm">They use the claim code to receive funds in their wallet</p>
                </div>
              </div>
              
              <div className="mt-6 p-4 bg-purple-800/20 rounded-xl border border-purple-500/20">
                <p className="text-purple-200 text-sm">
                  <strong className="text-white">Network:</strong> {isTestNet() ? 'TestNet' : isMainNet() ? 'MainNet' : 'Unknown'}
                </p>
                <p className="text-purple-300 text-xs mt-1">
                  {isTestNet() && 'Using test ALGO for development'}
                  {isMainNet() && 'Using real ALGO - transactions are permanent'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

export default MainApp;