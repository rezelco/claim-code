import { NetworkType, NETWORK_CONFIGS } from '../types/network';

class NetworkService {
  private currentNetwork: NetworkType = 'testnet';

  constructor() {
    this.initializeFromStorage();
  }

  private initializeFromStorage() {
    const stored = localStorage.getItem('selected_network') as NetworkType;
    if (stored && (stored === 'testnet' || stored === 'mainnet')) {
      this.currentNetwork = stored;
    }
  }

  getCurrentNetwork(): NetworkType {
    return this.currentNetwork;
  }

  getNetworkConfig(network?: NetworkType) {
    return NETWORK_CONFIGS[network || this.currentNetwork];
  }

  switchNetwork(network: NetworkType) {
    this.currentNetwork = network;
    localStorage.setItem('selected_network', network);
    
    // Trigger a custom event to notify components of network change
    window.dispatchEvent(new CustomEvent('networkChanged', { 
      detail: { network, config: this.getNetworkConfig() } 
    }));
  }

  isTestNet(): boolean {
    return this.currentNetwork === 'testnet';
  }

  isMainNet(): boolean {
    return this.currentNetwork === 'mainnet';
  }
}

const networkService = new NetworkService();

export const getCurrentNetwork = () => networkService.getCurrentNetwork();
export const getNetworkConfig = (network?: NetworkType) => networkService.getNetworkConfig(network);
export const switchNetwork = (network: NetworkType) => networkService.switchNetwork(network);
export const isTestNet = () => networkService.isTestNet();
export const isMainNet = () => networkService.isMainNet();

export default networkService;