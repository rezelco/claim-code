import algosdk from 'algosdk';

// Network configurations
export const NETWORK_CONFIGS = {
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
export function createAlgodClient(network = 'mainnet') {
  const config = NETWORK_CONFIGS[network];
  if (!config) {
    throw new Error(`Unsupported network: ${network}`);
  }
  
  return new algosdk.Algodv2(config.algodToken, config.algodServer, config.algodPort);
}

// Validate Algorand address format
export function validateAlgorandAddress(address) {
  if (!address || typeof address !== 'string') {
    throw new Error('Address must be a valid string');
  }
  
  const trimmedAddress = address.trim();
  if (!trimmedAddress) {
    throw new Error('Address cannot be empty');
  }
  
  // Use algosdk's built-in validation
  if (!algosdk.isValidAddress(trimmedAddress)) {
    throw new Error('Invalid Algorand address format');
  }
  
  // Additional validation by attempting to decode the address
  try {
    algosdk.decodeAddress(trimmedAddress);
  } catch (decodeError) {
    throw new Error(`Address validation failed: ${decodeError.message}`);
  }
  
  return trimmedAddress;
}