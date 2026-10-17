const TRANSCRIPT_MODEL = '@cf/openai/whisper-large-v3-turbo';
const STALE_ACTIVE_MS = 3 * 60 * 60 * 1000;

type SchedulerEnv = {
  DB: any;
  TRANSCRIPT_WORKFLOW: any;
};

function text(value: unknown) { return value == null ? '' : String(value).trim(); }

async function ensureIndex(env: SchedulerEnv) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS transcript_index (
    trackId TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'pending',r2Key TEXT,model TEXT NOT NULL DEFAULT '${TRANSCRIPT_MODEL}',
    chunkCount INTEGER NOT NULL DEFAULT 0,segmentCount INTEGER NOT NULL DEFAULT 0,wordCount INTEGER NOT NULL DEFAULT 0,
    durationSeconds REAL NOT NULL DEFAULT 0,error TEXT,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL)`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS transcript_index_status ON transcript_index(status,updatedAt)').run();
}

export async function queueNextTranscriptV293(env: SchedulerEnv) {
  await ensureIndex(env);
  const now = Date.now();

  // 防止異常中斷永久卡住：超過 3 小時仍 queued/processing 才釋放重排。
  await env.DB.prepare(`UPDATE transcript_index
    SET status='pending',error='背景任務逾時，已自動重新排隊',updatedAt=?
    WHERE status IN ('queued','processing') AND updatedAt < ?`)
    .bind(now, now - STALE_ACTIVE_MS).run();

  const active: any = await env.DB.prepare(`SELECT trackId,status FROM transcript_index
    WHERE status IN ('queued','processing') ORDER BY updatedAt DESC LIMIT 1`).first();
  if (active) return { queued: 0, active: text(active.trackId), status: text(active.status) };

  // 一次只跑一份，避免多份長音檔同時搶 AudioSegmenter Container。
  // 尚未處理/待處理優先，failed 放最後，避免單一壞檔阻塞整批。
  const row: any = await env.DB.prepare(`SELECT t.id,t.durationSeconds,i.status
    FROM tracks t LEFT JOIN transcript_index i ON i.trackId=t.id
    WHERE t.audioUrl IS NOT NULL AND TRIM(t.audioUrl)<>''
      AND (i.trackId IS NULL OR i.status IN ('pending','failed'))
    ORDER BY CASE WHEN i.status='failed' THEN 2 WHEN i.status='pending' THEN 1 ELSE 0 END,
      COALESCE(t.uploadDate,'') DESC,t.id
    LIMIT 1`).first();
  if (!row?.id) return { queued: 0, done: true };

  await env.DB.prepare(`INSERT INTO transcript_index(trackId,status,r2Key,model,chunkCount,segmentCount,wordCount,durationSeconds,error,createdAt,updatedAt)
    VALUES (?,'queued',NULL,?,0,0,0,?,NULL,?,?)
    ON CONFLICT(trackId) DO UPDATE SET status='queued',error=NULL,updatedAt=excluded.updatedAt`)
    .bind(row.id, TRANSCRIPT_MODEL, Number(row.durationSeconds || 0), now, now).run();

  const safeId = text(row.id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 42);
  const instanceId = `echo-v293-auto-${safeId}-${now}`;
  try {
    const result: any = await env.TRANSCRIPT_WORKFLOW.createBatch({
      instances: [{ id: instanceId, params: { trackId: row.id } }]
    });
    const error = Array.isArray(result?.errors) ? result.errors[0] : null;
    if (error) throw new Error(text(error.message || error.code || 'Workflow queue error'));
    return { queued: 1, trackId: row.id, instanceId };
  } catch (error) {
    await env.DB.prepare(`UPDATE transcript_index SET status='pending',error=?,updatedAt=? WHERE trackId=?`)
      .bind(text((error as any)?.message || 'Workflow queue error'), Date.now(), row.id).run();
    throw error;
  }
}
