/**
 * Google OAuth 2.0 Client ID Configuration
 *
 * Echo-Starry 以環境變數為優先；若未提供則沿用既有 Web Client ID，
 * 以維持現有會員 Google 身分關聯不中斷。
 */
export const GOOGLE_CLIENT_ID =
  (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ||
  '400699489182-lb412nhvj4s6t1qr5ovkg40hc646dq79.apps.googleusercontent.com';
