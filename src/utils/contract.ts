// Browser-side wiring: wallet (DApp Connector API) -> midnight-js providers ->
// room-membership circuit calls. Based on the 1AM/Lace session pattern in
// .opencode/skills/1am-wallet/references/midnight-session.md.

import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { ContractState } from '@midnight-ntwrk/compact-runtime';
import { Transaction, type FinalizedTransaction } from '@midnight-ntwrk/ledger-v8';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  createProofProvider,
  type MidnightProvider,
  type PrivateStateProvider,
  type WalletProvider,
} from '@midnight-ntwrk/midnight-js-types';
import { Contract, ledger, pureCircuits, type Ledger } from '../../managed/room-membership/contract/index.js';
import { type RoomPrivateState, emptyPrivateState, randomSecret, witnesses } from '../../contracts/witnesses.js';
import { FALLBACK_INDEXER, ZK_ASSETS_PATH } from './config.js';

export const ROOM_PRIVATE_STATE_ID = 'roomPrivateState';

const compiledRoomContract = CompiledContract.make('room-membership', Contract<RoomPrivateState>).pipe(
  CompiledContract.withWitnesses(witnesses as any),
  CompiledContract.withCompiledFileAssets(ZK_ASSETS_PATH),
);

// ---------------------------------------------------------------------------
// hex helpers
// ---------------------------------------------------------------------------

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export const fromHex = (hex: string): Uint8Array => {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (h.length % 2 !== 0 || /[^0-9a-f]/i.test(h)) throw new Error('Invalid hex');
  return Uint8Array.from(h.match(/.{2}/g) ?? [], (b) => parseInt(b, 16));
};

// ---------------------------------------------------------------------------
// Member credential — stored ONLY in this browser, never rendered in the UI.
// ---------------------------------------------------------------------------

const credentialKey = (contractAddress: string) => `dexting:credential:${contractAddress}`;

export const loadOrCreateCredential = (contractAddress: string): Uint8Array => {
  const stored = localStorage.getItem(credentialKey(contractAddress));
  if (stored) return fromHex(stored);
  const secret = randomSecret();
  localStorage.setItem(credentialKey(contractAddress), toHex(secret));
  return secret;
};

/** The shareable invite code: a hash of the credential, safe to send to the room admin. */
export const commitmentFor = (roomId: Uint8Array, credential: Uint8Array): string =>
  toHex(pureCircuits.memberCommitment(roomId, credential));

export const nullifierFor = (roomId: Uint8Array, credential: Uint8Array): Uint8Array =>
  pureCircuits.joinNullifier(roomId, credential);

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

const inMemoryPrivateStateProvider = (): PrivateStateProvider<string, RoomPrivateState> => {
  let scope = '';
  const states = new Map<string, RoomPrivateState>();
  const keys = new Map<string, any>();
  const k = (id: string) => `${scope}:${id}`;
  const unsupported = async (): Promise<never> => {
    throw new Error('Not supported in browser session');
  };
  return {
    setContractAddress: (address) => {
      scope = address;
    },
    set: async (id, state) => void states.set(k(id), state),
    get: async (id) => states.get(k(id)) ?? null,
    remove: async (id) => void states.delete(k(id)),
    clear: async () => states.clear(),
    setSigningKey: async (address, key) => void keys.set(address, key),
    getSigningKey: async (address) => keys.get(address) ?? null,
    removeSigningKey: async (address) => void keys.delete(address),
    clearSigningKeys: async () => keys.clear(),
    exportPrivateStates: unsupported,
    importPrivateStates: unsupported,
    exportSigningKeys: unsupported,
    importSigningKeys: unsupported,
  } as PrivateStateProvider<string, RoomPrivateState>;
};

/** Reads the latest contract state with an explicit query (hosted indexers reject the SDK's null-offset path). */
export const queryLatestState = async (indexerUrl: string, contractAddress: string): Promise<ContractState | null> => {
  const res = await fetch(indexerUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: 'query ($address: HexEncoded!) { contractAction(address: $address) { state } }',
      variables: { address: contractAddress },
    }),
  });
  if (!res.ok) throw new Error(`Indexer HTTP ${res.status}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors.map((e: { message: string }) => e.message).join('; '));
  const state = body.data?.contractAction?.state;
  return state ? ContractState.deserialize(fromHex(state)) : null;
};

export interface RoomSession {
  readonly networkId: string;
  readonly indexerUrl: string;
  readonly providers: any;
}

export const createRoomSession = async (api: ConnectedAPI): Promise<RoomSession> => {
  const config = await api.getConfiguration();
  setNetworkId(config.networkId);
  const indexerUrl = config.indexerUri || FALLBACK_INDEXER[config.networkId]?.http;
  const indexerWs = config.indexerWsUri || FALLBACK_INDEXER[config.networkId]?.ws;
  if (!indexerUrl || !indexerWs) throw new Error(`No indexer configured for network "${config.networkId}"`);

  const shielded = await api.getShieldedAddresses();
  const zkConfigProvider = new FetchZkConfigProvider(
    new URL(ZK_ASSETS_PATH, window.location.origin).toString(),
    window.fetch.bind(window),
  );

  // The wallet generates the ZK proof locally, using keys fetched from this site.
  const provingProvider = await api.getProvingProvider(zkConfigProvider as any);
  const proofProvider = createProofProvider(provingProvider as any);

  const walletProvider: WalletProvider = {
    getCoinPublicKey: () => shielded.shieldedCoinPublicKey as any,
    getEncryptionPublicKey: () => shielded.shieldedEncryptionPublicKey as any,
    balanceTx: async (tx): Promise<FinalizedTransaction> => {
      const balanced = await api.balanceUnsealedTransaction(toHex(tx.serialize()));
      if (!balanced?.tx) throw new Error('Wallet returned an empty balanced transaction');
      return Transaction.deserialize('signature', 'proof', 'binding', fromHex(balanced.tx)) as FinalizedTransaction;
    },
  };

  const midnightProvider: MidnightProvider = {
    submitTx: async (tx) => {
      await api.submitTransaction(toHex(tx.serialize()));
      return tx.identifiers()[0] as any;
    },
  };

  const basePublic = indexerPublicDataProvider(indexerUrl, indexerWs);
  const publicDataProvider = {
    ...basePublic,
    queryContractState: (address: string, cfg?: any) =>
      cfg ? basePublic.queryContractState(address, cfg) : queryLatestState(indexerUrl, address),
  };

  return {
    networkId: config.networkId,
    indexerUrl,
    providers: {
      privateStateProvider: inMemoryPrivateStateProvider(),
      publicDataProvider,
      zkConfigProvider,
      proofProvider,
      walletProvider,
      midnightProvider,
    },
  };
};

// ---------------------------------------------------------------------------
// Room reads + the anonymous join
// ---------------------------------------------------------------------------

export const readRoom = async (indexerUrl: string, contractAddress: string): Promise<Ledger> => {
  const state = await queryLatestState(indexerUrl, contractAddress);
  if (!state) throw new Error('Room contract not found on this network');
  return ledger(state.data);
};

export type MembershipStatus = 'not-enrolled' | 'enrolled' | 'joined';

export const membershipStatus = (room: Ledger, credential: Uint8Array): MembershipStatus => {
  if (room.nullifiers.member(nullifierFor(room.roomId, credential))) return 'joined';
  const leaf = pureCircuits.memberCommitment(room.roomId, credential);
  return room.members.findPathForLeaf(leaf) === undefined ? 'not-enrolled' : 'enrolled';
};

/**
 * Generates the membership proof locally and submits it. The credential is
 * passed as a private witness — only the proof and the nullifier leave the
 * browser.
 */
export const joinRoom = async (
  session: RoomSession,
  contractAddress: string,
  credential: Uint8Array,
): Promise<{ txId: string; blockHeight?: number }> => {
  const privateState: RoomPrivateState = { ...emptyPrivateState(), memberSecret: credential };
  const room = await findDeployedContract(session.providers, {
    contractAddress,
    compiledContract: compiledRoomContract,
    privateStateId: ROOM_PRIVATE_STATE_ID,
    initialPrivateState: privateState,
  } as any);
  const result = await (room as any).callTx.joinRoom();
  return { txId: result.public.txId, blockHeight: result.public.blockHeight };
};
