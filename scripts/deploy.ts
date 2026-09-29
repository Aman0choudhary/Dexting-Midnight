// Deploy room-membership.compact to Preview or Preprod.
//
//   npm run deploy -- --network preprod [--room campus-batch-2026]
//
// Requires: compiled contract in managed/, proof server on :6300,
// and a funded wallet (the script prints the address to fund).

import fs from 'node:fs';
import path from 'node:path';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { getArg, getNetwork, rootDir } from './config.js';
import { buildWallet, ensureDust, nightBalance, unshieldedAddress, waitForFunds } from './wallet.js';
import { buildProviders, compiledRoomContract, ROOM_PRIVATE_STATE_ID } from './providers.js';
import { namedSecret, walletSeed } from './secrets.js';
import { roomIdFromName } from '../contracts/witnesses.js';

const log = (m: string) => console.log(`  ${m}`);

const main = async () => {
  const config = getNetwork();
  const roomName = getArg('--room') ?? 'campus-batch-2026';
  console.log(`\nDeploying room-membership to ${config.name} (room "${roomName}")\n`);

  const ctx = await buildWallet(config, walletSeed(config.name));
  const address = unshieldedAddress(ctx);
  console.log('──────────────────────────────────────────────────────────────');
  console.log(`  Deployer wallet (unshielded): ${address}`);
  console.log(`  Fund it with tNIGHT at: ${config.faucet}`);
  console.log('──────────────────────────────────────────────────────────────');

  log('Syncing wallet...');
  let balance = await nightBalance(ctx.wallet);
  if (balance === 0n) {
    log('Balance is 0 — waiting for faucet funds...');
    balance = await waitForFunds(ctx.wallet);
  }
  log(`Balance: ${balance.toLocaleString()} tNIGHT`);
  await ensureDust(ctx, log);

  const providers = await buildProviders(ctx, config, `room-membership-${config.name}-admin`);
  const adminSecret = namedSecret(`${config.name}-admin`);

  log('Generating deploy proof and submitting (this can take a minute)...');
  const deployed = await deployContract(providers as any, {
    compiledContract: compiledRoomContract,
    privateStateId: ROOM_PRIVATE_STATE_ID,
    initialPrivateState: { adminSecret, memberSecret: new Uint8Array(32) },
    args: [roomIdFromName(roomName)],
  } as any);

  const contractAddress = deployed.deployTxData.public.contractAddress;
  const record = {
    network: config.name,
    contractAddress,
    roomName,
    txId: deployed.deployTxData.public.txId,
    blockHeight: deployed.deployTxData.public.blockHeight,
    deployedAt: new Date().toISOString(),
  };
  const outDir = path.join(rootDir, 'deployments');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${config.name}.json`), JSON.stringify(record, null, 2) + '\n');

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`  ✓ Deployed to ${config.name}`);
  console.log(`  Contract address: ${contractAddress}`);
  console.log(`  Saved to deployments/${config.name}.json`);
  console.log('══════════════════════════════════════════════════════════════\n');

  await ctx.wallet.stop();
  process.exit(0);
};

main().catch((e) => {
  console.error('\n✗ Deploy failed:', e);
  process.exit(1);
});
