import { useMidnight } from './hooks/useMidnight';
import { WalletConnect } from './components/WalletConnect';
import { RoomJoin } from './components/RoomJoin';
import { CONTRACT_ADDRESS, NETWORK_ID } from './utils/config';

export default function App() {
  const wallet = useMidnight();

  return (
    <div className="app">
      <header className="hero">
        <h1>Verified Anonymous Rooms</h1>
        <p className="tagline">Prove you belong in a group — without ever revealing who you are.</p>
      </header>

      <main className="grid">
        <WalletConnect
          status={wallet.status}
          address={wallet.address}
          walletName={wallet.walletName}
          error={wallet.error}
          onConnect={() => void wallet.connect()}
          onDisconnect={wallet.disconnect}
        />

        {!CONTRACT_ADDRESS ? (
          <section className="card">
            <p className="error">No room contract configured. Set VITE_CONTRACT_ADDRESS and rebuild.</p>
          </section>
        ) : wallet.status === 'connected' && wallet.session ? (
          <RoomJoin session={wallet.session} contractAddress={CONTRACT_ADDRESS} />
        ) : (
          <section className="card muted-card">
            <h2>Room</h2>
            <p className="muted">Connect your wallet to join the room.</p>
          </section>
        )}
      </main>

      <footer className="footer">
        <span>
          Network: <strong>{NETWORK_ID}</strong>
        </span>
        {CONTRACT_ADDRESS && (
          <span title={CONTRACT_ADDRESS}>
            Contract: <code>{CONTRACT_ADDRESS.slice(0, 12)}…</code>
          </span>
        )}
        <span>Built on Midnight</span>
      </footer>
    </div>
  );
}
