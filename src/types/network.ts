export type NetworkName = 'mainnet' | 'testnet';

export interface NetworkConfig {
  name: NetworkName;
  /** gRPC(-web) base URL used by the resolver (SuiGrpcClient). */
  grpcUrl: string;
  /** JSON-RPC URL. Retained for the differential test (JSON-RPC vs gRPC parity). */
  rpcUrl: string;
}

export type NetworkConfigs = Record<NetworkName, NetworkConfig>;
