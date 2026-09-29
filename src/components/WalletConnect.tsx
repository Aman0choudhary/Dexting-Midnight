import { NETWORK_ID } from '../utils/config';
import type { WalletState } from '../hooks/useMidnight';

interface Props extends Pick<WalletState, 'status' | 'address' | 'walletName' | 'error'> {
  onConnect: () => void;
  onDisconnect: () => void;
}

const shorten = (addr: string) => (addr.length > 24 ? `${addr.slice(0, 14)}…${addr.slice(-8)}` : addr);

export function WalletConnect({ status, address, walletName, error, onConnect, onDisconnect }: Props) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Wallet</h2>
        <span className={`pill pill-${status}`}>
          {status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting…' : 'Disconnected'}
        </span>
      </div>

      {status === 'connected' && address ? (
        <div className="stack">
          <p className="muted">
            {walletName ?? 'Wallet'} · {NETWORK_ID}
          </p>
          <code className="address" title={address}>
            {shorten(address)}
          </code>
          <button className="btn btn-ghost" onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
      ) : (
        <div className="stack">
          <p className="muted">Connect a Midnight wallet (Lace) on {NETWORK_ID} to continue.</p>
          <button className="btn" onClick={onConnect} disabled={status === 'connecting'}>
            {status === 'connecting' ? 'Waiting for wallet…' : 'Connect Lace wallet'}
          </button>
        </div>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
