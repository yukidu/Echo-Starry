/**
 * Google Identity Services client selection.
 *
 * echo.starry.phd uses the Starry ID Google Cloud client.
 * The legacy workers.dev host keeps its existing client so the backup URL
 * remains usable without requiring a second OAuth-origin migration.
 */
const STARRY_GOOGLE_CLIENT_ID =
  (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ||
  '661055525630-633btocuq7hs6pu7v5gkg3n2fouupubp.apps.googleusercontent.com';

const LEGACY_ECHOSTARS_GOOGLE_CLIENT_ID =
  '400699489182-lb412nhvj4s6t1qr5ovkg40hc646dq79.apps.googleusercontent.com';

const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

export const GOOGLE_CLIENT_ID = hostname === 'echostars.yukidu.workers.dev'
  ? LEGACY_ECHOSTARS_GOOGLE_CLIENT_ID
  : STARRY_GOOGLE_CLIENT_ID;
