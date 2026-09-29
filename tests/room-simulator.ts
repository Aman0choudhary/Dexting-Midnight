// In-memory simulator for room-membership.compact.
// Runs the compiled circuits locally (no network, no proof server) so tests
// exercise the exact same constraints the ZK proof enforces.

import {
  type CircuitContext,
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, type Ledger, ledger, pureCircuits } from '../managed/room-membership/contract/index.js';
import { type RoomPrivateState, emptyPrivateState, witnesses } from '../contracts/witnesses.js';

const DUMMY_COIN_PK = '0'.repeat(64);

export class RoomSimulator {
  readonly contract: Contract<RoomPrivateState>;
  readonly roomId: Uint8Array;
  context: CircuitContext<RoomPrivateState>;

  constructor(roomId: Uint8Array, adminSecret: Uint8Array) {
    this.roomId = roomId;
    this.contract = new Contract<RoomPrivateState>(witnesses);
    const initial = this.contract.initialState(
      createConstructorContext({ ...emptyPrivateState(), adminSecret }, DUMMY_COIN_PK),
      roomId,
    );
    this.context = createCircuitContext(
      sampleContractAddress(),
      initial.currentZswapLocalState,
      initial.currentContractState,
      initial.currentPrivateState,
    );
  }

  get ledger(): Ledger {
    return ledger(this.context.currentQueryContext.state);
  }

  /** Swap which user's private state is "on this device". */
  as(privateState: RoomPrivateState): this {
    this.context = { ...this.context, currentPrivateState: privateState };
    return this;
  }

  commitmentFor(memberSecret: Uint8Array): Uint8Array {
    return pureCircuits.memberCommitment(this.roomId, memberSecret);
  }

  nullifierFor(memberSecret: Uint8Array): Uint8Array {
    return pureCircuits.joinNullifier(this.roomId, memberSecret);
  }

  enrollMember(commitment: Uint8Array) {
    const result = this.contract.impureCircuits.enrollMember(this.context, commitment);
    this.context = result.context;
    return result;
  }

  joinRoom() {
    const result = this.contract.impureCircuits.joinRoom(this.context);
    this.context = result.context;
    return result;
  }
}
