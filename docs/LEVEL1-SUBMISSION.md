# Level 1 Submission Evidence

## Automated Verification

Successful GitHub Actions run:

https://github.com/Aman0choudhary/Dexting-Midnight/actions/runs/36527183654

The Ubuntu runner completed all of these steps successfully:

- Compact compiler setup, version `0.31.1`
- Compact contract compilation
- TypeScript typecheck
- Five membership/privacy tests
- React production build
- Generated contract and ZK artifact upload

## Level 1 Scope

The implementation contains only the room-membership privacy primitive. There
is no vibe-match circuit in this level. The membership contract uses a hashed
commitment Merkle tree, private membership credentials, and replay-protection
nullifiers.

## Remaining Manual Step

The contract still needs one funded Preview or Preprod deployment. After the
deployment transaction is confirmed, add its address to the Contract Address
table in `README.md` and attach a deployment screenshot.
