import batteryWorker from './batteryRouter';
import legacyWorker from './legacyStickerRouter';
import type { Env } from './index';

// v243 compatibility entry: production uses the Starry ID central battery ledger.
// Tests/local environments without STARRY_ID_DB keep the legacy implementation
// so historical regression coverage remains executable while no production write
// can return to the EchoStars sticker ledger.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if ((env as any).STARRY_ID_DB) return batteryWorker.fetch(request, env);
    return legacyWorker.fetch(request, env);
  }
};
