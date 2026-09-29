// Frontend runtime config. Values come from Vite env vars (see .env.example).

export const NETWORK_ID = (import.meta.env.VITE_NETWORK_ID as string | undefined) ?? 'preprod';

export const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS as string | undefined) ?? '';

/** Where the compiled ZK keys/zkir are served from (copied by scripts/sync-zk-assets.mjs). */
export const ZK_ASSETS_PATH = '/zk/room-membership';

/** Fallback indexer if the wallet does not report one. */
export const FALLBACK_INDEXER: Record<string, { http: string; ws: string }> = {
  preprod: {
    http: 'https://indexer.preprod.midnight.network/api/v3/graphql',
    ws: 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws',
  },
  preview: {
    http: 'https://indexer.preview.midnight.network/api/v3/graphql',
    ws: 'wss://indexer.preview.midnight.network/api/v3/graphql/ws',
  },
};
