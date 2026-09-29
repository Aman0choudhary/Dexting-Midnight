import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

export type NetworkName = 'preview' | 'preprod';

export interface NetworkConfig {
  readonly name: NetworkName;
  readonly networkId: string;
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
  readonly faucet: string;
  readonly explorer: string;
}

const PROOF_SERVER = process.env.PROOF_SERVER_URL ?? 'http://127.0.0.1:6300';

// Endpoints: https://docs.midnight.network/relnotes/network
const NETWORKS: Record<NetworkName, NetworkConfig> = {
  preview: {
    name: 'preview',
    networkId: 'preview',
    indexer: 'https://indexer.preview.midnight.network/api/v3/graphql',
    indexerWS: 'wss://indexer.preview.midnight.network/api/v3/graphql/ws',
    node: 'https://rpc.preview.midnight.network',
    proofServer: PROOF_SERVER,
    faucet: 'https://midnight-tmnight-preview.nethermind.dev/',
    explorer: 'https://explorer.1am.xyz/?network=preview',
  },
  preprod: {
    name: 'preprod',
    networkId: 'preprod',
    indexer: 'https://indexer.preprod.midnight.network/api/v3/graphql',
    indexerWS: 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws',
    node: 'https://rpc.preprod.midnight.network',
    proofServer: PROOF_SERVER,
    faucet: 'https://midnight-tmnight-preprod.nethermind.dev/',
    explorer: 'https://explorer.1am.xyz/?network=preprod',
  },
};

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const zkConfigPath = path.join(rootDir, 'managed', 'room-membership');
export const secretsDir = path.join(rootDir, '.secrets');

export const getNetwork = (argv: string[] = process.argv): NetworkConfig => {
  const idx = argv.indexOf('--network');
  const name = (idx >= 0 ? argv[idx + 1] : process.env.MIDNIGHT_NETWORK ?? 'preprod') as NetworkName;
  const config = NETWORKS[name];
  if (!config) throw new Error(`Unknown network "${name}". Use --network preview|preprod`);
  setNetworkId(config.networkId);
  return config;
};

export const getArg = (flag: string, argv: string[] = process.argv): string | undefined => {
  const idx = argv.indexOf(flag);
  return idx >= 0 ? argv[idx + 1] : undefined;
};
