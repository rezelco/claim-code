export type NetworkType = 'testnet' | 'mainnet';

export interface NetworkConfig {
  name: string;
  chainId: number;
  algodServer: string;
  algodPort: number;
  algodToken: string;
  explorerUrl: string;
  dispenserUrl?: string;
}

export const NETWORK_CONFIGS: Record<NetworkType, NetworkConfig> = {
  testnet: {
    name: 'TestNet',
    chainId: 416002,
    algodServer: 'https://testnet-api.4160.nodely.dev',
    algodPort: 443,
    algodToken: '',
    explorerUrl: 'https://testnet.explorer.perawallet.app',
    dispenserUrl: 'https://bank.testnet.algorand.network/'
  },
  mainnet: {
    name: 'MainNet',
    chainId: 416001,
    algodServer: 'https://mainnet-api.4160.nodely.dev',
    algodPort: 443,
    algodToken: '',
    explorerUrl: 'https://explorer.perawallet.app'
  }
};