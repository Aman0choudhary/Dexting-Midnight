// End-to-end check against a live deployment:
// admin enrolls a member commitment, then the member joins anonymously.
//
//   npm run demo:join -- --network preprod [--member alice]
//
// For Level 1 the admin wallet also submits the member's join tx (a single
// funded wallet). The member's credential still stays private: only the
// commitment (enroll) and the nullifier (join) ever reach the chain.

import fs from 'node:fs';
import path from 'node:path';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { getArg, getNetwork, rootDir } from './config.js';
import { buildWallet, ensureDust, waitForSync } from './wallet.js';
import { buildProviders, compiledRoomContract, ROOM_PRIVATE_STATE_ID } from './providers.js';
import { namedSecret, walletSeed } from './secrets.js';
import { ledger, pureCircuits } from '../managed/room-membership/contract/index.js';

const log = (m: string) => console.log(`  ${m}`);

const main = async () => {
  const config = getNetwork();
  const memberName = getArg('--member') ?? 'alice';
  const deployment = JSON.parse(fs.readFileSync(path.join(rootDir, 'deployments', `${config.name}.json`), 'utf8'));
  const contractAddress: string = getArg('--address') ?? deployment.contractAddress;

  const ctx = await buildWallet(config, walletSeed(config.name));
  log('Syncing wallet...');
  await waitForSync(ctx.wallet);
  await ensureDust(ctx, log);

  const providers = await buildProviders(ctx, config, `room-membership-${config.name}-admin`);
  const adminSecret = namedSecret(`${config.name}-admin`);
  const memberSecret = namedSecret(`${config.name}-member-${memberName}`);

  const room = await findDeployedContract(providers as any, {
    contractAddress,
    compiledContract: compiledRoomContract,
    privateStateId: ROOM_PRIVATE_STATE_ID,
    initialPrivateState: { adminSecret, memberSecret },
  } as any);

  const readLedger = async () => {
    const state = await providers.publicDataProvider.queryContractState(contractAddress);
    if (!state) throw new Error('Contract state not found');
    return ledger(state.data);
  };

  const before = await readLedger();
  const commitment = pureCircuits.memberCommitment(before.roomId, memberSecret);

  if (before.members.findPathForLeaf(commitment) === undefined) {
    log(`Admin enrolling member "${memberName}" (commitment only)...`);
    const tx = await (room as any).callTx.enrollMember(commitment);
    log(`enrollMember tx ${tx.public.txId} in block ${tx.public.blockHeight}`);
  } else {
    log(`Member "${memberName}" already enrolled.`);
  }

  log('Member proving membership anonymously (joinRoom)...');
  await providers.privateStateProvider.set(ROOM_PRIVATE_STATE_ID, { adminSecret, memberSecret });
  const joinTx = await (room as any).callTx.joinRoom();
  log(`joinRoom tx ${joinTx.public.txId} in block ${joinTx.public.blockHeight}`);

  const after = await readLedger();
  console.log('\n  ✓ Verified member — identity not revealed');
  console.log(`    members enrolled: ${after.memberCount}   verified joins: ${after.verifiedJoins}\n`);

  await ctx.wallet.stop();
  process.exit(0);
};

main().catch((e) => {
  console.error('\n✗ Failed:', e?.message ?? e);
  process.exit(1);
});
