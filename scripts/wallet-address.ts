import fs from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { generateRandomSeed, HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { createKeystore } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { getArg, rootDir, secretsDir } from './config.js';

const network = (getArg('--network') ?? 'preprod') as 'preview' | 'preprod';
if (network !== 'preview' && network !== 'preprod') {
  throw new Error('Use --network preview or --network preprod');
}

setNetworkId(network);
fs.mkdirSync(secretsDir, { recursive: true });

const secretFile = path.join(secretsDir, `${network}-wallet.json`);
let seed = process.env.WALLET_SEED;
let generated = false;

if (!seed) {
  if (fs.existsSync(secretFile)) {
    seed = (JSON.parse(fs.readFileSync(secretFile, 'utf8')) as { seed: string }).seed;
  } else {
    seed = Buffer.from(generateRandomSeed()).toString('hex');
    fs.writeFileSync(secretFile, JSON.stringify({ seed }, null, 2) + '\n', { mode: 0o600 });
    generated = true;
  }
}

if (!/^[0-9a-f]{64}$/i.test(seed)) throw new Error('WALLET_SEED must be 32 bytes encoded as 64 hex characters');

const hd = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
if (hd.type !== 'seedOk') throw new Error('Invalid wallet seed');
const derived = hd.hdWallet
  .selectAccount(0)
  .selectRoles([Roles.NightExternal])
  .deriveKeysAt(0);
if (derived.type !== 'keysDerived') throw new Error('Key derivation failed');
const address = createKeystore(derived.keys[Roles.NightExternal], network).getBech32Address().toString();
hd.hdWallet.clear();

console.log(`Network: ${network}`);
console.log(`Funding address: ${address}`);
if (generated) {
  console.log(`Seed saved locally to ${path.relative(rootDir, secretFile)}`);
  console.log('Copy only the seed value from that file into the GitHub Actions secret PREPROD_WALLET_SEED.');
} else if (process.env.WALLET_SEED) {
  console.log('Address derived from WALLET_SEED; the seed was not written to disk.');
} else {
  console.log(`Using existing seed at ${path.relative(rootDir, secretFile)}`);
}
