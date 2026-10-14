import batteryWorker from './batteryRouter';
import legacyWorker from './legacyStickerRouter';
import type { Env } from './index';

// Production uses the Starry ID central battery ledger. The legacy engine remains
// only for local/historical regression coverage and the Echo-only upline admin path.
// Its downstream security chain remains: import appWorker from './sessionCookieRouter'
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if ((env as any).STARRY_ID_DB && !path.startsWith('/api/admin/uplines')) {
      return batteryWorker.fetch(request, env);
    }
    return legacyWorker.fetch(request, env);
  }
};
