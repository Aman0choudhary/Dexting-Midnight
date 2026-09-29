// Headless Midnight wallet for deploy/admin scripts (Node.js).
// Adapted from midnightntwrk/example-counter (Apache-2.0), updated for
// wallet-sdk-facade 4.x.

import { Buffer } from 'node:buffer';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { unshieldedToken } from '@midnight-ntwrk/ledger-v8';
import type { MidnightProvider, WalletProvider } from '@midnight-ntwrk/midnight-js-types';
import { getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk-abstractions';
import { WalletEntrySchema, WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import {
  createKeystore,
  PublicKey,
  UnshieldedWallet,
  type UnshieldedKeystore,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import * as Rx from 'rxjs';
import { WebSocket } from 'ws';
import type { NetworkConfig } from './config.js';

// GraphQL subscriptions used by wallet sync need a global WebSocket in Node.
// @ts-expect-error assigning Node ws implementation to the global
globalThis.WebSocket = WebSocket;

export interface WalletContext {
  wallet: WalletFacade;
  shieldedSecretKeys: ledger.ZswapSecretKeys;
  dustSecretKey: ledger.DustSecretKey;
  unshieldedKeystore: UnshieldedKeystore;
}

const deriveKeys = (seedHex: string) => {
  const hd = HDWallet.fromSeed(Buffer.from(seedHex, 'hex'));
  if (hd.type !== 'seedOk') throw new Error('Invalid wallet seed');
  const derived = hd.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (derived.type !== 'keysDerived') throw new Error('Key derivation failed');
  hd.hdWallet.clear();
  return derived.keys;
};

export const buildWallet = async (config: NetworkConfig, seedHex: string): Promise<WalletContext> => {
  const keys = deriveKeys(seedHex);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], getNetworkId());

  const indexerClientConnection = { indexerHttpUrl: config.indexer, indexerWsUrl: config.indexerWS };
  const configuration = {
    networkId: getNetworkId(),
    indexerClientConnection,
    provingServerUrl: new URL(config.proofServer),
    relayURL: new URL(config.node.replace(/^http/, 'ws')),
    txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
    costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
  };

  const wallet = await WalletFacade.init({
    configuration,
    shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (cfg) => DustWallet(cfg).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);
  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
};

export const unshieldedAddress = (ctx: WalletContext): string => ctx.unshieldedKeystore.getBech32Address().toString();

export const waitForSync = (wallet: WalletFacade, timeoutMs = 10 * 60 * 1000) =>
  Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(5_000),
      Rx.filter((s) => s.isSynced),
      Rx.timeout({ each: timeoutMs }),
    ),
  ).catch(() => {
    throw new Error(
      `Wallet did not synchronize within ${Math.round(timeoutMs / 60_000)} minutes. ` +
        'Check the Preprod indexer/RPC endpoints, wallet funding, and network status.',
    );
  });

export const nightBalance = async (wallet: WalletFacade): Promise<bigint> => {
  const s = await waitForSync(wallet);
  return s.unshielded.balances[unshieldedToken().raw] ?? 0n;
};

export const waitForFunds = (wallet: WalletFacade): Promise<bigint> =>
  Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(10_000),
      Rx.filter((s) => s.isSynced),
      Rx.map((s) => s.unshielded.balances[unshieldedToken().raw] ?? 0n),
      Rx.filter((b) => b > 0n),
    ),
  );

/** NIGHT must be registered to generate DUST, the fee token. */
export const ensureDust = async (ctx: WalletContext, log: (m: string) => void): Promise<void> => {
  const state = await waitForSync(ctx.wallet);
  if (state.dust.balance(new Date()) > 0n) {
    log(`DUST available: ${state.dust.balance(new Date()).toLocaleString()}`);
    return;
  }
  const unregistered = state.unshielded.availableCoins.filter((c) => c.meta?.registeredForDustGeneration !== true);
  if (unregistered.length > 0) {
    log(`Registering ${unregistered.length} NIGHT UTXO(s) for DUST generation...`);
    const recipe = await ctx.wallet.registerNightUtxosForDustGeneration(
      unregistered,
      ctx.unshieldedKeystore.getPublicKey(),
      (payload) => ctx.unshieldedKeystore.signData(payload),
    );
    await ctx.wallet.submitTransaction(await ctx.wallet.finalizeRecipe(recipe));
  }
  log('Waiting for DUST to generate (can take a few minutes)...');
  await Rx.firstValueFrom(
    ctx.wallet.state().pipe(
      Rx.throttleTime(5_000),
      Rx.filter((s) => s.isSynced && s.dust.balance(new Date()) > 0n),
    ),
  );
  log('DUST ready.');
};

/**
 * Sign unshielded offers with the correct proof marker. Works around a
 * wallet-SDK issue where signRecipe assumes 'pre-proof' for every intent
 * (see example-counter).
 */
const signIntents = (
  tx: { intents?: Map<number, any> },
  sign: (payload: Uint8Array) => ledger.Signature,
  marker: 'proof' | 'pre-proof',
): void => {
  if (!tx.intents || tx.intents.size === 0) return;
  for (const segment of tx.intents.keys()) {
    const intent = tx.intents.get(segment);
    if (!intent) continue;
    const cloned = ledger.Intent.deserialize<ledger.SignatureEnabled, ledger.Proofish, ledger.PreBinding>(
      'signature',
      marker,
      'pre-binding',
      intent.serialize(),
    );
    const signature = sign(cloned.signatureData(segment));
    if (cloned.fallibleUnshieldedOffer) {
      const sigs = cloned.fallibleUnshieldedOffer.inputs.map(
        (_: unknown, i: number) => cloned.fallibleUnshieldedOffer!.signatures.at(i) ?? signature,
      );
      cloned.fallibleUnshieldedOffer = cloned.fallibleUnshieldedOffer.addSignatures(sigs);
    }
    if (cloned.guaranteedUnshieldedOffer) {
      const sigs = cloned.guaranteedUnshieldedOffer.inputs.map(
        (_: unknown, i: number) => cloned.guaranteedUnshieldedOffer!.signatures.at(i) ?? signature,
      );
      cloned.guaranteedUnshieldedOffer = cloned.guaranteedUnshieldedOffer.addSignatures(sigs);
    }
    tx.intents.set(segment, cloned);
  }
};

export const walletAndMidnightProvider = async (ctx: WalletContext): Promise<WalletProvider & MidnightProvider> => {
  const state = await waitForSync(ctx.wallet);
  return {
    getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () => state.shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx, ttl?) {
      const recipe = await ctx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      const sign = (payload: Uint8Array) => ctx.unshieldedKeystore.signData(payload);
      signIntents(recipe.baseTransaction, sign, 'proof');
      if (recipe.balancingTransaction) signIntents(recipe.balancingTransaction, sign, 'pre-proof');
      return ctx.wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx) => ctx.wallet.submitTransaction(tx) as any,
  };
};
