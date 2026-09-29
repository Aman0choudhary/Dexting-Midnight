// Room admin: enroll a member using the invite code they sent you.
//
//   npm run enroll -- --network preprod --code <64-hex invite code>
//
// The invite code is the member's commitment (a hash). You never see — and
// can't recover — their credential.

import fs from 'node:fs';
import path from 'node:path';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { getArg, getNetwork, rootDir } from './config.js';
import { buildWallet, ensureDust, waitForSync } from './wallet.js';
import { buildProviders, compiledRoomContract, ROOM_PRIVATE_STATE_ID } from './providers.js';
import { namedSecret, walletSeed } from './secrets.js';

const main = async () => {
  const config = getNetwork();
  const code = (getArg('--code') ?? '').trim().replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(code)) throw new Error('--code must be the 64-character hex invite code');

  const deployment = JSON.parse(fs.readFileSync(path.join(rootDir, 'deployments', `${config.name}.json`), 'utf8'));
  const contractAddress: string = getArg('--address') ?? deployment.contractAddress;

  const ctx = await buildWallet(config, walletSeed(config.name));
  console.log('  Syncing wallet...');
  await waitForSync(ctx.wallet);
  await ensureDust(ctx, (m) => console.log(`  ${m}`));

  const providers = await buildProviders(ctx, config, `room-membership-${config.name}-admin`);
  const room = await findDeployedContract(providers as any, {
    contractAddress,
    compiledContract: compiledRoomContract,
    privateStateId: ROOM_PRIVATE_STATE_ID,
    initialPrivateState: { adminSecret: namedSecret(`${config.name}-admin`), memberSecret: new Uint8Array(32) },
  } as any);

  console.log('  Enrolling member commitment...');
  const tx = await (room as any).callTx.enrollMember(Uint8Array.from(Buffer.from(code, 'hex')));
  console.log(`  ✓ Enrolled. tx ${tx.public.txId} (block ${tx.public.blockHeight})`);

  await ctx.wallet.stop();
  process.exit(0);
};

main().catch((e) => {
  console.error('\n✗ Enroll failed:', e?.message ?? e);
  process.exit(1);
});
