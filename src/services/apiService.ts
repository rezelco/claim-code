import algosdk from 'algosdk';
import { getCurrentNetwork } from './networkService';

interface CreateClaimRequest {
  amount: number;
  recipient: string;
  message: string;
  senderAddress: string;
  network: string;
}

interface CreateClaimResponse {
  claimCode: string;
  transactionIds?: {
    app: string;
    funding: string;
  };
  transactionId?: string; // Legacy single transaction ID
  programHash: string;
  deploymentTransaction?: string; // Legacy single transaction
  deploymentTransactions?: string[]; // Atomic group transactions
  isAtomic?: boolean;
  claimDetails: {
    recipient: string;
    amount: number;
    message: string;
    network: string;
  };
}

interface SubmitTransactionRequest {
  signedTransaction?: string; // Legacy single transaction
  signedTransactions?: string[]; // Atomic group transactions
  network: string;
  claimDetails?: {
    recipient: string;
    amount: number;
    message: string;
    claimCode: string;
  };
}

interface SubmitTransactionResponse {
  success: boolean;
  transactionId: string;
  applicationId: number;
  contractAddress: string;
  confirmedRound: number;
  notificationSent?: boolean;
  notificationMethod?: string;
}

interface ClaimFundsRequest {
  claimCode: string;
  walletAddress: string;
  network: string;
}

interface ClaimFundsResponse {
  success: boolean;
  transactionId?: string;
  amount: number;
  message?: string;
  requiresSigning?: boolean;
  transactionToSign?: string;
  claimCode?: string;
}

interface SubmitClaimRequest {
  signedTransaction: string;
  claimCode: string;
  network: string;
}

interface SubmitClaimResponse {
  success: boolean;
  transactionId: string;
  amount: number;
  confirmedRound: number;
  message?: string;
}

export const createClaim = async (request: Omit<CreateClaimRequest, 'network'>): Promise<CreateClaimResponse> => {
  try {
    const network = getCurrentNetwork();
    const response = await fetch('/api/create-claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...request, network }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create claim');
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error occurred while creating claim');
  }
};

export const submitTransaction = async (request: Omit<SubmitTransactionRequest, 'network'>): Promise<SubmitTransactionResponse> => {
  try {
    const network = getCurrentNetwork();
    const response = await fetch('/api/submit-transaction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...request, network }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to submit transaction');
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error occurred while submitting transaction');
  }
};

export const claimFunds = async (request: Omit<ClaimFundsRequest, 'network'>): Promise<ClaimFundsResponse> => {
  try {
    const network = getCurrentNetwork();
    const response = await fetch('/api/claim-funds', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...request, network }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to claim funds');
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error occurred while claiming funds');
  }
};

export const submitClaim = async (request: Omit<SubmitClaimRequest, 'network'>): Promise<SubmitClaimResponse> => {
  try {
    const network = getCurrentNetwork();
    const response = await fetch('/api/submit-claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...request, network }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to submit claim');
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error occurred while submitting claim');
  }
};

interface FundContractRequest {
  applicationId: number;
  amount: number;
  senderAddress: string;
  network: string;
}

interface FundContractResponse {
  transactionToSign: string;
  transactionId: string;
  contractAddress: string;
}

export const fundContract = async (request: Omit<FundContractRequest, 'network'>): Promise<FundContractResponse> => {
  try {
    const network = getCurrentNetwork();
    const response = await fetch('/api/fund-contract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...request, network }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create funding transaction');
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error occurred while creating funding transaction');
  }
};

interface SubmitFundingTransactionRequest {
  signedTransaction: string;
  network: string;
  claimCode?: string;
}

interface SubmitFundingTransactionResponse {
  success: boolean;
  transactionId: string;
  confirmedRound: number;
}

export const submitFundingTransaction = async (request: Omit<SubmitFundingTransactionRequest, 'network'>): Promise<SubmitFundingTransactionResponse> => {
  try {
    const network = getCurrentNetwork();
    const response = await fetch('/api/submit-funding-transaction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...request, network }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to submit funding transaction');
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error occurred while submitting funding transaction');
  }
};

export const checkHealth = async () => {
  try {
    const network = getCurrentNetwork();
    const response = await fetch(`/api/health?network=${network}`);
    return await response.json();
  } catch (error) {
    throw new Error('Failed to check API health');
  }
};