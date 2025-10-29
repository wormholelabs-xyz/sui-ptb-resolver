export type NetworkName = 'mainnet' | 'testnet';

export interface NetworkConfig {
  name: NetworkName;
  rpcUrl: string;
}

export type NetworkConfigs = Record<NetworkName, NetworkConfig>;
