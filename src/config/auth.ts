/**
 * Google Identity Services client selection.
 *
 * All production Starry apps use the same Starry ID Web OAuth client so a
 * Google login can establish one central ecosystem session.
 */
const STARRY_ID_GOOGLE_CLIENT_ID =
  '661055525630-ndcq5gtr16h7rqqprlqqkkvineea87lc.apps.googleusercontent.com';

const LEGACY_ECHOSTARS_GOOGLE_CLIENT_ID =
  '400699489182-lb412nhvj4s6t1qr5ovkg40hc646dq79.apps.googleusercontent.com';

const configuredClientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '';
const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

export const GOOGLE_CLIENT_ID = hostname === 'echo.starry.phd'
  ? STARRY_ID_GOOGLE_CLIENT_ID
  : hostname === 'echostars.yukidu.workers.dev'
  ? LEGACY_ECHOSTARS_GOOGLE_CLIENT_ID
  : configuredClientId || STARRY_ID_GOOGLE_CLIENT_ID;
