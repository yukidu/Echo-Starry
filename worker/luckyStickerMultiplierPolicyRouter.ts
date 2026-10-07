import appWorker from './adminUserDeleteRouter';
import type { Env } from './index';

const TRIGGER_NAME = 'sticker_lucky_complete_base_reward_v118';
const policyReady = new WeakMap<object, Promise<boolean>>();

async function ensureLuckyRewardPolicy(db: any): Promise<boolean> {
  if (!db) return false;
  const key = db as object;
  let task = policyReady.get(key);
  if (!task) {
    task = (async () => {
      const existing: any = await db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ? LIMIT 1"
      ).bind(TRIGGER_NAME).first();
      if (existing) return true;

      const tableRows = (await db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('sticker_transactions','sticker_lucky_draws')"
      ).all()).results || [];
      const tables = new Set(tableRows.map((row: any) => String(row.name || '')));
      if (!tables.has('sticker_transactions') || !tables.has('sticker_lucky_draws')) return false;

      // 召喚繁星「抽中後當日聽完」是固定獎勵，不參與白金級以上獲取倍數。
      // sticker_lucky_draws.rewardUnits 保存抽中當下的原始設定值；交易寫入後立即校正為該原始值。
      await db.prepare(`
        CREATE TRIGGER IF NOT EXISTS ${TRIGGER_NAME}
        AFTER INSERT ON sticker_transactions
        WHEN NEW.type = 'lucky_complete_reward'
        BEGIN
          UPDATE sticker_transactions
          SET
            deltaUnits = COALESCE(
              (
                SELECT rewardUnits
                FROM sticker_lucky_draws
                WHERE userId = NEW.userId
                  AND trackId = COALESCE(NEW.trackId, NEW.sourceId)
                  AND rewardUnits > 0
                  AND createdAt <= NEW.createdAt
                ORDER BY createdAt DESC
                LIMIT 1
              ),
              NEW.deltaUnits
            ),
            balanceAfterUnits = NEW.balanceAfterUnits - (
              NEW.deltaUnits - COALESCE(
                (
                  SELECT rewardUnits
                  FROM sticker_lucky_draws
                  WHERE userId = NEW.userId
                    AND trackId = COALESCE(NEW.trackId, NEW.sourceId)
                    AND rewardUnits > 0
                    AND createdAt <= NEW.createdAt
                  ORDER BY createdAt DESC
                  LIMIT 1
                ),
                NEW.deltaUnits
              )
            )
          WHERE id = NEW.id;
        END
      `).run();
      return true;
    })();
    policyReady.set(key, task);
  }

  try {
    const ready = await task;
    // 新資料庫可能尚未建立貼紙表；不要快取 false，下一次請求再檢查即可。
    if (!ready) policyReady.delete(key);
    return ready;
  } catch (error) {
    policyReady.delete(key);
    throw error;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      await ensureLuckyRewardPolicy(env.DB);
    } catch (error) {
      // 規則初始化失敗不應讓整站失效；原本 Worker 邏輯仍可繼續。
      console.error('Lucky sticker multiplier policy initialization failed:', error);
    }
    return appWorker.fetch(request, env);
  }
};
