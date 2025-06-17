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
  transactionId: string;
  programHash: string;
  deploymentTransaction: string;
  notificationSent: boolean;
  notificationMethod: string;
}

interface SubmitTransactionRequest {
  signedTransaction: string;
  network: string;
}

interface SubmitTransactionResponse {
  success: boolean;
  transactionId: string;
  applicationId: number;
  contractAddress: string;
  confirmedRound: number;
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

export const checkHealth = async () => {
  try {
    const network = getCurrentNetwork();
    const response = await fetch(`/api/health?network=${network}`);
    return await response.json();
  } catch (error) {
    throw new Error('Failed to check API health');
  }
};