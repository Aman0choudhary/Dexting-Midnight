import { describe, it, expect, beforeEach } from 'vitest';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { RoomSimulator } from './room-simulator.js';
import { type RoomPrivateState, randomSecret, roomIdFromName } from '../contracts/witnesses.js';

setNetworkId('undeployed');

const toHex = (b: Uint8Array) => Buffer.from(b).toString('hex');

/** Hex-dump every byte array reachable from a value (proof data, ledger, ...). */
const dumpBytes = (value: unknown, seen = new WeakSet<object>()): string => {
  if (value instanceof Uint8Array) return toHex(value);
  if (typeof value === 'bigint') return value.toString(16);
  if (value === null || typeof value !== 'object') return String(value ?? '');
  if (seen.has(value)) return '';
  seen.add(value);
  return Object.values(value as Record<string, unknown>)
    .map((v) => dumpBytes(v, seen))
    .join('|');
};

describe('room-membership contract', () => {
  const roomId = roomIdFromName('campus-batch-2026');
  const adminSecret = randomSecret();
  const admin: RoomPrivateState = { adminSecret, memberSecret: new Uint8Array(32) };

  const alice: RoomPrivateState = { adminSecret: new Uint8Array(32), memberSecret: randomSecret() };
  const bob: RoomPrivateState = { adminSecret: new Uint8Array(32), memberSecret: randomSecret() };
  const mallory: RoomPrivateState = { adminSecret: randomSecret(), memberSecret: randomSecret() };

  let room: RoomSimulator;

  beforeEach(() => {
    room = new RoomSimulator(roomId, adminSecret);
  });

  // 1. Circuit logic
  it('lets an enrolled member prove membership and join', () => {
    room.as(admin).enrollMember(room.commitmentFor(alice.memberSecret));
    room.as(admin).enrollMember(room.commitmentFor(bob.memberSecret));

    room.as(alice).joinRoom();

    expect(room.ledger.verifiedJoins).toEqual(1n);
    expect(room.ledger.nullifiers.member(room.nullifierFor(alice.memberSecret))).toBe(true);
  });

  // 2. State transitions
  it('updates the member commitment set and join state correctly', () => {
    expect(room.ledger.roomId).toEqual(roomId);
    expect(room.ledger.memberCount).toEqual(0n);
    const emptyRoot = room.ledger.members.root();

    room.as(admin).enrollMember(room.commitmentFor(alice.memberSecret));
    expect(room.ledger.memberCount).toEqual(1n);
    const rootAfterAlice = room.ledger.members.root();
    expect(rootAfterAlice).not.toEqual(emptyRoot);

    room.as(admin).enrollMember(room.commitmentFor(bob.memberSecret));
    expect(room.ledger.memberCount).toEqual(2n);
    expect(room.ledger.members.root()).not.toEqual(rootAfterAlice);

    room.as(alice).joinRoom();
    room.as(bob).joinRoom();
    expect(room.ledger.verifiedJoins).toEqual(2n);
    expect(room.ledger.nullifiers.size()).toEqual(2n);

    // Same credential cannot join twice.
    expect(() => room.as(alice).joinRoom()).toThrow(/already been used/);
    expect(room.ledger.verifiedJoins).toEqual(2n);
  });

  it('only lets the admin enroll members', () => {
    expect(() => room.as(mallory).enrollMember(room.commitmentFor(mallory.memberSecret))).toThrow(
      /Only the room admin/,
    );
    expect(room.ledger.memberCount).toEqual(0n);
  });

  // 3. Privacy
  it('rejects non-members', () => {
    room.as(admin).enrollMember(room.commitmentFor(alice.memberSecret));
    expect(() => room.as(mallory).joinRoom()).toThrow(/Not a verified member/);
    expect(room.ledger.verifiedJoins).toEqual(0n);
  });

  it('never exposes the private credential or leaf in public outputs', () => {
    room.as(admin).enrollMember(room.commitmentFor(bob.memberSecret));
    room.as(admin).enrollMember(room.commitmentFor(alice.memberSecret));
    const result = room.as(alice).joinRoom();

    const secret = toHex(alice.memberSecret);
    const leaf = toHex(room.commitmentFor(alice.memberSecret));

    // What goes on-chain: circuit inputs, outputs and the public transcript.
    const publicData =
      dumpBytes(result.proofData.input) +
      dumpBytes(result.proofData.output) +
      dumpBytes(result.proofData.publicTranscript);

    expect(publicData).not.toContain(secret);
    // The leaf is also hidden, so the join can't be tied to an enrollment.
    expect(publicData).not.toContain(leaf);

    // Only the nullifier is disclosed, and it cannot be linked to the leaf.
    const nul = toHex(room.nullifierFor(alice.memberSecret));
    expect(nul).not.toEqual(leaf);
    expect(room.ledger.nullifiers.member(room.nullifierFor(alice.memberSecret))).toBe(true);

    // The secret is not recorded anywhere in public ledger state either.
    expect(dumpBytes([...room.ledger.nullifiers])).not.toContain(secret);
  });
});
