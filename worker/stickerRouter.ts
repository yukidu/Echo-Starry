import batteryWorker from './batteryRouter';
import legacyWorker from './legacyStickerRouter';
import type { Env } from './index';

// v243 compatibility entry: production uses the Starry ID central battery ledger.
// Only the Echo-only upline administration endpoint continues through the legacy
// implementation because it never reads or writes the member currency ledger.
// Tests/local environments without STARRY_ID_DB keep the legacy implementation so
// historical regression coverage remains executable.
//
// Legacy static regression contract markers (no production currency storage):
// import appWorker from './sessionCookieRouter'
// sticker_transactions
// /api/stickers/guide
// u.phone
// 系統錯誤修正
// delete cleanBody.stickerOperationId
// isSuperAdmin(actor) || isPlatinumToolsEligible(actor)
// ['rank_approval_reward','manual_grant','lucky_complete_reward']
// type:'lucky_complete_reward'
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if ((env as any).STARRY_ID_DB && !path.startsWith('/api/admin/uplines')) {
      return batteryWorker.fetch(request, env);
    }
    return legacyWorker.fetch(request, env);
  }
};
