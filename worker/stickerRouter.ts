import batteryWorker from './batteryRouter';
import legacyWorker from './legacyStickerRouter';
import uplineAdminWorker from './uplineAdminRouter';
import type { Env } from './index';

// Production always uses the Starry ID central battery ledger. The legacy engine
// remains only for local/historical regression coverage when STARRY_ID_DB is absent.
// Its historical downstream chain remains: import appWorker from './sessionCookieRouter'
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if ((env as any).STARRY_ID_DB) {
      if (path.startsWith('/api/admin/uplines')) return uplineAdminWorker.fetch(request, env);
      return batteryWorker.fetch(request, env);
    }
    return legacyWorker.fetch(request, env);
  }
};
