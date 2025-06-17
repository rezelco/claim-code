import React, { useState, useEffect } from 'react';
import { Send, Wallet, Mail, Phone, MessageSquare, CheckCircle, AlertCircle, Loader2, Info, RefreshCw, AlertTriangle, Copy, ExternalLink } from 'lucide-react';
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
  recipient: string;
  amount: number;
  message?: string;
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
  const [copiedField, setCopiedField] = useState<string>('');

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

      // Step 4: Show success result with all details
      setResult({
        claimCode: claimResponse.claimCode,
        transactionId: submitResponse.transactionId,
        applicationId: submitResponse.applicationId,
        contractAddress: submitResponse.contractAddress,
        notificationSent: submitResponse.notificationSent || false,
        notificationMethod: submitResponse.notificationMethod || 'pending',
        recipient: recipient.trim(),
        amount: parseFloat(amount),
        message: message.trim()
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

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(''), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const handleSendAnother = () => {
    setResult(null);
    setStep('form');
    setError('');
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

        {/* Success Result - Show prominently at the top when complete */}
        {result && step === 'complete' && (
          <div className="mb-8 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl overflow-hidden shadow-lg">
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-6">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Money Sent Successfully!</h2>
                  <p className="text-green-100 mt-1">
                    {result.amount} ALGO sent to {result.recipient} on {getNetworkConfig().name}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Transaction Summary */}
              <div className="bg-white rounded-xl p-5 border border-green-200 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Transaction Summary</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Amount Sent</p>
                    <p className="text-xl font-bold text-gray-900">{result.amount} ALGO</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Recipient</p>
                    <p className="text-lg font-medium text-gray-900 break-all">{result.recipient}</p>
                  </div>
                  {result.message && (
                    <div className="md:col-span-2">
                      <p className="text-sm text-gray-600 mb-1">Message</p>
                      <p className="text-gray-900 italic">"{result.message}"</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Claim Code - Most Important */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-200">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-blue-900">Claim Code</h3>
                  <button
                    onClick={() => copyToClipboard(result.claimCode, 'claimCode')}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                    <span>{copiedField === 'claimCode' ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
                <div className="bg-white rounded-lg p-4 border-2 border-blue-300">
                  <p className="font-mono text-2xl font-bold text-gray-900 text-center tracking-wider">
                    {result.claimCode}
                  </p>
                </div>
                <p className="text-blue-700 text-sm mt-3 text-center">
                  The recipient will need this code to claim their funds
                </p>
              </div>

              {/* Notification Status */}
              <div className={`rounded-xl p-4 border ${result.notificationSent ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                <div className="flex items-start space-x-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${result.notificationSent ? 'bg-green-500' : 'bg-yellow-500'}`}>
                    {result.notificationSent ? (
                      <CheckCircle className="w-3 h-3 text-white" />
                    ) : (
                      <Info className="w-3 h-3 text-white" />
                    )}
                  </div>
                  <div>
                    <p className={`font-medium ${result.notificationSent ? 'text-green-800' : 'text-yellow-800'}`}>
                      Notification {result.notificationSent ? 'Sent' : 'Simulated'}
                    </p>
                    <p className={`text-sm mt-1 ${result.notificationSent ? 'text-green-700' : 'text-yellow-700'}`}>
                      {result.notificationSent 
                        ? `The claim code has been sent to ${result.recipient} via ${result.notificationMethod}.`
                        : `In production, the claim code would be sent to ${result.recipient} via ${result.notificationMethod}.`
                      }
                    </p>
                  </div>
                </div>
              </div>

              {/* Technical Details - Collapsible */}
              <details className="bg-gray-50 rounded-xl border border-gray-200">
                <summary className="px-4 py-3 cursor-pointer font-medium text-gray-700 hover:text-gray-900">
                  Technical Details
                </summary>
                <div className="px-4 pb-4 space-y-3">
                  {result.contractAddress && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm text-gray-600">Smart Contract Address</p>
                        <button
                          onClick={() => copyToClipboard(result.contractAddress!, 'contractAddress')}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          {copiedField === 'contractAddress' ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <p className="font-mono text-sm text-gray-700 bg-white px-3 py-2 rounded border break-all">
                        {result.contractAddress}
                      </p>
                    </div>
                  )}
                  
                  {result.applicationId && (
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Application ID</p>
                      <p className="font-mono text-sm text-gray-700 bg-white px-3 py-2 rounded border">
                        {result.applicationId}
                      </p>
                    </div>
                  )}
                  
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm text-gray-600">Transaction ID</p>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => copyToClipboard(result.transactionId, 'transactionId')}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          {copiedField === 'transactionId' ? 'Copied!' : 'Copy'}
                        </button>
                        <a
                          href={getExplorerUrl(result.transactionId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-800"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Explorer</span>
                        </a>
                      </div>
                    </div>
                    <p className="font-mono text-sm text-gray-700 bg-white px-3 py-2 rounded border break-all">
                      {result.transactionId}
                    </p>
                  </div>
                </div>
              </details>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  onClick={handleSendAnother}
                  className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl transition-all transform hover:scale-[1.02] flex items-center justify-center space-x-2"
                >
                  <Send className="w-5 h-5" />
                  <span>Send Another Payment</span>
                </button>
                <a
                  href={getExplorerUrl(result.transactionId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-all flex items-center justify-center space-x-2"
                >
                  <ExternalLink className="w-5 h-5" />
                  <span>View on Explorer</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Send Form - Hide when showing success */}
        {step !== 'complete' && (
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
        )}

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

        {/* Wallet Connection Required Notice */}
        {!walletConnected && !showReconnectPrompt && step !== 'complete' && (
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
        {step !== 'complete' && (
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
        )}
      </div>
    </div>
  );
}

export default App;