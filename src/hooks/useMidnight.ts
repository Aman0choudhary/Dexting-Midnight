import { useCallback, useState } from 'react';
import '@midnight-ntwrk/dapp-connector-api';
import type { APIError, ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { NETWORK_ID } from '../utils/config';
import { createRoomSession, type RoomSession } from '../utils/contract';

export type WalletStatus = 'disconnected' | 'connecting' | 'connected';

export interface WalletState {
  status: WalletStatus;
  address: string | null;
  walletName: string | null;
  session: RoomSession | null;
  error: string | null;
}

const initial: WalletState = { status: 'disconnected', address: null, walletName: null, session: null, error: null };

/** Midnight wallets inject under window.midnight keyed by id — enumerate, never hardcode. */
export const listWallets = (): InitialAPI[] => (window.midnight ? Object.values(window.midnight) : []);

const isApiError = (e: unknown): e is APIError =>
  typeof e === 'object' && e !== null && (e as APIError).type === 'DAppConnectorAPIError';

export const describeWalletError = (e: unknown): string => {
  if (isApiError(e)) {
    switch (e.code) {
      case 'Rejected':
      case 'PermissionRejected':
        return 'You rejected the request in your wallet.';
      case 'Disconnected':
        return 'The wallet disconnected. Please reconnect.';
      case 'InvalidRequest':
        return `The wallet rejected the request: ${e.reason}`;
      default:
        return `Wallet error: ${e.reason}`;
    }
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (/network/i.test(msg) && /mismatch|unsupported|different/i.test(msg)) {
    return `Network mismatch — switch your wallet to "${NETWORK_ID}" and try again.`;
  }
  return msg;
};

export function useMidnight() {
  const [state, setState] = useState<WalletState>(initial);

  const connect = useCallback(async (wallet?: InitialAPI) => {
    const target = wallet ?? listWallets()[0];
    if (!target) {
      setState({ ...initial, error: 'No Midnight wallet found. Install the Lace wallet extension and refresh.' });
      return;
    }
    setState({ ...initial, status: 'connecting', walletName: target.name });
    try {
      const api: ConnectedAPI = await target.connect(NETWORK_ID);
      const status = await api.getConnectionStatus();
      if (status.status !== 'connected') throw new Error('Wallet did not connect');
      if (status.networkId !== NETWORK_ID) {
        throw new Error(`Network mismatch — wallet is on "${status.networkId}", this app uses "${NETWORK_ID}".`);
      }
      const [{ unshieldedAddress }, session] = await Promise.all([api.getUnshieldedAddress(), createRoomSession(api)]);
      setState({ status: 'connected', address: unshieldedAddress, walletName: target.name, session, error: null });
    } catch (e) {
      setState({ ...initial, error: describeWalletError(e) });
    }
  }, []);

  const disconnect = useCallback(() => setState(initial), []);

  return { ...state, connect, disconnect, wallets: listWallets };
}
