// Local-only secret storage for deploy/admin scripts. `.secrets/` is
// gitignored — nothing in here must ever be committed.

import fs from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { generateRandomSeed } from '@midnight-ntwrk/wallet-sdk-hd';
import { secretsDir } from './config.js';
import { randomSecret } from '../contracts/witnesses.js';

const file = (name: string) => path.join(secretsDir, `${name}.json`);

const load = <T>(name: string): T | undefined => {
  const f = file(name);
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as T) : undefined;
};

const save = (name: string, value: unknown) => {
  fs.mkdirSync(secretsDir, { recursive: true });
  fs.writeFileSync(file(name), JSON.stringify(value, null, 2), { mode: 0o600 });
};

/** Wallet seed for the deployer/admin on a network (created on first use). */
export const walletSeed = (network: string): string => {
  const existing = process.env.WALLET_SEED ?? load<{ seed: string }>(`${network}-wallet`)?.seed;
  if (existing) return existing;
  const seed = Buffer.from(generateRandomSeed()).toString('hex');
  save(`${network}-wallet`, { seed });
  return seed;
};

/** A named 32-byte secret (admin key or a member credential). */
export const namedSecret = (name: string): Uint8Array => {
  const existing = load<{ hex: string }>(name);
  if (existing) return Uint8Array.from(Buffer.from(existing.hex, 'hex'));
  const secret = randomSecret();
  save(name, { hex: Buffer.from(secret).toString('hex') });
  return secret;
};
