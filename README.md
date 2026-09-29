# Verified Anonymous Rooms
> Prove you belong in a group — without ever revealing who you are.

## Live Demo
[PASTE LIVE URL AFTER DEPLOYING FRONTEND]

## Contract Address
| Network | Address |
|----------|----------------------------------|
| Preprod | [PASTE ADDRESS AFTER DEPLOY — `deployments/preprod.json`] |
| Preview | [OPTIONAL] |

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
- **Docker Desktop** — runs the proof server used by deploy/admin scripts
- **Compact toolchain** (`compact` devtools 0.5.x, compiler **0.31.1** — see the
  [compatibility matrix](https://docs.midnight.network/relnotes/support-matrix))
- **Windows only:** WSL2 — the Compact compiler ships for Linux and macOS only

## Setup
```bash
# 1. Compact devtools (Linux / macOS / WSL2)
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
compact update 0.31.1

# 2. JS dependencies
npm install

# 3. Compile the contract → managed/room-membership
npm run compile          # Linux / macOS / WSL2
npm run compile:wsl      # Windows PowerShell (runs the compiler inside WSL)
```

## Deploy the Contract (Preprod)
```bash
npm run proof-server                      # terminal 1 (Docker)
npm run deploy -- --network preprod       # terminal 2
```
The script prints a deployer wallet address and waits. Fund it at the
[Preprod faucet](https://midnight-tmnight-preprod.nethermind.dev/); it then
registers DUST, deploys, and writes the address to `deployments/preprod.json`.

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
`managed/room-membership` is committed so Vercel can build without the Compact
compiler.

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
