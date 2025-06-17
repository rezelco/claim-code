import React, { useState, useEffect } from 'react';
import { Send, Wallet, Mail, Phone, MessageSquare, CheckCircle, AlertCircle, Loader2, Info, RefreshCw, AlertTriangle } from 'lucide-react';
import { connectWallet, disconnectWallet, getConnectedAccount, isWalletConnected, signTransaction } from './services/walletService';
import { createClaim, submitTransaction } from './services/apiService';
import { getCurrentNetwork, getNetworkConfig, isTestNet, isMainNet } from './services/networkService';
import { NetworkType } from './types/network';
import NetworkSelector from './components/NetworkSelector';
import algosdk from 'algosdk';

interface ClaimResult {
  claimCode: string;
  transactionId: string;
  applicationId?: number;
  contractAddress?: string;
  notificationSent: boolean;
  notificationMethod: string;
}

function App() {
  const [walletConnected, setWalletConnected] = useState(false);
  const [connectedAccount, setConnectedAccount] = useState<string>('');
  const [currentNetwork, setCurrentNetwork] = useState<NetworkType>(getCurrentNetwork());
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [error, setError] = useState<string>('');
  const [step, setStep] = useState<'form' | 'signing' | 'submitting' | 'complete'>('form');
  const [showReconnectPrompt, setShowReconnectPrompt] = useState(false);

  useEffect(() => {
    checkWalletConnection();
    setupNetworkListener();
  }, []);

  const setupNetworkListener = () => {
    const handleNetworkChange = (event: CustomEvent) => {
      const { network } = event.detail;
      const wasConnected = walletConnected;
      
      setCurrentNetwork(network);
      
      // Check if wallet needs reconnection after network change
      if (wasConnected) {
        setWalletConnected(false);
        setShowReconnectPrompt(true);
      }
      
      // Clear any existing results when switching networks
      setResult(null);
      setError('');
      setStep('form');
    };

    window.addEventListener('networkChanged', handleNetworkChange as EventListener);
    
    return () => {
      window.removeEventListener('networkChanged', handleNetworkChange as EventListener);
    };
  };

  const checkWalletConnection = async () => {
    const connected = await isWalletConnected();
    setWalletConnected(connected);
    if (connected) {
      const account = await getConnectedAccount();
      setConnectedAccount(account);
    }
  };

  const handleConnectWallet = async () => {
    try {
      setError('');
      setIsLoading(true);
      setShowReconnectPrompt(false);
      const account = await connectWallet();
      setWalletConnected(true);
      setConnectedAccount(account);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect wallet';
      
      // Check if the error is due to user cancellation
      if (errorMessage.includes('Connect modal is closed by user') || errorMessage.includes('User cancelled')) {
        // Don't show error for user cancellations, just clear any existing error
        setError('');
      } else {
        // Show error for actual connection failures
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnectWallet = async () => {
    try {
      await disconnectWallet();
      setWalletConnected(false);
      setConnectedAccount('');
      setResult(null);
      setStep('form');
      setShowReconnectPrompt(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect wallet');
    }
  };

  const handleNetworkChange = (network: NetworkType) => {
    setCurrentNetwork(network);
  };

  const validateForm = () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return false;
    }
    if (parseFloat(amount) < 0.001) {
      setError('Minimum amount is 0.001 ALGO');
      return false;
    }
    if (!recipient.trim()) {
      setError('Please enter recipient email or phone number');
      return false;
    }
    if (!walletConnected) {
      setError('Please connect your wallet first');
      return false;
    }
    
    // Additional validation for MainNet
    if (isMainNet()) {
      if (parseFloat(amount) > 10) {
        setError('For safety, maximum amount on MainNet is 10 ALGO');
        return false;
      }
    }
    
    return true;
  };

  const handleSend = async () => {
    setError('');
    setResult(null);

    if (!validateForm()) return;

    if (!connectedAccount) {
      setError('No wallet account connected. Please connect your wallet first.');
      return;
    }

    setIsLoading(true);
    setStep('signing');

    try {
      console.log('Creating claim with account:', connectedAccount);
      console.log('Wallet connected state:', walletConnected);
      console.log('Connected account type:', typeof connectedAccount);
      console.log('Connected account value:', connectedAccount);
      
      // Get fresh account from wallet service
      const currentAccount = await getConnectedAccount();
      console.log('Fresh account from wallet service:', currentAccount);
      
      if (!currentAccount) {
        throw new Error('Unable to get connected account from wallet');
      }
      
      // Validate it's a proper Algorand address
      if (!algosdk.isValidAddress(currentAccount)) {
        throw new Error(`Invalid Algorand address format: ${currentAccount}`);
      }
      
      // Step 1: Create claim and get transaction to sign
      const claimResponse = await createClaim({
        amount: parseFloat(amount),
        recipient: recipient.trim(),
        message: message.trim(),
        senderAddress: currentAccount
      });

      // Step 2: Decode and sign the transaction
      const txnBuffer = Buffer.from(claimResponse.deploymentTransaction, 'base64');
      const transaction = algosdk.decodeUnsignedTransaction(txnBuffer);
      
      const signedTxn = await signTransaction(transaction);
      
      setStep('submitting');

      // Step 3: Submit the signed transaction with claim details
      const submitResponse = await submitTransaction({
        signedTransaction: Buffer.from(signedTxn).toString('base64'),
        claimDetails: {
          recipient: claimResponse.claimDetails.recipient,
          amount: claimResponse.claimDetails.amount,
          message: claimResponse.claimDetails.message,
          claimCode: claimResponse.claimCode
        }
      });

      // Step 4: Show success result
      setResult({
        claimCode: claimResponse.claimCode,
        transactionId: submitResponse.transactionId,
        applicationId: submitResponse.applicationId,
        contractAddress: submitResponse.contractAddress,
        notificationSent: submitResponse.notificationSent || false,
        notificationMethod: submitResponse.notificationMethod || 'pending'
      });

      setStep('complete');
      
      // Reset form
      setAmount('');
      setRecipient('');
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process transaction');
      setStep('form');
    } finally {
      setIsLoading(false);
    }
  };

  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const isValidPhone = (phone: string) => {
    return /^\+?[\d\s\-\(\)]{10,}$/.test(phone);
  };

  const getRecipientIcon = () => {
    if (isValidEmail(recipient)) return <Mail className="w-4 h-4" />;
    if (isValidPhone(recipient)) return <Phone className="w-4 h-4" />;
    return <Mail className="w-4 h-4" />;
  };

  const getStepMessage = () => {
    switch (step) {
      case 'signing':
        return 'Please sign the transaction in your Pera wallet...';
      case 'submitting':
        return `Submitting transaction to Algorand ${getNetworkConfig().name}...`;
      case 'complete':
        return 'Transaction completed successfully!';
      default:
        return '';
    }
  };

  const getExplorerUrl = (txId: string) => {
    const config = getNetworkConfig();
    return `${config.explorerUrl}/tx/${txId}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
              <Send className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">RandCash</h1>
              <p className="text-sm text-gray-600">Send money with Algorand</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Network Selector */}
            <NetworkSelector onNetworkChange={handleNetworkChange} />
            
            {walletConnected ? (
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">Pera Wallet</p>
                  <p className="text-xs text-gray-600">{connectedAccount.slice(0, 8)}...{connectedAccount.slice(-6)}</p>
                </div>
                <button
                  onClick={handleDisconnectWallet}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnectWallet}
                disabled={isLoading}
                className="flex items-center space-x-2 px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-blue-400 disabled:to-indigo-400 text-white rounded-lg font-medium transition-all transform hover:scale-[1.02] disabled:transform-none"
              >
                <Wallet className="w-4 h-4" />
                <span>Connect Pera Wallet</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Reconnection Prompt */}
        {showReconnectPrompt && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start space-x-3">
            <RefreshCw className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-blue-800 font-medium">Reconnection Required</h3>
              <p className="text-blue-700 text-sm mt-1">
                Network changed. Please reconnect your wallet to continue using {getNetworkConfig().name}.
              </p>
              <button
                onClick={handleConnectWallet}
                disabled={isLoading}
                className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm rounded-lg font-medium transition-colors"
              >
                Reconnect Wallet
              </button>
            </div>
          </div>
        )}

        {/* MainNet Warning */}
        {isMainNet() && (
          <div className="mb-6 bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-orange-800 font-medium">MainNet Warning</h3>
              <p className="text-orange-700 text-sm mt-1">
                You are using the live Algorand MainNet. Real ALGO will be used for transactions. 
                Maximum amount is limited to 10 ALGO for safety.
              </p>
            </div>
          </div>
        )}

        {/* Send Form */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-6">
            <h2 className="text-2xl font-bold text-white">Send Money</h2>
            <p className="text-blue-100 mt-1">
              Send Algos to anyone using their email or phone on {getNetworkConfig().name}
            </p>
          </div>
          
          <div className="p-6 space-y-6">
            {/* Progress Indicator */}
            {isLoading && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center space-x-3">
                <Loader2 className="w-5 h-5 text-blue-500 animate-spin flex-shrink-0" />
                <div>
                  <p className="text-blue-800 font-medium">{getStepMessage()}</p>
                  {step === 'signing' && (
                    <p className="text-blue-600 text-sm mt-1">
                      Check your Pera wallet to approve the transaction
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Amount Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Amount (ALGO)
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  disabled={isLoading}
                  className="w-full px-4 py-3 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-gray-50 disabled:cursor-not-allowed"
                  step="0.001"
                  min="0.001"
                  max={isMainNet() ? "10" : undefined}
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">
                  ALGO
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Minimum: 0.001 ALGO{isMainNet() ? ' • Maximum: 10 ALGO' : ''}
              </p>
            </div>

            {/* Recipient Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Recipient (Email or Phone)
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                  {getRecipientIcon()}
                </div>
                <input
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="email@example.com or +1234567890"
                  disabled={isLoading}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-gray-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* Message Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Message (Optional)
              </label>
              <div className="relative">
                <div className="absolute left-3 top-3 text-gray-400">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Add a personal message..."
                  rows={3}
                  disabled={isLoading}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all disabled:bg-gray-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={isLoading || !walletConnected || step !== 'form'}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold rounded-xl transition-all transform hover:scale-[1.02] disabled:transform-none disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  <span>Send Money</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-red-800 font-medium">Error</h3>
              <p className="text-red-700 text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Success Result */}
        {result && (
          <div className="mt-6 bg-green-50 border border-green-200 rounded-xl p-6">
            <div className="flex items-center space-x-3 mb-4">
              <CheckCircle className="w-6 h-6 text-green-500" />
              <h3 className="text-green-800 font-semibold text-lg">Money Sent Successfully!</h3>
            </div>
            
            <div className="space-y-3">
              <div className="bg-white rounded-lg p-4 border border-green-200">
                <p className="text-sm text-gray-600 mb-1">Claim Code</p>
                <p className="font-mono text-lg font-bold text-gray-900 bg-gray-50 px-3 py-2 rounded border">
                  {result.claimCode}
                </p>
              </div>
              
              {result.contractAddress && (
                <div className="bg-white rounded-lg p-4 border border-green-200">
                  <p className="text-sm text-gray-600 mb-1">Smart Contract Address</p>
                  <p className="font-mono text-sm text-gray-700 break-all">
                    {result.contractAddress}
                  </p>
                </div>
              )}
              
              {result.applicationId && (
                <div className="bg-white rounded-lg p-4 border border-green-200">
                  <p className="text-sm text-gray-600 mb-1">Application ID</p>
                  <p className="font-mono text-sm text-gray-700">
                    {result.applicationId}
                  </p>
                </div>
              )}
              
              <div className="bg-white rounded-lg p-4 border border-green-200">
                <p className="text-sm text-gray-600 mb-1">Transaction ID</p>
                <div className="flex items-center justify-between">
                  <p className="font-mono text-sm text-gray-700 break-all flex-1 mr-2">
                    {result.transactionId}
                  </p>
                  <a
                    href={getExplorerUrl(result.transactionId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium whitespace-nowrap"
                  >
                    View on Explorer →
                  </a>
                </div>
              </div>
            </div>
            
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-start space-x-2">
                <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-blue-800 font-medium">
                    Notification {result.notificationSent ? 'sent' : 'simulated'} via {result.notificationMethod}
                  </p>
                  <p className="text-blue-700 mt-1">
                    {result.notificationSent 
                      ? `The claim code has been sent to ${recipient}. They can use it to claim the funds.`
                      : `In production, the claim code would be sent to ${recipient} via ${result.notificationMethod}.`
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Wallet Connection Required Notice */}
        {!walletConnected && !showReconnectPrompt && (
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start space-x-3">
            <Wallet className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-blue-800 font-medium">Wallet Required</h3>
              <p className="text-blue-700 text-sm mt-1">
                Connect your Pera wallet to send money securely on Algorand {getNetworkConfig().name}.
              </p>
            </div>
          </div>
        )}

        {/* Network Notice */}
        <div className={`mt-6 ${isTestNet() ? 'bg-yellow-50 border-yellow-200' : 'bg-orange-50 border-orange-200'} border rounded-xl p-4 flex items-start space-x-3`}>
          <Info className={`w-5 h-5 ${isTestNet() ? 'text-yellow-500' : 'text-orange-500'} flex-shrink-0 mt-0.5`} />
          <div>
            <h3 className={`${isTestNet() ? 'text-yellow-800' : 'text-orange-800'} font-medium`}>
              {getNetworkConfig().name} Environment
            </h3>
            <p className={`${isTestNet() ? 'text-yellow-700' : 'text-orange-700'} text-sm mt-1`}>
              {isTestNet() ? (
                <>
                  This app is running on Algorand TestNet. Use TestNet Algos for testing. 
                  Get free TestNet Algos from the{' '}
                  <a 
                    href={getNetworkConfig().dispenserUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="underline hover:no-underline"
                  >
                    Algorand TestNet Dispenser
                  </a>.
                </>
              ) : (
                'This app is running on Algorand MainNet. Real ALGO will be used for all transactions. Please be careful and double-check all details before sending.'
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;