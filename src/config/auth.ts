/**
 * Google Identity Services client selection.
 *
 * Production hosts are explicit so a stale build variable cannot silently
 * send either production domain to the wrong Google OAuth client.
 */
const STARRY_GOOGLE_CLIENT_ID =
  '661055525630-633btocuq7hs6pu7v5gkg3n2fouupubp.apps.googleusercontent.com';

const LEGACY_ECHOSTARS_GOOGLE_CLIENT_ID =
  '400699489182-lb412nhvj4s6t1qr5ovkg40hc646dq79.apps.googleusercontent.com';

const configuredClientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '';
const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

export const GOOGLE_CLIENT_ID = hostname === 'echo.starry.phd'
  ? STARRY_GOOGLE_CLIENT_ID
  : hostname === 'echostars.yukidu.workers.dev'
  ? LEGACY_ECHOSTARS_GOOGLE_CLIENT_ID
  : configuredClientId || STARRY_GOOGLE_CLIENT_ID;
