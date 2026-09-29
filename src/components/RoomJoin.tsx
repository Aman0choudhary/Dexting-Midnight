import { useCallback, useEffect, useMemo, useState } from 'react';
import { describeWalletError } from '../hooks/useMidnight';
import {
  commitmentFor,
  joinRoom,
  loadOrCreateCredential,
  membershipStatus,
  readRoom,
  type MembershipStatus,
  type RoomSession,
} from '../utils/contract';

interface Props {
  session: RoomSession;
  contractAddress: string;
}

type JoinPhase = 'idle' | 'proving' | 'success' | 'error';

const roomLabel = (roomId: Uint8Array) => new TextDecoder().decode(roomId).replace(/\0+$/, '');

export function RoomJoin({ session, contractAddress }: Props) {
  // The credential lives only in memory + this browser's storage. It is never rendered.
  const credential = useMemo(() => loadOrCreateCredential(contractAddress), [contractAddress]);

  const [roomName, setRoomName] = useState<string>('');
  const [inviteCode, setInviteCode] = useState<string>('');
  const [stats, setStats] = useState<{ members: bigint; joins: bigint } | null>(null);
  const [membership, setMembership] = useState<MembershipStatus | null>(null);
  const [phase, setPhase] = useState<JoinPhase>('idle');
  const [txId, setTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const room = await readRoom(session.indexerUrl, contractAddress);
      setRoomName(roomLabel(room.roomId));
      setInviteCode(commitmentFor(room.roomId, credential));
      setStats({ members: room.memberCount, joins: room.verifiedJoins });
      setMembership(membershipStatus(room, credential));
    } catch (e) {
      setError(describeWalletError(e));
    }
  }, [session, contractAddress, credential]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onJoin = async () => {
    setPhase('proving');
    setError(null);
    try {
      const result = await joinRoom(session, contractAddress, credential);
      setTxId(result.txId);
      setPhase('success');
      await refresh();
    } catch (e) {
      const msg = describeWalletError(e);
      setError(
        /Not a verified member/i.test(msg)
          ? 'You are not on this room’s member list yet. Send your invite code to the room admin.'
          : /already been used/i.test(msg)
            ? 'This credential has already joined the room.'
            : msg,
      );
      setPhase('error');
    }
  };

  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const joined = phase === 'success' || membership === 'joined';

  return (
    <section className="card">
      <div className="card-head">
        <h2>{roomName ? `Room: ${roomName}` : 'Room'}</h2>
        {stats && (
          <span className="muted small">
            {stats.members.toString()} enrolled · {stats.joins.toString()} verified joins
          </span>
        )}
      </div>

      {joined ? (
        <div className="result" role="status">
          <div className="result-title">✓ Verified member — identity not revealed</div>
          <p className="muted">
            The chain verified a zero-knowledge proof that you are on this room’s member list. It never learned which
            member you are.
          </p>
          {txId && (
            <p className="small">
              Transaction: <code>{txId.slice(0, 16)}…</code>
            </p>
          )}
        </div>
      ) : (
        <div className="stack">
          {membership === 'not-enrolled' && (
            <div className="notice">
              <p>
                <strong>Step 1 —</strong> send this invite code to the room admin. It is a one-way hash: it cannot be
                turned back into your credential.
              </p>
              <div className="invite">
                <code className="address">{inviteCode ? `${inviteCode.slice(0, 20)}…${inviteCode.slice(-8)}` : '…'}</code>
                <button className="btn btn-ghost" onClick={copyInvite} disabled={!inviteCode}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <button className="btn btn-ghost small" onClick={() => void refresh()}>
                I’ve been added — check again
              </button>
            </div>
          )}

          <button className="btn btn-primary" onClick={onJoin} disabled={phase === 'proving' || membership !== 'enrolled'}>
            {phase === 'proving' ? (
              <>
                <span className="spinner" aria-hidden /> Generating proof locally…
              </>
            ) : (
              'Join Room'
            )}
          </button>
          {phase === 'proving' && (
            <p className="muted small">Your wallet is proving membership on this device. This can take up to a minute.</p>
          )}
        </div>
      )}

      <p className="privacy-label">🔒 Proved without revealing your identity</p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
