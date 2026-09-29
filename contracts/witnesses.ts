// Private witness implementations for room-membership.compact.
//
// Everything in RoomPrivateState stays on the member's device. The contract
// only ever sees hashes derived from it inside a zero-knowledge proof.

import type { WitnessContext, MerkleTreePath } from '@midnight-ntwrk/compact-runtime';
import type { Ledger } from '../managed/room-membership/contract/index.js';

export type RoomPrivateState = {
  /** The member's 32-byte membership credential. Never disclosed. */
  readonly memberSecret: Uint8Array;
  /** The admin's secret key. Only the room admin holds a real value. */
  readonly adminSecret: Uint8Array;
};

export const emptyPrivateState = (): RoomPrivateState => ({
  memberSecret: new Uint8Array(32),
  adminSecret: new Uint8Array(32),
});

export const witnesses = {
  memberSecret: ({ privateState }: WitnessContext<Ledger, RoomPrivateState>): [RoomPrivateState, Uint8Array] => [
    privateState,
    privateState.memberSecret,
  ],

  adminSecret: ({ privateState }: WitnessContext<Ledger, RoomPrivateState>): [RoomPrivateState, Uint8Array] => [
    privateState,
    privateState.adminSecret,
  ],

  findMemberPath: (
    { ledger, privateState }: WitnessContext<Ledger, RoomPrivateState>,
    commitment: Uint8Array,
  ): [RoomPrivateState, MerkleTreePath<Uint8Array>] => {
    const path = ledger.members.findPathForLeaf(commitment);
    if (path === undefined) {
      // Non-members get no path. Throwing here means no proof is ever
      // produced, and the secret never leaves this function.
      throw new Error('Not a verified member of this room');
    }
    return [privateState, path];
  },
};

/** Fresh random 32-byte secret (member credential or admin key). */
export const randomSecret = (): Uint8Array => {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
};

/** Encode a short room name as the 32-byte room ID. */
export const roomIdFromName = (name: string): Uint8Array => {
  const encoded = new TextEncoder().encode(name);
  if (encoded.length > 32) throw new Error('Room name must be at most 32 bytes');
  const out = new Uint8Array(32);
  out.set(encoded);
  return out;
};
