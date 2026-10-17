const TRANSCRIPT_MODEL = '@cf/openai/whisper-large-v3-turbo';
const STALE_ACTIVE_MS = 3 * 60 * 60 * 1000;
const MAX_CONCURRENT_TRANSCRIPTS = 5;

type SchedulerEnv = {
  DB: any;
  TRANSCRIPT_WORKFLOW: any;
};

type QueueNextOptions = {
  // 排程守門員可重試 failed；工作流程自動接棒時關閉，避免壞檔無限重試卡住整批。
  includeFailed?: boolean;
};

function text(value: unknown) { return value == null ? '' : String(value).trim(); }

async function ensureIndex(env: SchedulerEnv) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS transcript_index (
    trackId TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'pending',r2Key TEXT,model TEXT NOT NULL DEFAULT '${TRANSCRIPT_MODEL}',
    chunkCount INTEGER NOT NULL DEFAULT 0,segmentCount INTEGER NOT NULL DEFAULT 0,wordCount INTEGER NOT NULL DEFAULT 0,
    durationSeconds REAL NOT NULL DEFAULT 0,error TEXT,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL)`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS transcript_index_status ON transcript_index(status,updatedAt)').run();
}

export async function queueNextTranscriptV293(env: SchedulerEnv, options: QueueNextOptions = {}) {
  await ensureIndex(env);
  const now = Date.now();
  const includeFailed = options.includeFailed !== false;

  // 防止異常中斷永久卡住：超過 3 小時仍 queued/processing 才釋放重排。
  await env.DB.prepare(`UPDATE transcript_index
    SET status='pending',error='背景任務逾時，已自動重新排隊',updatedAt=?
    WHERE status IN ('queued','processing') AND updatedAt < ?`)
    .bind(now, now - STALE_ACTIVE_MS).run();

  // v299：永遠補滿到 5 份同時處理。
  // 這個 INSERT ... SELECT 會在同一個 D1 寫入敘述內計算剩餘名額並搶位，
  // 即使多個 Workflow 幾乎同時完成，也不會因為「先查數量、再寫入」的競爭而排超過 5 份。
  const eligible = includeFailed
    ? `(i.trackId IS NULL OR i.status IN ('pending','failed'))`
    : `(i.trackId IS NULL OR i.status='pending')`;
  const claimedResult: any = await env.DB.prepare(`INSERT INTO transcript_index(
      trackId,status,r2Key,model,chunkCount,segmentCount,wordCount,durationSeconds,error,createdAt,updatedAt)
    SELECT t.id,'queued',NULL,?,0,0,0,COALESCE(t.durationSeconds,0),NULL,?,?
    FROM tracks t LEFT JOIN transcript_index i ON i.trackId=t.id
    WHERE t.audioUrl IS NOT NULL AND TRIM(t.audioUrl)<>''
      AND ${eligible}
    ORDER BY CASE WHEN i.status='failed' THEN 2 WHEN i.status='pending' THEN 1 ELSE 0 END,
      COALESCE(t.uploadDate,'') DESC,t.id
    LIMIT (SELECT MAX(0, ? - COUNT(*)) FROM transcript_index WHERE status IN ('queued','processing'))
    ON CONFLICT(trackId) DO UPDATE SET
      status='queued',error=NULL,model=excluded.model,durationSeconds=excluded.durationSeconds,updatedAt=excluded.updatedAt
    RETURNING trackId,durationSeconds`)
    .bind(TRANSCRIPT_MODEL, now, now, MAX_CONCURRENT_TRANSCRIPTS).all();

  const claimed: any[] = Array.isArray(claimedResult?.results) ? claimedResult.results : [];
  const started: Array<{ trackId: string; instanceId: string }> = [];
  const failures: Array<{ trackId: string; error: string }> = [];

  // 每個被搶到的名額各自建立 Workflow；單一建立失敗只退回該音檔，不影響其他四份。
  for (let index = 0; index < claimed.length; index++) {
    const trackId = text(claimed[index]?.trackId);
    if (!trackId) continue;
    const safeId = trackId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 42);
    const instanceId = `echo-v299-auto-${safeId}-${now}-${index + 1}`;
    try {
      const result: any = await env.TRANSCRIPT_WORKFLOW.createBatch({
        instances: [{ id: instanceId, params: { trackId } }]
      });
      const error = Array.isArray(result?.errors) ? result.errors[0] : null;
      if (error) throw new Error(text(error.message || error.code || 'Workflow queue error'));
      started.push({ trackId, instanceId });
    } catch (error) {
      const message = text((error as any)?.message || 'Workflow queue error');
      failures.push({ trackId, error: message });
      await env.DB.prepare(`UPDATE transcript_index SET status='pending',error=?,updatedAt=?
        WHERE trackId=? AND status='queued'`)
        .bind(message, Date.now(), trackId).run().catch(() => null);
    }
  }

  const active: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM transcript_index
    WHERE status IN ('queued','processing')`).first();
  const activeCount = Math.max(0, Number(active?.n || 0));
  const remaining: any = await env.DB.prepare(`SELECT COUNT(*) AS n
    FROM tracks t LEFT JOIN transcript_index i ON i.trackId=t.id
    WHERE t.audioUrl IS NOT NULL AND TRIM(t.audioUrl)<>''
      AND (i.trackId IS NULL OR i.status IN ('pending','failed'))`).first();
  const remainingCount = Math.max(0, Number(remaining?.n || 0));

  return {
    queued: started.length,
    active: activeCount,
    targetConcurrency: MAX_CONCURRENT_TRANSCRIPTS,
    remaining: remainingCount,
    failures,
    started,
    done: activeCount === 0 && remainingCount === 0
  };
}
