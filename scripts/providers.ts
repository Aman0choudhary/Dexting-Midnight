import { Buffer } from 'node:buffer';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { Contract } from '../managed/room-membership/contract/index.js';
import { type RoomPrivateState, witnesses } from '../contracts/witnesses.js';
import { type NetworkConfig, zkConfigPath } from './config.js';
import { type WalletContext, walletAndMidnightProvider } from './wallet.js';

export const ROOM_PRIVATE_STATE_ID = 'roomPrivateState';

export const compiledRoomContract = CompiledContract.make('room-membership', Contract<RoomPrivateState>).pipe(
  CompiledContract.withWitnesses(witnesses as any),
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);

export const buildProviders = async (ctx: WalletContext, config: NetworkConfig, storeName: string) => {
  const wm = await walletAndMidnightProvider(ctx);
  const zkConfigProvider = new NodeZkConfigProvider<'enrollMember' | 'joinRoom'>(zkConfigPath);
  const accountId = wm.getCoinPublicKey();
  // Password is derived per account; private state is encrypted at rest.
  const password = `${Buffer.from(accountId, 'hex').toString('base64')}!Aa1`;
  return {
    privateStateProvider: levelPrivateStateProvider<typeof ROOM_PRIVATE_STATE_ID, RoomPrivateState>({
      privateStateStoreName: storeName,
      accountId,
      privateStoragePasswordProvider: () => password,
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
    walletProvider: wm,
    midnightProvider: wm,
  };
};
