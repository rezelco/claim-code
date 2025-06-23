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

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: 'refund' | 'delete' | 'no_email';
    title: string;
    message: string;
    onConfirm: () => void;
    applicationId?: number;
    amount?: number;
  }>({
    isOpen: false,
    type: 'refund',
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Toast notification state
  const [toast, setToast] = useState<{
    isVisible: boolean;
    message: string;
    type: 'success' | 'error';
  }>({
    isVisible: false,
    message: '',
    type: 'success'
  });

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
    // Email is now optional - validation removed
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

    // Check if email is empty and show confirmation dialog
    if (!recipient.trim()) {
      setConfirmDialog({
        isOpen: true,
        type: 'no_email',
        title: 'No email address provided',
        message: "The recipient won't receive an email notification. They'll need the claim code through another method. Continue anyway?",
        onConfirm: () => {
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
          proceedWithSend();
        }
      });
      return;
    }

    // If email is provided, proceed normally
    proceedWithSend();
  };

  const proceedWithSend = async () => {
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

  const handleRefundWithId = async (applicationId: number) => {
    console.log('handleRefundWithId called with ID:', applicationId);
    setRefundError('');
    setRefundResult(null);

    if (!walletConnected) {
      setRefundError('Please connect your wallet first');
      return;
    }

    if (!connectedAccount) {
      setRefundError('No wallet account connected. Please connect your wallet first.');
      return;
    }

    setRefundLoading(true);
    setRefundStep('signing');

    try {
      console.log('Creating refund transaction for Application ID:', applicationId);
      
      // Get fresh account from wallet service
      const currentAccount = await getConnectedAccount();
      
      if (!currentAccount) {
        throw new Error('Unable to get connected account from wallet');
      }
      
      // Step 1: Create refund transaction
      const refundResponse = await refundFunds({
        applicationId: applicationId,
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
      
      // Show success toast
      showToast('Contract refunded successfully');
      
      // Reload contracts to reflect changes
      if (showContracts) {
        loadWalletContracts();
      }
      
      // Reset form
      setRefundApplicationId('');
    } catch (err) {
      console.error('❌ Refund error details:', err);
      setRefundError(err instanceof Error ? err.message : 'Failed to refund funds');
      setRefundStep('form');
    } finally {
      setRefundLoading(false);
    }
  };

  const handleRefund = async () => {
    console.log('handleRefund called');
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
      
      // Show success toast
      showToast('Contract refunded successfully');
      
      // Reload contracts to reflect changes
      if (showContracts) {
        loadWalletContracts();
      }
      
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
      
      // Show success toast
      showToast('Contract closed successfully');
      
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

  // Contract categorization logic
  const categorizeContract = (contract: any) => {
    if (contract.claimed) {
      return 'claimed';
    }
    if (contract.status.toLowerCase() === 'empty' && contract.balance === 0) {
      return 'refunded';
    }
    if (contract.canRefund || contract.status.toLowerCase() === 'active' || contract.status.toLowerCase() === 'refundable') {
      return 'active';
    }
    return 'active'; // Default to active
  };

  const getActiveContracts = () => {
    return contracts.filter(contract => categorizeContract(contract) === 'active');
  };

  const getRefundedContracts = () => {
    return contracts.filter(contract => categorizeContract(contract) === 'refunded');
  };

  const getClaimedContracts = () => {
    return contracts.filter(contract => categorizeContract(contract) === 'claimed');
  };

  // Time calculation helper
  const getTimeAgo = (contract: any) => {
    // Try to get timestamp from either field
    let timestamp = contract.createdTimestamp;
    
    // If no timestamp, try parsing createdDate
    if (!timestamp || timestamp <= 0) {
      if (contract.createdDate) {
        timestamp = new Date(contract.createdDate).getTime();
      }
    }
    
    // Still no valid timestamp - provide reasonable fallback
    if (!timestamp || timestamp <= 0 || isNaN(timestamp)) {
      // For older contracts without timestamp data, assume they're "some time ago"
      return 'some time ago';
    }

    const now = Date.now();
    // Convert timestamp to milliseconds if it's in seconds (Unix timestamp)
    const timestampMs = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
    const diffMs = now - timestampMs;
    
    // Handle negative differences (future timestamps)
    if (diffMs < 0) {
      return 'just now';
    }

    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) {
      return 'just now';
    } else if (diffMinutes < 60) {
      return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    } else if (diffDays === 1) {
      return 'yesterday';
    } else {
      return `${diffDays} days ago`;
    }
  };

  // Summary calculations
  const getTotalRefundable = () => {
    return getActiveContracts()
      .filter(contract => contract.canRefund)
      .reduce((sum, contract) => sum + contract.amount, 0);
  };


  const getTotalDeleteCount = () => {
    // Count of claimed and refunded contracts that can be closed out
    const closeOutContracts = [...getRefundedContracts(), ...getClaimedContracts()];
    return closeOutContracts.filter(contract => contract.canDelete).length;
  };

  // Helper function to check if refund is available (5+ minutes after creation)
  const getRefundAvailability = (contract: any) => {
    // Try to get timestamp from either field
    let timestamp = contract.createdTimestamp;
    
    // If no timestamp, try parsing createdDate
    if (!timestamp || timestamp <= 0) {
      if (contract.createdDate) {
        timestamp = new Date(contract.createdDate).getTime();
      }
    }
    
    if (!timestamp || timestamp <= 0 || isNaN(timestamp)) {
      // For older contracts without timestamp data, assume they're old enough to refund
      // This prevents "refund in 5 min" showing for legacy contracts
      return { canRefund: true, timeRemaining: 0 };
    }

    const now = Date.now();
    // Convert timestamp to milliseconds if it's in seconds (Unix timestamp)
    const timestampMs = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
    const fiveMinutesMs = 5 * 60 * 1000;
    const timeSinceCreation = now - timestampMs;
    
    if (timeSinceCreation >= fiveMinutesMs) {
      return { canRefund: true, timeRemaining: 0 };
    } else {
      const remainingMs = fiveMinutesMs - timeSinceCreation;
      const remainingMinutes = Math.ceil(remainingMs / (1000 * 60));
      return { canRefund: false, timeRemaining: remainingMinutes };
    }
  };

  // Show confirmation dialog
  const showConfirmDialog = (type: 'refund' | 'delete', applicationId: number, amount?: number) => {
    console.log('showConfirmDialog called:', type, applicationId, amount);
    if (type === 'refund') {
      setConfirmDialog({
        isOpen: true,
        type: 'refund',
        title: 'Refund Contract',
        message: `Are you sure you want to refund ${amount} ALGO?`,
        applicationId,
        amount,
        onConfirm: () => {
          console.log('Confirm dialog onConfirm called for refund');
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
          setRefundApplicationId(applicationId.toString());
          handleRefundWithId(applicationId);
        }
      });
    } else if (type === 'delete') {
      setConfirmDialog({
        isOpen: true,
        type: 'delete',
        title: 'Delete Contract',
        message: `Delete Contract?\nThis will permanently remove the contract from the blockchain.`,
        applicationId,
        onConfirm: () => {
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
          handleDeleteContract(applicationId);
        }
      });
    }
  };

  // Handle inline refund from contract card
  const handleInlineRefund = async (applicationId: number, amount: number) => {
    console.log('handleInlineRefund called:', applicationId, amount, 'walletConnected:', walletConnected);
    if (!walletConnected || !connectedAccount) {
      await handleConnectWallet();
      return;
    }

    // Add small delay to ensure state is ready
    setTimeout(() => {
      showConfirmDialog('refund', applicationId, amount);
    }, 50);
  };

  // Handle inline delete from contract card
  const handleInlineDelete = (applicationId: number) => {
    showConfirmDialog('delete', applicationId);
  };

  // Show toast notification
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ isVisible: true, message, type });
    setTimeout(() => {
      setToast(prev => ({ ...prev, isVisible: false }));
    }, 8000);
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
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <Send className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">RandCash</h1>
              <p className="text-sm text-purple-100 hidden sm:block">Send crypto with claim codes</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2 sm:space-x-4">
            {/* Network Selector */}
            <NetworkSelector onNetworkChange={handleNetworkChange} />
            
            {(() => {
              console.log(`🔄 Rendering header: walletConnected=${walletConnected}, connectedAccount=${connectedAccount}`);
              return walletConnected;
            })() ? (
              <div className="flex items-center space-x-2 sm:space-x-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-white">Pera Wallet</p>
                  <p className="text-xs text-purple-200">{connectedAccount.slice(0, 8)}...{connectedAccount.slice(-6)}</p>
                </div>
                <div className="text-right sm:hidden">
                  <p className="text-xs text-purple-200">{connectedAccount.slice(0, 6)}...</p>
                </div>
                <button
                  onClick={handleDisconnectWallet}
                  className="px-3 sm:px-4 py-2 bg-purple-500/50 hover:bg-purple-500/70 text-white rounded-lg font-medium transition-colors text-sm"
                >
                  <span className="hidden sm:inline">Disconnect</span>
                  <span className="sm:hidden">Disc</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnectWallet}
                disabled={isLoading || claimLoading}
                className="flex items-center space-x-2 px-4 sm:px-6 py-2 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-400 hover:to-blue-400 disabled:from-purple-600/50 disabled:to-blue-600/50 text-white rounded-lg font-medium transition-all transform hover:scale-[1.02] disabled:transform-none shadow-lg text-sm"
              >
                <Wallet className="w-4 h-4" />
                <span>Connect</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-8">
          {/* Main Form Area - Left Side */}
          <div className="lg:col-span-4">
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
          <div className="mb-6 bg-orange-900/30 border border-orange-600/50 rounded-xl p-4 flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-orange-300 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-orange-200 font-medium">MainNet Warning</h3>
              <p className="text-orange-100 text-sm mt-1">
                You are using the live Algorand MainNet. Real ALGO will be used for transactions. 
                Maximum amount is limited to 10 ALGO for safety.
              </p>
            </div>
          </div>
        )}


        {/* Send Money Tab */}
        {activeTab === 'send' && (
          <>
            {/* Send Success Result */}
            {result && step === 'complete' && (
              <div className="mb-8 bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl overflow-hidden shadow-lg">
                {/* Tab Navigation */}
                <div className="px-3 sm:px-6 pt-6 pb-4">
                  <div className="flex gap-2 sm:gap-4 justify-center flex-wrap">
                    <button
                      onClick={() => handleTabChange('send')}
                      className="px-4 sm:px-8 py-2 sm:py-3 rounded-xl font-medium transition-all shadow-lg whitespace-nowrap bg-purple-800/30 text-white shadow-xl transform scale-105 border-2 border-cyan-400 backdrop-blur-sm"
                    >
                      <div className="flex items-center space-x-1 sm:space-x-2">
                        <Send className="w-4 h-4" />
                        <span className="text-sm sm:text-base">Send</span>
                      </div>
                    </button>
                    <button
                      onClick={() => handleTabChange('claim')}
                      className="px-4 sm:px-8 py-2 sm:py-3 rounded-xl font-medium transition-all shadow-lg whitespace-nowrap bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm"
                    >
                      <div className="flex items-center space-x-1 sm:space-x-2">
                        <Download className="w-4 h-4" />
                        <span className="text-sm sm:text-base">Claim</span>
                      </div>
                    </button>
                    <button
                      onClick={() => handleTabChange('refund')}
                      className="px-4 sm:px-8 py-2 sm:py-3 rounded-xl font-medium transition-all shadow-lg whitespace-nowrap bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm"
                    >
                      <div className="flex items-center space-x-1 sm:space-x-2">
                        <RefreshCw className="w-4 h-4" />
                        <span className="text-sm sm:text-base">Contracts</span>
                      </div>
                    </button>
                  </div>
                </div>
                
                <div className="bg-purple-600/20 backdrop-blur-sm px-6 py-6 border-b border-white/10">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-7 h-7 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white">Money Sent Successfully!</h2>
                      <p className="text-purple-100 mt-1">
                        {result.amount} ALGO sent to {result.recipient} on {getNetworkConfig().name}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="p-6 space-y-4">

                  {/* Combined Claim Code */}
                  {result.applicationId && (
                    <div className="bg-purple-800/30 backdrop-blur-sm rounded-xl p-5 border border-purple-600/50 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold text-white">Claim Code</h3>
                        <div className="flex items-center space-x-1 sm:space-x-2">
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
                            className="flex items-center space-x-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors"
                          >
                            <Copy className="w-4 h-4" />
                            <span>{copiedField === 'claimCode' ? 'Copied!' : 'Copy'}</span>
                          </button>
                        </div>
                      </div>
                      <div className="bg-purple-900/30 rounded-lg p-4 border border-purple-600/30">
                        {showResultClaimCode ? (
                          <p className="font-mono text-lg font-bold text-purple-100 text-center tracking-wider break-all">
                            {result.applicationId}-{result.claimCode}
                          </p>
                        ) : (
                          <p className="font-mono text-lg font-bold text-purple-300 text-center tracking-wider">
                            •••••••••-••••••••••••••••••
                          </p>
                        )}
                      </div>
                      <p className="text-purple-200 text-sm mt-3 text-center">
                        Share this code with the recipient to claim their funds
                      </p>
                    </div>
                  )}

                  {/* Transaction Details */}
                  <div className="bg-purple-800/30 backdrop-blur-sm rounded-xl p-5 border border-purple-600/50 shadow-sm">
                    <h3 className="text-lg font-semibold text-white mb-4">Transaction Details</h3>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm text-purple-200 mb-1">Amount Sent</p>
                        <p className="text-2xl font-bold text-white">{result.amount} ALGO</p>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm text-purple-200">Contract Creation ID</p>
                          <a
                            href={getExplorerUrl(result.transactionId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center space-x-1 text-xs text-purple-300 hover:text-purple-100"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Explorer</span>
                          </a>
                        </div>
                        <p className="font-mono text-sm text-purple-100 bg-purple-900/30 px-3 py-2 rounded border border-purple-600/30 break-all">
                          {result.transactionId}
                        </p>
                      </div>
                      {result.fundingTransactionId && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm text-purple-200">Funding Transaction ID</p>
                            <a
                              href={getExplorerUrl(result.fundingTransactionId)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center space-x-1 text-xs text-purple-300 hover:text-purple-100"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Explorer</span>
                            </a>
                          </div>
                          <p className="font-mono text-sm text-purple-100 bg-purple-900/30 px-3 py-2 rounded border border-purple-600/30 break-all">
                            {result.fundingTransactionId}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      onClick={handleSendAnother}
                      className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-400 hover:to-blue-400 text-white font-semibold rounded-xl transition-all transform hover:scale-[1.02] flex items-center justify-center space-x-2 shadow-lg"
                    >
                      <Send className="w-5 h-5" />
                      <span>Send Another Payment</span>
                    </button>
                    <a
                      href={getExplorerUrl(result.transactionId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-3 bg-purple-700/30 hover:bg-purple-600/40 text-purple-100 font-semibold rounded-xl transition-all flex items-center justify-center space-x-2"
                    >
                      <ExternalLink className="w-5 h-5" />
                      <span>View on Explorer</span>
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Send Form */}
            {step !== 'complete' && (
              <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 overflow-hidden">
                {/* Tab Navigation */}
                <div className="px-3 sm:px-6 pt-6 pb-4">
                  <div className="flex gap-2 sm:gap-4 justify-center flex-wrap">
                    <button
                      onClick={() => handleTabChange('send')}
                      className={`px-4 sm:px-8 py-2 sm:py-3 rounded-xl font-medium transition-all shadow-lg whitespace-nowrap ${
                        activeTab === 'send'
                          ? 'bg-purple-800/30 text-white shadow-xl transform scale-105 border-2 border-cyan-400 backdrop-blur-sm'
                          : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
                      }`}
                    >
                      <div className="flex items-center space-x-1 sm:space-x-2">
                        <Send className="w-4 h-4" />
                        <span className="text-sm sm:text-base">Send</span>
                      </div>
                    </button>
                    <button
                      onClick={() => handleTabChange('claim')}
                      className={`px-4 sm:px-8 py-2 sm:py-3 rounded-xl font-medium transition-all shadow-lg whitespace-nowrap ${
                        activeTab === 'claim'
                          ? 'bg-purple-800/30 text-white shadow-xl transform scale-105 border-2 border-cyan-400 backdrop-blur-sm'
                          : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
                      }`}
                    >
                      <div className="flex items-center space-x-1 sm:space-x-2">
                        <Download className="w-4 h-4" />
                        <span className="text-sm sm:text-base">Claim</span>
                      </div>
                    </button>
                    <button
                      onClick={() => handleTabChange('refund')}
                      className={`px-4 sm:px-8 py-2 sm:py-3 rounded-xl font-medium transition-all shadow-lg whitespace-nowrap ${
                        activeTab === 'refund'
                          ? 'bg-purple-800/30 text-white shadow-xl transform scale-105 border-2 border-cyan-400 backdrop-blur-sm'
                          : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
                      }`}
                    >
                      <div className="flex items-center space-x-1 sm:space-x-2">
                        <RefreshCw className="w-4 h-4" />
                        <span className="text-sm sm:text-base">Contracts</span>
                      </div>
                    </button>
                  </div>
                </div>
                <div className="bg-purple-600/20 backdrop-blur-sm px-6 py-6 border-b border-white/10">
                  <h2 className="text-2xl font-bold text-white">Send Cryptocurrency</h2>
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
                    <label className="block text-sm font-medium text-white mb-2">
                      Amount (ALGO)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.1"
                        disabled={isLoading}
                        className="w-full px-4 py-3 text-lg bg-purple-800/30 backdrop-blur-sm border border-purple-600/50 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all disabled:bg-purple-900/20 disabled:cursor-not-allowed text-white placeholder-purple-300"
                        step="0.001"
                        min="0.1"
                        max={isMainNet() ? "10" : undefined}
                      />
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-purple-300 font-medium">
                        ALGO
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-purple-100">
                      <div className="flex items-center space-x-1">
                        <Info className="w-4 h-4 text-purple-300" />
                        <span>
                          Minimum 0.1 ALGO required
                        </span>
                      </div>
                    </div>
                    {isMainNet() && (
                      <p className="text-xs text-purple-200 mt-1">
                        Maximum: 10 ALGO for safety on MainNet
                      </p>
                    )}
                  </div>

                  {/* Recipient Input */}
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Recipient Email (Optional)
                    </label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-purple-400">
                        {getRecipientIcon()}
                      </div>
                      <input
                        type="text"
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                        placeholder="recipient@example.com"
                        disabled={isLoading}
                        className="w-full pl-10 pr-4 py-3 bg-purple-800/30 backdrop-blur-sm border border-purple-600/50 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all disabled:bg-purple-900/20 disabled:cursor-not-allowed text-white placeholder-purple-300"
                      />
                    </div>
                  </div>

                  {/* Message Input */}
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Message (Optional)
                    </label>
                    <div className="relative">
                      <div className="absolute left-3 top-3 text-purple-400">
                        <MessageSquare className="w-4 h-4" />
                      </div>
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Add a personal message..."
                        rows={3}
                        disabled={isLoading}
                        className="w-full pl-10 pr-4 py-3 bg-purple-800/30 backdrop-blur-sm border border-purple-600/50 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-purple-400 resize-none transition-all disabled:bg-purple-900/20 disabled:cursor-not-allowed text-white placeholder-purple-300"
                      />
                    </div>
                  </div>

                  {/* Send Button */}
                  <button
                    onClick={walletConnected ? handleSend : handleConnectWallet}
                    disabled={isLoading || (walletConnected && step !== 'form')}
                    className="w-full py-4 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-400 hover:to-blue-400 disabled:from-purple-600/50 disabled:to-blue-600/50 text-white font-semibold rounded-xl transition-all transform hover:scale-[1.02] disabled:transform-none disabled:cursor-not-allowed flex items-center justify-center space-x-2 shadow-lg"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        {walletConnected ? <Send className="w-5 h-5" /> : <Wallet className="w-5 h-5" />}
                        <span>{walletConnected ? 'Send Funds' : 'Connect'}</span>
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
              <div className="mb-8 bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl overflow-hidden shadow-lg">
                {/* Tab Navigation */}
                <div className="px-3 sm:px-6 pt-6 pb-4">
                  <div className="flex gap-2 sm:gap-4 justify-center flex-wrap">
                    <button
                      onClick={() => handleTabChange('send')}
                      className="px-4 sm:px-8 py-2 sm:py-3 rounded-xl font-medium transition-all shadow-lg whitespace-nowrap bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm"
                    >
                      <div className="flex items-center space-x-1 sm:space-x-2">
                        <Send className="w-4 h-4" />
                        <span className="text-sm sm:text-base">Send</span>
                      </div>
                    </button>
                    <button
                      onClick={() => handleTabChange('claim')}
                      className="px-4 sm:px-8 py-2 sm:py-3 rounded-xl font-medium transition-all shadow-lg whitespace-nowrap bg-purple-800/30 text-white shadow-xl transform scale-105 border-2 border-cyan-400 backdrop-blur-sm"
                    >
                      <div className="flex items-center space-x-1 sm:space-x-2">
                        <Download className="w-4 h-4" />
                        <span className="text-sm sm:text-base">Claim</span>
                      </div>
                    </button>
                    <button
                      onClick={() => handleTabChange('refund')}
                      className="px-4 sm:px-8 py-2 sm:py-3 rounded-xl font-medium transition-all shadow-lg whitespace-nowrap bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm"
                    >
                      <div className="flex items-center space-x-1 sm:space-x-2">
                        <RefreshCw className="w-4 h-4" />
                        <span className="text-sm sm:text-base">Contracts</span>
                      </div>
                    </button>
                  </div>
                </div>
                
                <div className="bg-purple-600/20 backdrop-blur-sm px-6 py-6 border-b border-white/10">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-7 h-7 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white">Funds Claimed Successfully!</h2>
                      <p className="text-purple-100 mt-1">
                        {claimResult.amount} ALGO claimed on {getNetworkConfig().name}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="p-6 space-y-4">
                  {/* Transaction Details */}
                  <div className="bg-purple-800/30 backdrop-blur-sm rounded-xl p-5 border border-purple-600/50 shadow-sm">
                    <h3 className="text-lg font-semibold text-white mb-4">Claim Details</h3>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm text-purple-200 mb-1">Amount Received</p>
                        <p className="text-2xl font-bold text-white">{claimResult.amount} ALGO</p>
                      </div>
                      {claimResult.message && (
                        <div>
                          <p className="text-sm text-purple-200 mb-1">Message</p>
                          <p className="text-white italic">"{claimResult.message}"</p>
                        </div>
                      )}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm text-purple-200">Transaction ID</p>
                          <a
                            href={getExplorerUrl(claimResult.transactionId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center space-x-1 text-xs text-purple-300 hover:text-purple-100"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Explorer</span>
                          </a>
                        </div>
                        <p className="font-mono text-sm text-purple-100 bg-purple-900/30 px-3 py-2 rounded border border-purple-600/30 break-all">
                          {claimResult.transactionId}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      onClick={handleClaimAnother}
                      className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-400 hover:to-blue-400 text-white font-semibold rounded-xl transition-all transform hover:scale-[1.02] flex items-center justify-center space-x-2 shadow-lg"
                    >
                      <Download className="w-5 h-5" />
                      <span>Claim Another</span>
                    </button>
                    <a
                      href={getExplorerUrl(claimResult.transactionId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-3 bg-purple-700/30 hover:bg-purple-600/40 text-purple-100 font-semibold rounded-xl transition-all flex items-center justify-center space-x-2"
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
              <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 overflow-hidden">
                {/* Tab Navigation */}
                <div className="px-3 sm:px-6 pt-6 pb-4">
                  <div className="flex gap-2 sm:gap-4 justify-center flex-wrap">
                    <button
                      onClick={() => handleTabChange('send')}
                      className={`px-4 sm:px-8 py-2 sm:py-3 rounded-xl font-medium transition-all shadow-lg whitespace-nowrap ${
                        activeTab === 'send'
                          ? 'bg-purple-800/30 text-white shadow-xl transform scale-105 border-2 border-cyan-400 backdrop-blur-sm'
                          : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
                      }`}
                    >
                      <div className="flex items-center space-x-1 sm:space-x-2">
                        <Send className="w-4 h-4" />
                        <span className="text-sm sm:text-base">Send</span>
                      </div>
                    </button>
                    <button
                      onClick={() => handleTabChange('claim')}
                      className={`px-4 sm:px-8 py-2 sm:py-3 rounded-xl font-medium transition-all shadow-lg whitespace-nowrap ${
                        activeTab === 'claim'
                          ? 'bg-purple-800/30 text-white shadow-xl transform scale-105 border-2 border-cyan-400 backdrop-blur-sm'
                          : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
                      }`}
                    >
                      <div className="flex items-center space-x-1 sm:space-x-2">
                        <Download className="w-4 h-4" />
                        <span className="text-sm sm:text-base">Claim</span>
                      </div>
                    </button>
                    <button
                      onClick={() => handleTabChange('refund')}
                      className={`px-4 sm:px-8 py-2 sm:py-3 rounded-xl font-medium transition-all shadow-lg whitespace-nowrap ${
                        activeTab === 'refund'
                          ? 'bg-purple-800/30 text-white shadow-xl transform scale-105 border-2 border-cyan-400 backdrop-blur-sm'
                          : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
                      }`}
                    >
                      <div className="flex items-center space-x-1 sm:space-x-2">
                        <RefreshCw className="w-4 h-4" />
                        <span className="text-sm sm:text-base">Contracts</span>
                      </div>
                    </button>
                  </div>
                </div>
                <div className="bg-purple-600/20 backdrop-blur-sm px-6 py-6 border-b border-white/10">
                  <h2 className="text-2xl font-bold text-white">Claim Funds</h2>
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
                    <label className="block text-sm font-medium text-white mb-2">
                      Claim Code
                    </label>
                    <div className="relative">
                      <input
                        type={showClaimCode ? "text" : "password"}
                        value={claimCode}
                        onChange={(e) => setClaimCode(e.target.value.toUpperCase())}
                        placeholder="e.g., 741503729-A1B2C3D4E5F6G7H8"
                        disabled={claimLoading}
                        className="w-full px-4 py-3 pr-12 text-lg font-mono bg-purple-800/30 backdrop-blur-sm border border-purple-600/50 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all disabled:bg-purple-900/20 disabled:cursor-not-allowed tracking-wider text-white placeholder-purple-300"
                      />
                      <button
                        type="button"
                        onClick={() => setShowClaimCode(!showClaimCode)}
                        disabled={claimLoading}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-purple-400 hover:text-purple-300 disabled:cursor-not-allowed transition-colors"
                        title={showClaimCode ? "Hide claim code" : "Show claim code"}
                      >
                        {showClaimCode ? (
                          <EyeOff className="w-5 h-5" />
                        ) : (
                          <Eye className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-purple-200 mt-1">
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
                    onClick={walletConnected ? handleClaimFunds : handleConnectWallet}
                    disabled={claimLoading || (walletConnected && claimStep !== 'form')}
                    className="w-full py-4 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-400 hover:to-blue-400 disabled:from-purple-600/50 disabled:to-blue-600/50 text-white font-semibold rounded-xl transition-all transform hover:scale-[1.02] disabled:transform-none disabled:cursor-not-allowed flex items-center justify-center space-x-2 shadow-lg"
                  >
                    {claimLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Claiming...</span>
                      </>
                    ) : (
                      <>
                        {walletConnected ? <Download className="w-5 h-5" /> : <Wallet className="w-5 h-5" />}
                        <span>{walletConnected ? 'Claim Funds' : 'Connect'}</span>
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


        {/* Refund Money Tab */}
        {activeTab === 'refund' && (
          <>
            {/* Contract Management Section */}
            <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 overflow-hidden">
              {/* Tab Navigation */}
              <div className="px-3 sm:px-6 pt-6 pb-4">
                <div className="flex gap-2 sm:gap-4 justify-center flex-wrap">
                  <button
                    onClick={() => handleTabChange('send')}
                    className={`px-4 sm:px-8 py-2 sm:py-3 rounded-xl font-medium transition-all shadow-lg whitespace-nowrap ${
                      activeTab === 'send'
                        ? 'bg-white text-purple-700 shadow-xl transform scale-105 border-2 border-cyan-400'
                        : 'bg-purple-500/20 text-white hover:bg-purple-500/30 backdrop-blur-sm border border-purple-400/30'
                    }`}
                  >
                    <div className="flex items-center space-x-1 sm:space-x-2">
                      <Send className="w-4 h-4" />
                      <span className="text-sm sm:text-base">Send</span>
                    </div>
                  </button>
                  <button
                    onClick={() => handleTabChange('claim')}
                    className={`px-4 sm:px-8 py-2 sm:py-3 rounded-xl font-medium transition-all shadow-lg whitespace-nowrap ${
                      activeTab === 'claim'
                        ? 'bg-purple-800/30 text-white shadow-xl transform scale-105 border-2 border-cyan-400 backdrop-blur-sm'
                        : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
                    }`}
                  >
                    <div className="flex items-center space-x-1 sm:space-x-2">
                      <Download className="w-4 h-4" />
                      <span className="text-sm sm:text-base">Claim</span>
                    </div>
                  </button>
                  <button
                    onClick={() => handleTabChange('refund')}
                    className={`px-4 sm:px-8 py-2 sm:py-3 rounded-xl font-medium transition-all shadow-lg whitespace-nowrap ${
                      activeTab === 'refund'
                        ? 'bg-purple-800/30 text-white shadow-xl transform scale-105 border-2 border-cyan-400 backdrop-blur-sm'
                        : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
                    }`}
                  >
                    <div className="flex items-center space-x-1 sm:space-x-2">
                      <RefreshCw className="w-4 h-4" />
                      <span className="text-sm sm:text-base">Contracts</span>
                    </div>
                  </button>
                </div>
              </div>
              <div className="bg-purple-600/20 backdrop-blur-sm px-6 py-6 border-b border-white/10">
                <h2 className="text-2xl font-bold text-white">View Contracts</h2>
              </div>
              
              <div className="p-6 space-y-6">
                {/* Load Contracts Button */}
                {!showContracts && (
                  <div className="text-center">
                    <button
                      onClick={walletConnected ? () => {
                        setShowContracts(true);
                        loadWalletContracts();
                      } : handleConnectWallet}
                      disabled={contractsLoading}
                      className="w-full py-4 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-400 hover:to-blue-400 disabled:from-purple-600/50 disabled:to-blue-600/50 text-white font-semibold rounded-xl transition-all transform hover:scale-[1.02] disabled:transform-none disabled:cursor-not-allowed flex items-center justify-center space-x-2 shadow-lg"
                    >
                      {walletConnected ? <List className="w-5 h-5" /> : <Wallet className="w-5 h-5" />}
                      <span>{walletConnected ? 'Load Contracts' : 'Connect'}</span>
                    </button>
                    <p className="text-purple-200 text-sm mt-2">
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

                {/* Contracts List - Three Categories */}
                {showContracts && !contractsLoading && !contractsError && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-white">
                        All Contracts ({contracts.length})
                      </h3>
                      <button
                        onClick={loadWalletContracts}
                        disabled={contractsLoading}
                        className="flex items-center space-x-1 px-3 py-1.5 text-sm text-purple-200 hover:text-white hover:bg-purple-700/30 rounded-lg transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>Refresh</span>
                      </button>
                    </div>

                    {/* Summary Box */}
                    {contracts.length > 0 && (
                      <div className="bg-purple-900/30 border border-purple-600/50 rounded-xl p-6">
                        <h4 className="text-lg font-semibold text-white mb-4">💰 Summary</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-blue-800/30 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-blue-300">{getTotalRefundable().toFixed(3)} ALGO</div>
                            <div className="text-sm text-blue-200">Total refundable</div>
                          </div>
                          <div className="bg-yellow-800/30 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-yellow-300">{getActiveContracts().length}</div>
                            <div className="text-sm text-yellow-200">Active contracts (pending)</div>
                          </div>
                          <div className="bg-green-800/30 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-green-300">{getTotalDeleteCount()}</div>
                            <div className="text-sm text-green-200">Available to Delete</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {contracts.length === 0 ? (
                      <div className="text-center py-8 text-purple-200">
                        <List className="w-12 h-12 mx-auto mb-3 text-purple-400" />
                        <p>No contracts found</p>
                        <p className="text-sm">Contracts you create will appear here</p>
                      </div>
                    ) : (
                      <div className="space-y-8">
                        {/* Active Contracts */}
                        {getActiveContracts().length > 0 && (
                          <div className="space-y-4">
                            <h4 className="text-lg font-semibold text-white flex items-center space-x-2">
                              <span>💸 Active Contracts ({getActiveContracts().length})</span>
                            </h4>
                            <div className="space-y-3">
                              {getActiveContracts().map((contract) => (
                                <div
                                  key={contract.applicationId}
                                  className="bg-blue-900/20 rounded-xl p-4 border border-blue-600/30"
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="font-mono text-lg font-bold text-white">
                                          💸 {contract.amount} ALGO
                                        </span>
                                        <span className="font-mono text-xs text-blue-300 bg-blue-800/30 px-2 py-1 rounded">
                                          #{contract.applicationId}
                                        </span>
                                      </div>
                                      <div className="flex items-center space-x-3">
                                        <span className="text-blue-200 text-sm">
                                          Sent {getTimeAgo(contract)} • Unclaimed
                                        </span>
                                      </div>
                                      
                                    </div>

                                    <div className="flex items-center space-x-2 ml-4">
                                      <a
                                        href={`${getNetworkConfig().explorerUrl}/application/${contract.applicationId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-800/30 rounded-lg transition-colors"
                                        title="View on Explorer"
                                      >
                                        <ExternalLink className="w-4 h-4" />
                                      </a>

                                      {(() => {
                                        const refundStatus = getRefundAvailability(contract);
                                        if (refundStatus.canRefund && contract.canRefund) {
                                          return (
                                            <button
                                              onClick={() => handleInlineRefund(contract.applicationId, contract.amount)}
                                              disabled={refundLoading}
                                              className="px-3 py-1.5 text-sm bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-600/50 text-white rounded-lg transition-colors font-medium"
                                            >
                                              {refundLoading && refundApplicationId === contract.applicationId.toString() ? (
                                                <>
                                                  <Loader2 className="w-4 h-4 animate-spin inline mr-1" />
                                                  Refunding...
                                                </>
                                              ) : (
                                                'Refund'
                                              )}
                                            </button>
                                          );
                                        } else if (!refundStatus.canRefund) {
                                          return (
                                            <button
                                              disabled
                                              className="px-3 py-1.5 text-sm bg-gray-600 text-gray-300 rounded-lg transition-colors font-medium cursor-not-allowed"
                                            >
                                              Refund in {refundStatus.timeRemaining} min
                                            </button>
                                          );
                                        }
                                        return null;
                                      })()}

                                      {contract.canDelete && (
                                        <button
                                          onClick={() => handleInlineDelete(contract.applicationId)}
                                          disabled={deleteLoading[contract.applicationId]}
                                          className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                          title="Delete contract"
                                        >
                                          {deleteLoading[contract.applicationId] ? (
                                            <>
                                              <Loader2 className="w-4 h-4 animate-spin inline mr-1" />
                                              Deleting...
                                            </>
                                          ) : (
                                            "Delete"
                                          )}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Refunded Contracts */}
                        {getRefundedContracts().length > 0 && (
                          <div className="space-y-4">
                            <h4 className="text-lg font-semibold text-white flex items-center space-x-2">
                              <span>↩️ Refunded Contracts ({getRefundedContracts().length})</span>
                            </h4>
                            <div className="space-y-3">
                              {getRefundedContracts().map((contract) => (
                                <div
                                  key={contract.applicationId}
                                  className="bg-gray-900/20 rounded-xl p-4 border border-gray-600/30"
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="font-mono text-lg font-bold text-white">
                                          ↩️ {contract.amount} ALGO refunded
                                        </span>
                                        <span className="font-mono text-xs text-gray-300 bg-gray-800/30 px-2 py-1 rounded">
                                          #{contract.applicationId}
                                        </span>
                                      </div>
                                      <div className="flex items-center space-x-3">
                                        <span className="text-gray-300 text-sm">
                                          Sent {getTimeAgo(contract)} • Refunded recently
                                        </span>
                                      </div>
                                    </div>

                                    <div className="flex items-center space-x-2 ml-4">
                                      <a
                                        href={`${getNetworkConfig().explorerUrl}/application/${contract.applicationId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-2 text-gray-400 hover:text-gray-300 hover:bg-gray-800/30 rounded-lg transition-colors"
                                        title="View on Explorer"
                                      >
                                        <ExternalLink className="w-4 h-4" />
                                      </a>

                                      {contract.canDelete && (
                                        <button
                                          onClick={() => handleInlineDelete(contract.applicationId)}
                                          disabled={deleteLoading[contract.applicationId]}
                                          className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                          title="Delete contract"
                                        >
                                          {deleteLoading[contract.applicationId] ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                          ) : (
                                            "Delete"
                                          )}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Claimed Contracts */}
                        {getClaimedContracts().length > 0 && (
                          <div className="space-y-4">
                            <h4 className="text-lg font-semibold text-white flex items-center space-x-2">
                              <span>✓ Claimed Contracts ({getClaimedContracts().length})</span>
                            </h4>
                            <div className="space-y-3">
                              {getClaimedContracts().map((contract) => (
                                <div
                                  key={contract.applicationId}
                                  className="bg-green-900/20 rounded-xl p-4 border border-green-600/30"
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="font-mono text-lg font-bold text-white">
                                          ✓ {contract.amount} ALGO claimed
                                        </span>
                                        <span className="font-mono text-xs text-green-300 bg-green-800/30 px-2 py-1 rounded">
                                          #{contract.applicationId}
                                        </span>
                                      </div>
                                      <div className="flex items-center space-x-3">
                                        <span className="text-green-300 text-sm">
                                          Sent {getTimeAgo(contract)} • Claimed recently
                                        </span>
                                      </div>
                                    </div>

                                    <div className="flex items-center space-x-2 ml-4">
                                      <a
                                        href={`${getNetworkConfig().explorerUrl}/application/${contract.applicationId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-2 text-green-400 hover:text-green-300 hover:bg-green-800/30 rounded-lg transition-colors"
                                        title="View on Explorer"
                                      >
                                        <ExternalLink className="w-4 h-4" />
                                      </a>

                                      {contract.canDelete && (
                                        <button
                                          onClick={() => handleInlineDelete(contract.applicationId)}
                                          disabled={deleteLoading[contract.applicationId]}
                                          className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                          title="Delete contract"
                                        >
                                          {deleteLoading[contract.applicationId] ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                          ) : (
                                            "Delete"
                                          )}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Refund Success Result - Removed per user request */}
            {false && refundResult && refundStep === 'complete' && (
              <div className="mb-8 bg-gradient-to-r from-purple-50 to-violet-50 border border-purple-200 rounded-2xl overflow-hidden shadow-lg">
                <div className="bg-gradient-to-r from-purple-600 to-violet-600 px-6 py-6">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-7 h-7 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white">🎉 Refund Successful! Funds returned to your wallet.</h2>
                      <p className="text-purple-100 mt-1">
                        Contract #{refundApplicationId} refunded on {getNetworkConfig().name}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="p-6 space-y-4">
                  {/* Transaction Details */}
                  <div className="bg-purple-800/20 rounded-xl p-5 border border-purple-600/30 shadow-sm">
                    <h3 className="text-lg font-semibold text-white mb-4">Refund Details</h3>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm text-purple-200 mb-1">Amount Refunded</p>
                        <p className="text-2xl font-bold text-white">Contract #{refundApplicationId}</p>
                      </div>
                      {refundResult.message && (
                        <div>
                          <p className="text-sm text-purple-200 mb-1">Message</p>
                          <p className="text-white italic">"{refundResult.message}"</p>
                        </div>
                      )}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm text-purple-200">Transaction ID</p>
                          <a
                            href={getExplorerUrl(refundResult.transactionId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center space-x-1 text-xs text-purple-300 hover:text-purple-100"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Explorer</span>
                          </a>
                        </div>
                        <p className="font-mono text-sm text-purple-100 bg-purple-900/30 px-3 py-2 rounded border border-purple-600/30 break-all">
                          {refundResult.transactionId}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      onClick={handleRefundAnother}
                      className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-400 hover:to-blue-400 text-white font-semibold rounded-xl transition-all transform hover:scale-[1.02] flex items-center justify-center space-x-2 shadow-lg"
                    >
                      <RefreshCw className="w-5 h-5" />
                      <span>Manage More Contracts</span>
                    </button>
                    <a
                      href={getExplorerUrl(refundResult.transactionId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-3 bg-purple-700/30 hover:bg-purple-600/40 text-purple-100 font-semibold rounded-xl transition-all flex items-center justify-center space-x-2"
                    >
                      <ExternalLink className="w-5 h-5" />
                      <span>View on Explorer</span>
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Refund Form - Card removed per user request */}
            {false && refundStep !== 'complete' && (
              <div data-refund-form className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 overflow-hidden">
                {/* Tab Navigation */}
                <div className="px-3 sm:px-6 pt-6 pb-4">
                  <div className="flex gap-2 sm:gap-4 justify-center flex-wrap">
                    <button
                      onClick={() => handleTabChange('send')}
                      className={`px-4 sm:px-8 py-2 sm:py-3 rounded-xl font-medium transition-all shadow-lg whitespace-nowrap ${
                        activeTab === 'send'
                          ? 'bg-purple-800/30 text-white shadow-xl transform scale-105 border-2 border-cyan-400 backdrop-blur-sm'
                          : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
                      }`}
                    >
                      <div className="flex items-center space-x-1 sm:space-x-2">
                        <Send className="w-4 h-4" />
                        <span className="text-sm sm:text-base">Send</span>
                      </div>
                    </button>
                    <button
                      onClick={() => handleTabChange('claim')}
                      className={`px-4 sm:px-8 py-2 sm:py-3 rounded-xl font-medium transition-all shadow-lg whitespace-nowrap ${
                        activeTab === 'claim'
                          ? 'bg-purple-800/30 text-white shadow-xl transform scale-105 border-2 border-cyan-400 backdrop-blur-sm'
                          : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
                      }`}
                    >
                      <div className="flex items-center space-x-1 sm:space-x-2">
                        <Download className="w-4 h-4" />
                        <span className="text-sm sm:text-base">Claim</span>
                      </div>
                    </button>
                    <button
                      onClick={() => handleTabChange('refund')}
                      className={`px-4 sm:px-8 py-2 sm:py-3 rounded-xl font-medium transition-all shadow-lg whitespace-nowrap ${
                        activeTab === 'refund'
                          ? 'bg-purple-800/30 text-white shadow-xl transform scale-105 border-2 border-cyan-400 backdrop-blur-sm'
                          : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
                      }`}
                    >
                      <div className="flex items-center space-x-1 sm:space-x-2">
                        <RefreshCw className="w-4 h-4" />
                        <span className="text-sm sm:text-base">Contracts</span>
                      </div>
                    </button>
                  </div>
                </div>
                <div className="bg-purple-600/20 backdrop-blur-sm px-6 py-6 border-b border-white/10">
                  <h2 className="text-2xl font-bold text-white">My Contracts</h2>
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

                </div>
              </div>
            )}
          </>
        )}

        {/* Network Notice */}
        <div className={`mt-6 ${isTestNet() ? 'bg-yellow-900/30 border-yellow-600/50' : 'bg-orange-900/30 border-orange-600/50'} border rounded-xl p-4 flex items-start space-x-3`}>
          <Info className={`w-5 h-5 ${isTestNet() ? 'text-yellow-300' : 'text-orange-300'} flex-shrink-0 mt-0.5`} />
          <div>
            <h3 className={`${isTestNet() ? 'text-yellow-200' : 'text-orange-200'} font-medium`}>
              {getNetworkConfig().name} Environment
            </h3>
            <p className={`${isTestNet() ? 'text-yellow-100' : 'text-orange-100'} text-sm mt-1`}>
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
          
          {/* How it Works Sidebar - Right Side */}
          <div className="lg:col-span-2">
            <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 overflow-hidden sticky top-24">
              <div className="bg-purple-600/20 backdrop-blur-sm px-6 py-6 border-b border-white/10">
                <h2 className="text-2xl font-bold text-white">How it Works</h2>
              </div>
              
              <div className="p-6 space-y-6">
                {/* Step 1 */}
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-sm">1</span>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-2">Send Funds</h3>
                    <p className="text-purple-100 text-sm">
                      Enter amount and recipient email to create a secure claim code
                    </p>
                  </div>
                </div>
                
                {/* Step 2 */}
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-sm">2</span>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-2">Email Notification</h3>
                    <p className="text-purple-100 text-sm">
                      User receives email with claim code
                    </p>
                  </div>
                </div>
                
                {/* Step 3 */}
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-sm">3</span>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-2">Claim Funds</h3>
                    <p className="text-purple-100 text-sm">
                      Use claim code to receive funds securely
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">{confirmDialog.title}</h3>
            <p className="text-gray-600 mb-6 whitespace-pre-line">{confirmDialog.message}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className={`px-4 py-2 text-white rounded-lg transition-colors font-medium ${
                  confirmDialog.type === 'refund' 
                    ? 'bg-yellow-600 hover:bg-yellow-700' 
                    : confirmDialog.type === 'no_email'
                    ? 'bg-purple-600 hover:bg-purple-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {confirmDialog.type === 'refund' ? 'Refund' : 
                 confirmDialog.type === 'no_email' ? 'Send Without Email' : 
                 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast.isVisible && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right-full duration-300">
          <div className={`p-4 rounded-lg shadow-lg text-white max-w-sm ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}>
            <div className="flex items-center space-x-2">
              {toast.type === 'success' ? (
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
              )}
              <p className="font-medium">{toast.message}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;