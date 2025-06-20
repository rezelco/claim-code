import React, { useState, useEffect, useRef } from 'react';
import { Send, Wallet, Mail, Phone, MessageSquare, CheckCircle, AlertCircle, Loader2, Info, RefreshCw, AlertTriangle, Copy, ExternalLink, Download, Clock, Trash2, List, Eye, EyeOff } from 'lucide-react';
import { connectWallet, disconnectWallet, getConnectedAccount, isWalletConnected, signTransaction, setWalletTimeoutCallbacks } from './services/walletService';
import { createClaim, submitTransaction, claimWithCode, refundFunds, fundContract, submitFundingTransaction, checkClaimStatus, getWalletContracts, deleteContract, submitDelete } from './services/apiService';
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

function App() {
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
        setWalletConnected(false);
        setConnectedAccount('');
        // Clear form data on auto-disconnect for security
        setAmount('');
        setRecipient('');
        setMessage('');
        setClaimCode('');
        setShowClaimCode(false);
        setRefundApplicationId('');
      }
    );
  }, []);

  const setupNetworkListener = () => {
    const handleNetworkChange = (event: CustomEvent) => {
      const { network } = event.detail;
      const wasConnected = walletConnectedRef.current;
      
      console.log(`🔄 Network change detected: ${network}`);
      console.log(`🔄 Wallet was connected (ref): ${wasConnected}`);
      console.log(`🔄 Current walletConnected state: ${walletConnected}`);
      
      setCurrentNetwork(network);
      
      // Disconnect wallet when network changes for security and clarity
      if (wasConnected) {
        console.log(`🔄 Network changed to ${network}, disconnecting wallet for safety`);
        // Use async function to ensure proper sequencing
        (async () => {
          console.log(`🔄 Starting wallet disconnect process...`);
          await handleDisconnectWallet();
          console.log(`🔄 handleDisconnectWallet completed`);
          
          // Force immediate UI state update
          setWalletConnected(false);
          walletConnectedRef.current = false;
          setConnectedAccount('');
          setShowReconnectPrompt(true);
          setForceUpdate(prev => prev + 1); // Force re-render
          console.log(`🔄 Forced state updates applied`);
          
          // Force a connection check to update UI state
          setTimeout(() => {
            console.log(`🔄 Running checkWalletConnection...`);
            checkWalletConnection();
          }, 100);
        })();
      }
      
      // Clear any existing results when switching networks
      setResult(null);
      setError('');
      setStep('form');
      setClaimResult(null);
      setClaimError('');
      setClaimStep('form');
      setRefundResult(null);
      setRefundError('');
      setRefundStep('form');
    };

    window.addEventListener('networkChanged', handleNetworkChange as EventListener);
    
    return () => {
      window.removeEventListener('networkChanged', handleNetworkChange as EventListener);
    };
  };

  const checkWalletConnection = async () => {
    const connected = await isWalletConnected();
    setWalletConnected(connected);
    walletConnectedRef.current = connected;
    if (connected) {
      const account = await getConnectedAccount();
      setConnectedAccount(account);
    }
  };

  const handleConnectWallet = async () => {
    try {
      setError('');
      setClaimError('');
      setIsLoading(true);
      setShowReconnectPrompt(false);
      
      console.log('Attempting to connect wallet...');
      const account = await connectWallet();
      console.log('Wallet connected successfully:', account);
      
      setWalletConnected(true);
      walletConnectedRef.current = true;
      setConnectedAccount(account);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect wallet';
      console.error('Wallet connection failed:', errorMessage);
      
      // Check if the error is due to user cancellation
      if (errorMessage.includes('Connect modal is closed by user') || 
          errorMessage.includes('User cancelled') || 
          errorMessage.includes('User canceled') ||
          errorMessage.includes('User rejected')) {
        // Don't show error for user cancellations, just clear any existing error
        console.log('User cancelled wallet connection');
        setError('');
        setClaimError('');
      } else {
        // Show error for actual connection failures
        if (activeTab === 'send') {
          setError(errorMessage);
        } else {
          setClaimError(errorMessage);
        }
      }
    } finally {
      setIsLoading(false);
      console.log('Connect wallet attempt finished, loading state reset');
    }
  };

  const handleDisconnectWallet = async () => {
    try {
      console.log('Disconnecting wallet...');
      await disconnectWallet();
      console.log('Wallet disconnected successfully');
      
      setWalletConnected(false);
      walletConnectedRef.current = false;
      setConnectedAccount('');
      setResult(null);
      setStep('form');
      setClaimResult(null);
      setClaimStep('form');
      setShowReconnectPrompt(false);
      // Ensure loading states are reset after disconnect
      setIsLoading(false);
      setClaimLoading(false);
      setError('');
      setClaimError('');
      
      console.log('UI state reset after disconnect');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to disconnect wallet';
      console.error('Disconnect failed:', errorMessage);
      
      if (activeTab === 'send') {
        setError(errorMessage);
      } else {
        setClaimError(errorMessage);
      }
      // Reset loading states even if disconnect fails
      setIsLoading(false);
      setClaimLoading(false);
    }
  };

  const handleNetworkChange = (network: NetworkType) => {
    setCurrentNetwork(network);
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    // Clear errors when switching tabs
    setError('');
    setClaimError('');
    setRefundError('');
  };

  const validateForm = () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return false;
    }
    if (parseFloat(amount) < 0.1) {
      setError('Minimum amount is 0.1 ALGO (required for Algorand account minimum balance)');
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

  const validateClaimForm = () => {
    if (!claimCode.trim()) {
      setClaimError('Please enter your claim code');
      return false;
    }
    
    // Parse the combined claim code
    const parts = claimCode.trim().split('-');
    if (parts.length !== 2) {
      setClaimError('Invalid claim code format. Expected format: APPID-CLAIMCODE');
      return false;
    }
    
    const [appIdPart, claimCodePart] = parts;
    const appId = parseInt(appIdPart);
    
    if (isNaN(appId) || appId <= 0) {
      setClaimError('Invalid application ID in claim code');
      return false;
    }
    
    if (!claimCodePart || claimCodePart.length < 8) {
      setClaimError('Invalid claim code portion');
      return false;
    }
    
    if (!walletConnected) {
      setClaimError('Please connect your wallet first');
      return false;
    }
    return true;
  };

  const validateRefundForm = () => {
    if (!refundApplicationId.trim()) {
      setRefundError('Please enter the application ID');
      return false;
    }
    if (isNaN(parseInt(refundApplicationId)) || parseInt(refundApplicationId) <= 0) {
      setRefundError('Application ID must be a valid positive number');
      return false;
    }
    if (!walletConnected) {
      setRefundError('Please connect your wallet first');
      return false;
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
      
      // Get fresh account from wallet service
      const currentAccount = await getConnectedAccount();
      
      if (!currentAccount) {
        throw new Error('Unable to get connected account from wallet');
      }
      
      // Validate it's a proper Algorand address
      if (!algosdk.isValidAddress(currentAccount)) {
        throw new Error(`Invalid Algorand address format: ${currentAccount}`);
      }
      
      // Step 1: Create claim and get transaction(s) to sign
      const claimResponse = await createClaim({
        amount: parseFloat(amount),
        recipient: recipient.trim(),
        message: message.trim(),
        senderAddress: currentAccount
      });

      // Step 2: Sign the single transaction
      console.log('Signing single app creation transaction...');
      const txnBuffer = Buffer.from(claimResponse.deploymentTransaction, 'base64');
      const transaction = algosdk.decodeUnsignedTransaction(txnBuffer);
      
      const signedTxn = await signTransaction(transaction);
      
      const signedTxnData = {
        signedTransaction: Buffer.from(signedTxn).toString('base64')
      };
      
      setStep('submitting');

      // Step 3: Submit the signed transaction(s) with claim details
      const submitResponse = await submitTransaction({
        ...signedTxnData,
        claimDetails: {
          recipient: claimResponse.claimDetails.recipient,
          amount: claimResponse.claimDetails.amount,
          message: claimResponse.claimDetails.message,
          claimCode: claimResponse.claimCode
        }
      });

      // Handle contract funding separately if needed (atomic group handles app creation + seed only)
      let fundingTransactionId: string | undefined;
      
      if (submitResponse.applicationId) {
        console.log(`Funding contract ${submitResponse.applicationId} at ${submitResponse.contractAddress}...`);
        
        try {
          const fundingAccount = await getConnectedAccount();
          if (!fundingAccount) {
            throw new Error('Unable to get connected account for funding');
          }
          
          const contractFundingAmount = 0.1 + parseFloat(amount); // min balance + claim amount
          console.log(`Creating contract funding transaction for ${contractFundingAmount} ALGO`);
          
          const fundingTxn = await fundContract({
            applicationId: submitResponse.applicationId,
            amount: contractFundingAmount,
            senderAddress: fundingAccount
          });
          
          console.log(`Signing contract funding transaction...`);
          const signedFundingTxn = await signTransaction(fundingTxn.transactionToSign);
          
          console.log(`Submitting contract funding transaction...`);
          const fundingResponse = await submitFundingTransaction({
            signedTransaction: Buffer.from(signedFundingTxn).toString('base64'),
            claimCode: claimResponse.claimCode
          });
          
          fundingTransactionId = fundingResponse.transactionId;
          console.log(`✅ Contract funded successfully: ${fundingResponse.transactionId}`);
        } catch (fundingError) {
          console.error('❌ Contract funding failed:', fundingError);
          setError(`Contract created but funding failed: ${fundingError instanceof Error ? fundingError.message : 'Unknown error'}.`);
        }
      }

      // Step 4: Show success result
      const amountValue = parseFloat(amount);
      console.log('Setting result with amount:', amountValue, 'from form value:', amount);
      
      setResult({
        claimCode: claimResponse.claimCode,
        transactionId: submitResponse.transactionId,
        applicationId: submitResponse.applicationId,
        contractAddress: submitResponse.contractAddress,
        notificationSent: submitResponse.notificationSent || false,
        notificationMethod: submitResponse.notificationMethod || 'pending',
        recipient: recipient.trim(),
        amount: amountValue,
        message: message.trim(),
        fundingTransactionId: fundingTransactionId
      });

      setStep('complete');
      
      // Don't reset form immediately - let user see the success page with the amount
      // Form will be reset when they click "Send Another Payment"
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process transaction');
      setStep('form');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClaimFunds = async () => {
    setClaimError('');
    setClaimResult(null);

    if (!validateClaimForm()) return;

    if (!connectedAccount) {
      setClaimError('No wallet account connected. Please connect your wallet first.');
      return;
    }

    setClaimLoading(true);
    setClaimStep('signing');

    try {
      // Get fresh account from wallet service
      const currentAccount = await getConnectedAccount();
      
      if (!currentAccount) {
        throw new Error('Unable to get connected account from wallet');
      }
      
      // Validate it's a proper Algorand address
      if (!algosdk.isValidAddress(currentAccount)) {
        throw new Error(`Invalid Algorand address format: ${currentAccount}`);
      }

      // Parse the combined claim code
      const parts = claimCode.trim().split('-');
      console.log('🔍 Parsing claim code:', claimCode.trim());
      console.log('🔍 Split parts:', parts);
      
      if (parts.length !== 2) {
        throw new Error('Invalid claim code format. Please use the format: ApplicationID-ClaimCode');
      }
      
      const [appIdStr, actualClaimCode] = parts;
      const appId = parseInt(appIdStr);
      
      console.log('🔍 Parsed Application ID:', appId);
      console.log('🔍 Parsed Claim Code:', actualClaimCode);
      
      if (isNaN(appId) || appId <= 0) {
        throw new Error('Invalid application ID in claim code');
      }

      // Step 1: Try to check claim status (optional validation)
      let statusCheck = null;
      try {
        console.log('🔍 Checking claim status...');
        console.log('Request data:', { applicationId: appId, claimCode: actualClaimCode });
        
        statusCheck = await checkClaimStatus({
          applicationId: appId,
          claimCode: actualClaimCode
        });
        
        console.log('Status check response:', statusCheck);

        // Handle different claim statuses for existing applications
        if (statusCheck.status === 'already_claimed') {
          console.log('🚫 Status check: already claimed - throwing error');
          throw new Error('These funds have already been claimed. Each claim code can only be used once.');
        }
        
        if (statusCheck.status === 'invalid_code') {
          console.log('🚫 Status check: invalid code - throwing error');
          throw new Error('Invalid claim code. Please check the code and try again.');
        }
        
        if (statusCheck.status === 'unfunded') {
          console.log('🚫 Status check: unfunded - throwing error');
          throw new Error('This contract has not been funded yet. Please ask the sender to fund the contract before claiming.');
        }
        
        if (statusCheck.status === 'not_found') {
          console.log('🚫 Status check: not found - throwing error');
          throw new Error('Application not found. Please verify the application ID in your claim code is correct.');
        }
        
        if (statusCheck.status === 'available') {
          console.log(`✅ Claim validated: ${statusCheck.amount} ALGO available`);
        }
        
      } catch (statusError) {
        console.log('🔍 Caught status error:', statusError);
        console.log('🔍 Error message:', statusError instanceof Error ? statusError.message : 'Unknown error');
        
        // If it's a known validation error, re-throw it to stop the claim process
        if (statusError instanceof Error && (
          statusError.message.includes('already been claimed') ||
          statusError.message.includes('invalid claim code') ||
          statusError.message.includes('not been funded yet') ||
          statusError.message.includes('not found on')
        )) {
          console.log('🚫 Re-throwing validation error to stop claim process');
          throw statusError; // Re-throw validation errors to stop claim process
        }
        
        console.log('⚠️ Status check failed (this is normal for new contracts):', statusError.message);
        console.log('⚠️ Proceeding with claim attempt - will get better error if claim fails');
        // Continue with the claim attempt for unknown errors
      }

      // Step 2: Create claim transaction using claim-with-code
      console.log('🔍 Creating claim transaction...');
      const claimResponse = await claimWithCode({
        applicationId: appId,
        claimCode: actualClaimCode,
        walletAddress: currentAccount
      });

      // Step 3: Sign the claim transaction
      console.log('🔍 Signing claim transaction...');
      const txnBuffer = Buffer.from(claimResponse.transactionToSign, 'base64');
      const transaction = algosdk.decodeUnsignedTransaction(txnBuffer);
      
      const signedTxn = await signTransaction(transaction);
      
      setClaimStep('submitting');

      // Step 4: Submit the signed transaction directly to Algorand
      const algodClient = new algosdk.Algodv2('', getCurrentNetwork() === 'testnet' ? 'https://testnet-api.4160.nodely.dev' : 'https://mainnet-api.4160.nodely.dev', 443);
      const txResponse = await algodClient.sendRawTransaction(signedTxn).do();
      const txId = txResponse?.txid || txResponse?.txId || txResponse?.transactionID;
      
      if (!txId) {
        throw new Error('No transaction ID returned from submission');
      }

      // Step 5: Wait for confirmation
      console.log('⏳ Waiting for claim transaction confirmation...');
      const confirmedTxn = await algosdk.waitForConfirmation(algodClient, txId, 15);
      
      // Use amount from status check if available, otherwise fall back to transaction parsing
      let claimedAmount = (statusCheck && statusCheck.amount) || 0;
      
      // If no amount from status check, try to parse from transaction
      if (claimedAmount === 0) {
        console.log('💡 No amount from status check, parsing transaction...');
        const innerTxns = confirmedTxn['inner-txns'] || confirmedTxn.innerTxns || confirmedTxn['inner_txns'];
        
        if (innerTxns && innerTxns.length > 0) {
          for (let i = 0; i < innerTxns.length; i++) {
            const innerTxn = innerTxns[i];
            const paymentTxn = innerTxn['payment-transaction'] || 
                              innerTxn.paymentTransaction || 
                              innerTxn['payment_transaction'] ||
                              innerTxn.txn ||
                              innerTxn;
                              
            if (paymentTxn && paymentTxn.amt !== undefined) {
              claimedAmount = paymentTxn.amt / 1000000;
              console.log(`💰 Found amount from inner txn ${i}: ${claimedAmount} ALGO`);
              break;
            }
          }
        }
      }
      
      console.log(`💰 Final claim amount: ${claimedAmount} ALGO`);
      
      // Keep transaction logging for debugging purposes
      console.log('📝 Transaction confirmed with ID:', txId);
      console.log('📝 Confirmed transaction details:', JSON.stringify(confirmedTxn, (key, value) => 
        typeof value === 'bigint' ? value.toString() : value, 2));
      
      setClaimResult({
        success: true,
        transactionId: txId,
        amount: claimedAmount,
        message: 'Funds claimed successfully!'
      });
      
      setClaimStep('complete');
      
      // Reset form
      setClaimCode('');
      setShowClaimCode(false);
    } catch (err) {
      console.error('❌ Claim failed:', err);
      
      let errorMessage = 'Failed to claim funds';
      if (err instanceof Error) {
        errorMessage = err.message;
        
        // Provide better error messages for common smart contract errors
        if (errorMessage.includes('assert failed pc=128') || errorMessage.includes('assert failed pc=129')) {
          errorMessage = 'These funds have already been claimed or the contract has expired. Each claim code can only be used once.';
        } else if (errorMessage.includes('assert failed pc=92') || errorMessage.includes('assert failed pc=93')) {
          errorMessage = 'Invalid claim code. Please check the code and try again.';
        } else if (errorMessage.includes('logic eval error') && errorMessage.includes('assert failed')) {
          errorMessage = 'Claim validation failed. This could mean the funds were already claimed, the claim code is invalid, or the contract has expired.';
        } else if (errorMessage.includes('application does not exist')) {
          errorMessage = 'Contract not found. Please verify the application ID in your claim code is correct.';
        } else if (errorMessage.includes('Contract has not been funded yet')) {
          errorMessage = 'This contract has not been funded yet. Please ask the sender to fund the contract first.';
        }
      }
      
      setClaimError(errorMessage);
      setClaimStep('form');
    } finally {
      setClaimLoading(false);
    }
  };

  const handleRefund = async () => {
    setRefundError('');
    setRefundResult(null);

    if (!validateRefundForm()) return;

    if (!connectedAccount) {
      setRefundError('No wallet account connected. Please connect your wallet first.');
      return;
    }

    setRefundLoading(true);
    setRefundStep('signing');

    try {
      console.log('Creating refund transaction for Application ID:', refundApplicationId);
      
      // Get fresh account from wallet service
      const currentAccount = await getConnectedAccount();
      
      if (!currentAccount) {
        throw new Error('Unable to get connected account from wallet');
      }
      
      // Step 1: Create refund transaction
      const refundResponse = await refundFunds({
        applicationId: parseInt(refundApplicationId),
        walletAddress: currentAccount
      });

      // Step 2: Sign the refund transaction
      console.log('Signing refund transaction...');
      const signedTxn = await signTransaction(refundResponse.transactionToSign);
      
      // Convert signed transaction to base64
      const signedTxnB64 = Buffer.from(signedTxn).toString('base64');
      
      setRefundStep('submitting');
      console.log('Submitting refund transaction...');
      
      // Step 3: Submit the signed transaction  
      const submitResponse = await submitTransaction({
        signedTransaction: signedTxnB64
      });

      console.log('✅ Refund transaction confirmed:', submitResponse.transactionId);

      setRefundResult({
        success: true,
        transactionId: submitResponse.transactionId,
        amount: 0, // We'll need to get this from contract state if needed
        message: 'Funds refunded successfully!'
      });
      
      setRefundStep('complete');
      
      // Reset form
      setRefundApplicationId('');
    } catch (err) {
      setRefundError(err instanceof Error ? err.message : 'Failed to refund funds');
      setRefundStep('form');
    } finally {
      setRefundLoading(false);
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
    setShowResultClaimCode(false);
    // Reset form fields for new transaction
    setAmount('');
    setRecipient('');
    setMessage('');
  };

  const handleClaimAnother = () => {
    setClaimResult(null);
    setClaimStep('form');
    setClaimError('');
    setShowClaimCode(false);
  };

  const handleRefundAnother = () => {
    setRefundResult(null);
    setRefundStep('form');
    setRefundError('');
  };

  const loadWalletContracts = async () => {
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
      const txnBuffer = Buffer.from(deleteResponse.transactionToSign, 'base64');
      const transaction = algosdk.decodeUnsignedTransaction(txnBuffer);
      const signedTxn = await signTransaction(transaction);

      // Submit the transaction
      const submitResponse = await submitDelete({
        signedTransaction: Buffer.from(signedTxn).toString('base64'),
        applicationId
      });

      console.log(`✅ Contract ${applicationId} deleted successfully: ${submitResponse.transactionId}`);
      
      // Reload contracts to reflect changes
      await loadWalletContracts();
    } catch (error) {
      console.error('❌ Failed to delete contract:', error);
      setContractsError(error instanceof Error ? error.message : 'Failed to delete contract');
    } finally {
      setDeleteLoading(prev => ({ ...prev, [applicationId]: false }));
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'claimed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'refundable':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'empty':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const isValidPhone = (phone: string) => {
    return /^\+?[\d\s\-()]{10,}$/.test(phone);
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

  const getClaimStepMessage = () => {
    switch (claimStep) {
      case 'submitting':
        return `Claiming funds on Algorand ${getNetworkConfig().name}...`;
      case 'complete':
        return 'Funds claimed successfully!';
      default:
        return '';
    }
  };

  const getExplorerUrl = (txId: string) => {
    const config = getNetworkConfig();
    return `${config.explorerUrl}/tx/${txId}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 relative overflow-hidden">
      {/* Dynamic overlay with radial gradients for depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-100/30 via-transparent to-purple-100/20"></div>
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-gradient-radial from-indigo-200/20 to-transparent rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-gradient-radial from-purple-200/15 to-transparent rounded-full blur-3xl"></div>
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-gradient-radial from-blue-100/10 to-transparent rounded-full blur-3xl"></div>
      
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
            
            {(() => {
              console.log(`🔄 Rendering header: walletConnected=${walletConnected}, connectedAccount=${connectedAccount}`);
              return walletConnected;
            })() ? (
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
                disabled={isLoading || claimLoading}
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
                disabled={isLoading || claimLoading}
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

        {/* Tab Navigation */}
        <div className="mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1">
            <div className="flex">
              <button
                onClick={() => handleTabChange('send')}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                  activeTab === 'send'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-center space-x-2">
                  <Send className="w-4 h-4" />
                  <span>Send Funds</span>
                </div>
              </button>
              <button
                onClick={() => handleTabChange('claim')}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                  activeTab === 'claim'
                    ? 'bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-center space-x-2">
                  <Download className="w-4 h-4" />
                  <span>Claim Funds</span>
                </div>
              </button>
              <button
                onClick={() => handleTabChange('refund')}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                  activeTab === 'refund'
                    ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-center space-x-2">
                  <RefreshCw className="w-4 h-4" />
                  <span>Refund Funds</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Send Money Tab */}
        {activeTab === 'send' && (
          <>
            {/* Send Success Result */}
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
                  {/* Combined Claim Code */}
                  {result.applicationId && (
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-200">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold text-blue-900">Claim Code</h3>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => setShowResultClaimCode(!showResultClaimCode)}
                            className="flex items-center space-x-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg transition-colors"
                            title={showResultClaimCode ? "Hide claim code" : "Show claim code"}
                          >
                            {showResultClaimCode ? (
                              <>
                                <EyeOff className="w-4 h-4" />
                                <span>Hide</span>
                              </>
                            ) : (
                              <>
                                <Eye className="w-4 h-4" />
                                <span>Show</span>
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => copyToClipboard(`${result.applicationId}-${result.claimCode}`, 'claimCode')}
                            className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                          >
                            <Copy className="w-4 h-4" />
                            <span>{copiedField === 'claimCode' ? 'Copied!' : 'Copy'}</span>
                          </button>
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-4 border-2 border-blue-300">
                        {showResultClaimCode ? (
                          <p className="font-mono text-lg font-bold text-gray-900 text-center tracking-wider break-all">
                            {result.applicationId}-{result.claimCode}
                          </p>
                        ) : (
                          <p className="font-mono text-lg font-bold text-gray-400 text-center tracking-wider">
                            •••••••••-••••••••••••••••••
                          </p>
                        )}
                      </div>
                      <p className="text-blue-700 text-sm mt-3 text-center">
                        Share this code with the recipient to claim their funds
                      </p>
                    </div>
                  )}

                  {/* Transaction Details */}
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <h4 className="font-medium text-gray-900 text-sm">Transaction Details</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Contract Creation:</span>
                        <a
                          href={getExplorerUrl(result.transactionId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 flex items-center space-x-1"
                        >
                          <span className="font-mono">{result.transactionId.slice(0, 8)}...{result.transactionId.slice(-6)}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      {result.fundingTransactionId && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Contract Funding:</span>
                          <a
                            href={getExplorerUrl(result.fundingTransactionId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 flex items-center space-x-1"
                          >
                            <span className="font-mono">{result.fundingTransactionId.slice(0, 8)}...{result.fundingTransactionId.slice(-6)}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

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
                      <span>View Contract</span>
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Send Form */}
            {step !== 'complete' && (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-6">
                  <h2 className="text-2xl font-bold text-white">Send Funds</h2>
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
                        placeholder="0.1"
                        disabled={isLoading}
                        className="w-full px-4 py-3 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-gray-50 disabled:cursor-not-allowed"
                        step="0.001"
                        min="0.1"
                        max={isMainNet() ? "10" : undefined}
                      />
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">
                        ALGO
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-gray-600">
                      <div className="flex items-center space-x-1">
                        <Info className="w-4 h-4 text-blue-500" />
                        <span>
                          Minimum 0.1 ALGO. Total cost: ~{amount ? (parseFloat(amount) + 0.487).toFixed(3) : '0.587'} ALGO 
                          (includes smart contract deployment for secure, refundable transfers)
                        </span>
                      </div>
                    </div>
                    {isMainNet() && (
                      <p className="text-xs text-gray-500 mt-1">
                        Maximum: 10 ALGO for safety on MainNet
                      </p>
                    )}
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mt-2">
                      <p className="text-yellow-800 text-xs">
                        <strong>💡 Balance Required:</strong> You need at least ~{amount ? (parseFloat(amount) + 0.487).toFixed(3) : '0.587'} ALGO in your wallet to deploy the smart contract.
                      </p>
                    </div>
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
                        <span>Send Funds</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Send Error Message */}
            {error && (
              <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-red-800 font-medium">Error</h3>
                  <p className="text-red-700 text-sm mt-1">{error}</p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Claim Money Tab */}
        {activeTab === 'claim' && (
          <>
            {/* Claim Success Result */}
            {claimResult && claimStep === 'complete' && (
              <div className="mb-8 bg-gradient-to-r from-purple-50 to-violet-50 border border-purple-200 rounded-2xl overflow-hidden shadow-lg">
                <div className="bg-gradient-to-r from-purple-600 to-violet-600 px-6 py-6">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-7 h-7 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white">🎉 Success! Funds have been sent to your wallet.</h2>
                      <p className="text-purple-100 mt-1">
                        {claimResult.amount} ALGO claimed on {getNetworkConfig().name}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="p-6 space-y-4">
                  {/* Transaction Details */}
                  <div className="bg-white rounded-xl p-5 border border-purple-200 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Claim Details</h3>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Amount Received</p>
                        <p className="text-2xl font-bold text-gray-900">{claimResult.amount} ALGO</p>
                      </div>
                      {claimResult.message && (
                        <div>
                          <p className="text-sm text-gray-600 mb-1">Message</p>
                          <p className="text-gray-900 italic">"{claimResult.message}"</p>
                        </div>
                      )}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm text-gray-600">Transaction ID</p>
                          <a
                            href={getExplorerUrl(claimResult.transactionId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center space-x-1 text-xs text-purple-600 hover:text-purple-800"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Explorer</span>
                          </a>
                        </div>
                        <p className="font-mono text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded border break-all">
                          {claimResult.transactionId}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      onClick={handleClaimAnother}
                      className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 text-white font-semibold rounded-xl transition-all transform hover:scale-[1.02] flex items-center justify-center space-x-2"
                    >
                      <Download className="w-5 h-5" />
                      <span>Claim Another</span>
                    </button>
                    <a
                      href={getExplorerUrl(claimResult.transactionId)}
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

            {/* Claim Form */}
            {claimStep !== 'complete' && (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-purple-600 to-violet-600 px-6 py-6">
                  <h2 className="text-2xl font-bold text-white">Claim Funds</h2>
                  <p className="text-purple-100 mt-1">
                    Enter your claim code to receive Algos on {getNetworkConfig().name}
                  </p>
                </div>
                
                <div className="p-6 space-y-6">
                  {/* Progress Indicator */}
                  {claimLoading && (
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-center space-x-3">
                      <Loader2 className="w-5 h-5 text-purple-500 animate-spin flex-shrink-0" />
                      <div>
                        <p className="text-purple-800 font-medium">{getClaimStepMessage()}</p>
                      </div>
                    </div>
                  )}

                  {/* Combined Claim Code Input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Claim Code
                    </label>
                    <div className="relative">
                      <input
                        type={showClaimCode ? "text" : "password"}
                        value={claimCode}
                        onChange={(e) => setClaimCode(e.target.value.toUpperCase())}
                        placeholder="e.g., 741503729-A1B2C3D4E5F6G7H8"
                        disabled={claimLoading}
                        className="w-full px-4 py-3 pr-12 text-lg font-mono border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:bg-gray-50 disabled:cursor-not-allowed tracking-wider"
                      />
                      <button
                        type="button"
                        onClick={() => setShowClaimCode(!showClaimCode)}
                        disabled={claimLoading}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 disabled:cursor-not-allowed transition-colors"
                        title={showClaimCode ? "Hide claim code" : "Show claim code"}
                      >
                        {showClaimCode ? (
                          <EyeOff className="w-5 h-5" />
                        ) : (
                          <Eye className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Enter the claim code you received (includes both app ID and claim code).
                    </p>
                  </div>

                  {/* Wallet Status */}
                  {walletConnected && (
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                      <div className="flex items-center space-x-3">
                        <CheckCircle className="w-5 h-5 text-purple-500" />
                        <div>
                          <p className="text-purple-800 font-medium">Wallet Connected</p>
                          <p className="text-purple-700 text-sm">
                            Funds will be sent to: {connectedAccount.slice(0, 8)}...{connectedAccount.slice(-6)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Claim Button */}
                  <button
                    onClick={handleClaimFunds}
                    disabled={claimLoading || !walletConnected || claimStep !== 'form'}
                    className="w-full py-4 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold rounded-xl transition-all transform hover:scale-[1.02] disabled:transform-none disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    {claimLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Claiming...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-5 h-5" />
                        <span>Claim Funds</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Claim Error Message */}
            {claimError && (
              <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-red-800 font-medium">Error</h3>
                  <p className="text-red-700 text-sm mt-1">{claimError}</p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Wallet Connection Required Notice */}
        {!walletConnected && !showReconnectPrompt && (
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start space-x-3">
            <Wallet className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-blue-800 font-medium">Wallet Required</h3>
              <p className="text-blue-700 text-sm mt-1">
                Connect your Pera wallet to {activeTab === 'send' ? 'send' : activeTab === 'claim' ? 'claim' : 'refund'} money securely on Algorand {getNetworkConfig().name}.
              </p>
            </div>
          </div>
        )}

        {/* Refund Money Tab */}
        {activeTab === 'refund' && (
          <>
            {/* Contract Management Section */}
            <div className="mb-8 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-6">
                <h2 className="text-2xl font-bold text-white">My Contracts</h2>
                <p className="text-indigo-100 mt-1">
                  Manage contracts you've created on {getNetworkConfig().name}
                </p>
              </div>
              
              <div className="p-6 space-y-6">
                {/* Load Contracts Button */}
                {!showContracts && (
                  <div className="text-center">
                    <button
                      onClick={() => {
                        setShowContracts(true);
                        loadWalletContracts();
                      }}
                      disabled={!walletConnected || contractsLoading}
                      className="inline-flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold rounded-xl transition-all transform hover:scale-[1.02] disabled:transform-none disabled:cursor-not-allowed"
                    >
                      <List className="w-5 h-5" />
                      <span>Load My Contracts</span>
                    </button>
                    <p className="text-gray-600 text-sm mt-2">
                      View and manage all contracts you've created
                    </p>
                  </div>
                )}

                {/* Contracts Loading */}
                {showContracts && contractsLoading && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-center space-x-3">
                    <Loader2 className="w-5 h-5 text-indigo-500 animate-spin flex-shrink-0" />
                    <div>
                      <p className="text-indigo-800 font-medium">Loading your contracts...</p>
                      <p className="text-indigo-600 text-sm mt-1">
                        Fetching contract data from the blockchain
                      </p>
                    </div>
                  </div>
                )}

                {/* Contracts Error */}
                {showContracts && contractsError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="text-red-800 font-medium">Error Loading Contracts</h3>
                      <p className="text-red-700 text-sm mt-1">{contractsError}</p>
                      <button
                        onClick={loadWalletContracts}
                        className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg font-medium transition-colors"
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                )}

                {/* Contracts List */}
                {showContracts && !contractsLoading && !contractsError && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Your Contracts ({contracts.length})
                      </h3>
                      <button
                        onClick={loadWalletContracts}
                        disabled={contractsLoading}
                        className="flex items-center space-x-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>Refresh</span>
                      </button>
                    </div>

                    {contracts.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <List className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p>No contracts found</p>
                        <p className="text-sm">Contracts you create will appear here</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {contracts.map((contract) => (
                          <div
                            key={contract.applicationId}
                            className="bg-gray-50 rounded-xl p-4 border border-gray-200"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center space-x-3">
                                  <span className="font-mono text-lg font-bold text-gray-900">
                                    App ID: {contract.applicationId}
                                  </span>
                                  <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusBadgeColor(contract.status)}`}>
                                    {contract.status}
                                  </span>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <span className="text-gray-600">Amount: </span>
                                    <span className="font-medium">{contract.amount} ALGO</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Balance: </span>
                                    <span className="font-medium">{contract.balance} ALGO</span>
                                  </div>
                                  {contract.createdDate && (
                                    <div className="col-span-2">
                                      <span className="text-gray-600">Created: </span>
                                      <span className="font-medium">
                                        {new Date(contract.createdDate).toLocaleString()}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center space-x-2 ml-4">
                                {/* View on Explorer */}
                                <a
                                  href={`${getNetworkConfig().explorerUrl}/application/${contract.applicationId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                                  title="View on Explorer"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>

                                {/* Refund Button */}
                                {contract.canRefund && (
                                  <button
                                    onClick={() => {
                                      setRefundApplicationId(contract.applicationId.toString());
                                      // Scroll to refund form
                                      setTimeout(() => {
                                        const refundForm = document.querySelector('[data-refund-form]');
                                        refundForm?.scrollIntoView({ behavior: 'smooth' });
                                      }, 100);
                                    }}
                                    className="px-3 py-1.5 text-sm bg-yellow-100 hover:bg-yellow-200 text-yellow-800 rounded-lg transition-colors font-medium"
                                  >
                                    Refund
                                  </button>
                                )}

                                {/* Delete Button */}
                                {contract.canDelete && (
                                  <button
                                    onClick={() => handleDeleteContract(contract.applicationId)}
                                    disabled={deleteLoading[contract.applicationId]}
                                    className="p-2 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Delete Contract"
                                  >
                                    {deleteLoading[contract.applicationId] ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-4 h-4" />
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
            </div>

            {/* Refund Success Result */}
            {refundResult && refundStep === 'complete' && (
              <div className="mb-8 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl overflow-hidden shadow-lg">
                <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-6">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-7 h-7 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white">Refund Successful!</h2>
                      <p className="text-green-100 mt-1">
                        Your funds have been refunded from contract {refundApplicationId}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="p-6 space-y-4">
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <h4 className="font-medium text-gray-900 text-sm">Transaction Details</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Refund Transaction:</span>
                        <a
                          href={getExplorerUrl(refundResult.transactionId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 flex items-center space-x-1"
                        >
                          <span className="font-mono">{refundResult.transactionId.slice(0, 8)}...{refundResult.transactionId.slice(-6)}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      onClick={handleRefundAnother}
                      className="flex-1 py-3 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-semibold rounded-xl transition-all transform hover:scale-[1.02] flex items-center justify-center space-x-2"
                    >
                      <RefreshCw className="w-5 h-5" />
                      <span>Refund Another Contract</span>
                    </button>
                    <a
                      href={getExplorerUrl(refundResult.transactionId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-all flex items-center justify-center space-x-2"
                    >
                      <ExternalLink className="w-5 h-5" />
                      <span>View Transaction</span>
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Refund Form */}
            {refundStep !== 'complete' && (
              <div data-refund-form className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-red-600 to-rose-600 px-6 py-6">
                  <h2 className="text-2xl font-bold text-white">Refund Funds</h2>
                  <p className="text-red-100 mt-1">
                    Refund unclaimed funds from your contracts on {getNetworkConfig().name}
                  </p>
                </div>
                
                <div className="p-6 space-y-6">
                  {/* Progress Indicator */}
                  {refundStep !== 'form' && (
                    <div className="bg-blue-50 rounded-xl p-4">
                      <div className="flex items-center space-x-3">
                        {refundLoading ? (
                          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                        ) : (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        )}
                        <div>
                          <p className="font-medium text-gray-900">
                            {refundStep === 'signing' && 'Please sign the refund transaction in your wallet...'}
                            {refundStep === 'submitting' && 'Submitting refund transaction to the network...'}
                          </p>
                          <p className="text-sm text-gray-600 mt-1">
                            This may take a few moments to complete.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Error Display */}
                  {refundError && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3">
                      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-red-800 font-medium">Refund Failed</h3>
                        <p className="text-red-700 text-sm mt-1">{refundError}</p>
                      </div>
                    </div>
                  )}

                  {/* Application ID Input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Application ID
                    </label>
                    <input
                      type="text"
                      value={refundApplicationId}
                      onChange={(e) => setRefundApplicationId(e.target.value)}
                      placeholder="Enter the Application ID of the contract to refund"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors font-mono text-lg"
                      disabled={refundLoading}
                    />
                    <p className="text-sm text-gray-500 mt-2">
                      This should be the Application ID from when you originally sent the funds.
                    </p>
                  </div>

                  {/* Important Notice */}
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                    <div className="flex items-start space-x-3">
                      <Clock className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-yellow-800 font-medium">Refund Requirements</h3>
                        <div className="text-yellow-700 text-sm mt-1 space-y-1">
                          <p>• You must be the original sender of the contract</p>
                          <p>• At least 5 minutes must have passed since contract creation</p>
                          <p>• The funds must not have been claimed yet</p>
                          <p>• You must connect the same wallet that created the contract</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Connection Status */}
                  {walletConnected && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <div className="flex items-center space-x-3">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <div>
                          <p className="text-green-800 font-medium">Wallet Connected</p>
                          <p className="text-green-700 text-sm">
                            Funds will be refunded to: {connectedAccount.slice(0, 8)}...{connectedAccount.slice(-6)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    onClick={handleRefund}
                    disabled={!walletConnected || refundLoading || !refundApplicationId.trim()}
                    className="w-full py-4 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold rounded-xl transition-all transform hover:scale-[1.02] disabled:transform-none disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    {refundLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Processing Refund...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-5 h-5" />
                        <span>Refund Funds</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
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
    </div>
  );
}

export default App;