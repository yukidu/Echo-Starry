import './index';

declare module './index' {
  interface Env {
    STARRY_ID_DB?: any; // Cloudflare D1Database: central Starry ID member store
  }
}

export {};
