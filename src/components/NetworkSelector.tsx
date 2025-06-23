import React from 'react';
import { Globe, AlertTriangle } from 'lucide-react';
import { NetworkType } from '../types/network';
import { getCurrentNetwork, switchNetwork, isMainNet } from '../services/networkService';

interface NetworkSelectorProps {
  onNetworkChange?: (network: NetworkType) => void;
}

const NetworkSelector: React.FC<NetworkSelectorProps> = ({ onNetworkChange }) => {
  const currentNetwork = getCurrentNetwork();

  const handleNetworkChange = (network: NetworkType) => {
    if (network !== currentNetwork) {
      switchNetwork(network);
      onNetworkChange?.(network);
    }
  };

  return (
    <div className="flex items-center space-x-1 sm:space-x-2">
      <Globe className="w-4 h-4 text-gray-500 hidden sm:block" />
      <select
        value={currentNetwork}
        onChange={(e) => handleNetworkChange(e.target.value as NetworkType)}
        className="text-xs sm:text-sm border border-gray-300 rounded-lg px-2 sm:px-3 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        <option value="testnet">TestNet</option>
        <option value="mainnet">MainNet</option>
      </select>
      
      {isMainNet() && (
        <div className="flex items-center space-x-1 text-orange-600">
          <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4" />
          <span className="text-xs font-medium hidden sm:inline">Live Network</span>
          <span className="text-xs font-medium sm:hidden">Live</span>
        </div>
      )}
    </div>
  );
};

export default NetworkSelector;