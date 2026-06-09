import type { NetworkConfig, NetworkConfigs, NetworkName } from '../types/index.js';

export const NETWORKS: NetworkConfigs = {
  mainnet: {
    name: 'mainnet',
    // Public Sui fullnode serves gRPC(-web) on the same host. For production,
    // prefer a dedicated gRPC provider — public nodes may rate-limit gRPC.
    grpcUrl: 'https://fullnode.mainnet.sui.io:443',
    rpcUrl: 'https://fullnode.mainnet.sui.io:443',
  },

  testnet: {
    name: 'testnet',
    grpcUrl: 'https://fullnode.testnet.sui.io:443',
    rpcUrl: 'https://fullnode.testnet.sui.io:443',
  },
};

export function getNetworkConfig(network: NetworkName | string): NetworkConfig {
  const config = NETWORKS[network as NetworkName];

  if (!config) {
    throw new Error(
      `Unknown network: ${network}. Available networks: ${Object.keys(NETWORKS).join(', ')}`
    );
  }

  return config;
}

export function isValidNetwork(network: string): network is NetworkName {
  return network in NETWORKS;
}
