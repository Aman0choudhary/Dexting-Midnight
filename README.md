# Verified Anonymous Rooms
> Prove you belong in a group — without ever revealing who you are.

[![Build, Test, and Package](https://github.com/Aman0choudhary/Dexting-Midnight/actions/workflows/ci.yml/badge.svg)](https://github.com/Aman0choudhary/Dexting-Midnight/actions/workflows/ci.yml)

## Live Demo
[PASTE LIVE URL AFTER DEPLOYING FRONTEND]

## Contract Address
| Network | Address |
|----------|----------------------------------|
| Preprod | Pending funded deployment |
| Preview | Pending funded deployment |

## What This Does
Every room (a college batch, a club, a community) has a committed list of
eligible members, stored on-chain as a Merkle tree of **hashed commitments**
— never names, emails or IDs.

To enter, a member generates a zero-knowledge proof on their own device that
says: *"my secret credential hashes to one of the leaves in this room's
tree."* The chain verifies the proof and records the join. It never learns
**which** leaf — so nobody, including the app operator, can tell which member
just joined.

A one-time **nullifier** stops the same credential from joining twice. It uses
a different hash domain than the member commitment, so it cannot be linked
back to any enrolled member.

**Flow:**
1. Member opens the app and connects Lace. The app creates a random credential
   that stays in the member's browser, and shows an **invite code** (the hash
   of that credential).
2. Member sends the invite code to the room admin, who enrolls it on-chain
   (`npm run enroll`). The admin only ever sees the hash.
3. Member clicks **Join Room**. Their wallet proves membership locally and
   submits the proof → **✓ Verified member — identity not revealed**.

## Privacy Model
| Data | Where it lives | Who can see it |
|------|----------------|----------------|
| Room ID | Public ledger | Everyone |
| Member-set commitment (Merkle tree of hashed leaves) | Public ledger | Everyone |
| Member count / verified join count | Public ledger | Everyone |
| Join nullifiers (unlinkable to leaves) | Public ledger | Everyone |
| Individual membership credential (`memberSecret`) | Private witness, member's browser | **No one** |
| Merkle path / leaf position | Private witness, used inside the proof | **No one** |

- **PUBLIC:** room ID, member-set commitment
- **PRIVATE:** individual membership credential
- **PROVED without revealing:** that the caller is a legitimate member of the
  room, without exposing which member

Circuits in [`contracts/room-membership.compact`](contracts/room-membership.compact):

| Circuit | Who calls it | What it does |
|---------|--------------|--------------|
| `enrollMember(commitment)` | Room admin | Adds a hashed member commitment to the tree |
| `joinRoom()` | Any member | Proves membership anonymously, records a nullifier |

## Privacy Claim
> The membership credential never leaves the member's device, and no on-chain
> data or UI element reveals which enrolled member performed a join.

What an observer *can* see: that a join happened, when, and from which wallet
paid the fee. Using a fresh wallet per room avoids linking joins to a
long-lived wallet address.

## Tech Stack
Midnight network, Compact language, Midnight.js 4.1, DApp Connector API 4
(Lace), React 19 + Vite, TypeScript, Vitest, Node.js v22, Docker

## Prerequisites
- **Node.js v22+**
- **Lace wallet** browser extension (Midnight), switched to **Preprod**, with tDUST
- **GitHub account** — GitHub Actions compiles the Compact contract on Ubuntu
- **Docker Desktop** — only needed later for the proof server used by deploy/admin scripts

## Setup And GitHub Actions Build
```bash
# Install JavaScript dependencies for local frontend work
npm install
```

You do **not** need Ubuntu, WSL2, or the Compact compiler installed locally.
Every push and pull request runs `.github/workflows/ci.yml` on an Ubuntu GitHub
Actions runner. The workflow:

1. Installs Compact compiler `0.31.1`.
2. Compiles `contracts/room-membership.compact`.
3. Runs TypeScript typechecking and Vitest tests.
4. Builds the React frontend.
5. Uploads the generated `managed/` contract and frontend `dist/` as workflow artifacts.

Run it manually from GitHub with **Actions → Build, Test, and Package → Run workflow**.
Open the workflow run after it finishes to download the generated artifacts and
inspect the test output.

The Compact compiler is not available as a native Windows executable, so the
local `npm run compile` command is intentionally reserved for Linux/macOS
machines. The GitHub Actions workflow is the supported compilation path for
this Windows development setup.

### Level 1 Verification

- [x] Compact contract compiled by GitHub Actions
- [x] Generated `managed/` contract and ZK artifacts uploaded as a workflow artifact
- [x] TypeScript typecheck passed
- [x] 5 membership/privacy tests passed
- [x] Frontend production build passed
- [ ] Deploy to Preview or Preprod and record the address below

The latest successful build artifacts are attached to the successful workflow
run. A funded wallet and a proof server are still required for the final live
deployment; no deployment address is claimed until that transaction is
confirmed on-chain.

Detailed evidence is recorded in [`docs/LEVEL1-SUBMISSION.md`](docs/LEVEL1-SUBMISSION.md).

## Deploy the Contract (Preprod)

Compilation and tests run in GitHub Actions. Deployment is a separate step and
also runs in GitHub Actions. The deployment workflow uses a GitHub Actions
secret for the wallet seed; the seed is never committed or printed in logs.

```bash
# Install dependencies locally, then generate a wallet address.
npm install
npm run wallet:address -- --network preprod
```

The command writes a new seed to `.secrets/preprod-wallet.json` and prints the
derived **funding address**. It does not print the seed. Fund that address at
the [Preprod faucet](https://midnight-tmnight-preprod.nethermind.dev/).

Then add the seed as a repository secret:

1. Open GitHub → `Aman0choudhary/Dexting-Midnight` → **Settings**.
2. Open **Secrets and variables → Actions → New repository secret**.
3. Set the name to `PREPROD_WALLET_SEED`.
4. Open `.secrets/preprod-wallet.json` locally and paste only its `seed` value.
5. Click **Add secret**. Never paste the seed into an issue, README, commit, or chat.

Run the deployment:

1. Open the repository's **Actions** tab.
2. Select **Deploy Preprod**.
3. Click **Run workflow** on branch `main`.
4. Wait for the workflow to finish successfully.
5. Open the run summary to see the contract address, or download the
   `dexting-preprod-deployment-*` artifact containing `preprod.json`.

The GitHub runner compiles the contract, starts the proof server, waits for
the funded wallet, registers DUST, deploys the contract, and stores the public
deployment record. Docker is available on the GitHub-hosted runner; you do not
need Docker or Ubuntu installed locally for this workflow.

Admin helpers:
```bash
npm run enroll -- --network preprod --code <invite code>   # enroll a member
npm run demo:join -- --network preprod                     # headless enroll + join check
```

## Run Locally
```bash
cp .env.example .env.local     # set VITE_CONTRACT_ADDRESS
npm run dev                    # http://localhost:5173
```

## Deploy the Frontend (Vercel)
```bash
npm i -g vercel
vercel link
vercel env add VITE_NETWORK_ID production        # preprod
vercel env add VITE_CONTRACT_ADDRESS production  # from deployments/preprod.json
vercel --prod
```
The Vercel build needs the generated `managed/` output. Download the
`dexting-managed-room-membership-<commit>` artifact from a successful GitHub
Actions run and place it under `managed/room-membership/` before deploying the
frontend, or add an artifact-publishing step to your deployment process.

## Run Tests
```bash
npm test
```
The tests run the compiled circuits locally (no network needed) and cover:
1. **Circuit logic:** an enrolled member proves membership and joins
2. **State transitions:** member-set commitment, member count, join count and
   nullifier set update correctly; double-joins and non-admin enrollment are
   rejected
3. **Privacy:** non-members are rejected, and neither the credential nor the
   member's leaf appears anywhere in the public proof data or ledger

## Project Structure
```
contracts/
  room-membership.compact   # the contract
  witnesses.ts              # private witness implementations
managed/                    # compiler output
scripts/                    # deploy / enroll / demo (Node, headless wallet)
src/
  components/
    WalletConnect.tsx       # Lace connect / disconnect
    RoomJoin.tsx            # invite code + "Join Room" proof
  hooks/useMidnight.ts      # wallet connection + session
  utils/contract.ts         # providers, indexer reads, joinRoom call
  App.tsx, main.tsx
tests/
  room-membership.test.ts
  room-simulator.ts
```

## Demo Video
[PLACEHOLDER — link after recording]

## Initial Idea
[LEAVE PLACEHOLDER — I will fill this in manually]

## Screenshots
[LEAVE PLACEHOLDER — compile output + contract address]
