const TRANSCRIPT_MODEL = '@cf/openai/whisper-large-v3-turbo';
const BATCH_LIMIT = 100;

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

export async function transcriptBulkStatus(env: SchedulerEnv) {
  await ensureIndex(env);
  const row: any = await env.DB.prepare(`SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN status='ready' THEN 1 ELSE 0 END) AS ready,
    SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) AS queued,
    SUM(CASE WHEN status='processing' THEN 1 ELSE 0 END) AS processing,
    SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
    SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending
    FROM transcript_index`).first();
  const allTracks: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM tracks WHERE audioUrl IS NOT NULL AND TRIM(audioUrl)<>''`).first();
  return {
    audioTracks: Number(allTracks?.n || 0),
    indexed: Number(row?.total || 0),
    ready: Number(row?.ready || 0),
    queued: Number(row?.queued || 0),
    processing: Number(row?.processing || 0),
    failed: Number(row?.failed || 0),
    pending: Number(row?.pending || 0)
  };
}

export async function queueAllPendingTranscripts(env: SchedulerEnv) {
  await ensureIndex(env);
  const rows: any = await env.DB.prepare(`SELECT t.id,t.durationSeconds FROM tracks t
    LEFT JOIN transcript_index i ON i.trackId=t.id
    WHERE t.audioUrl IS NOT NULL AND TRIM(t.audioUrl)<>''
      AND (i.trackId IS NULL OR i.status IN ('pending','failed'))
    ORDER BY COALESCE(t.uploadDate,'') DESC,t.id`).all();
  const candidates = rows?.results || [];
  if (!candidates.length) return { queued: 0, errors: [], status: await transcriptBulkStatus(env) };

  const now = Date.now();
  const runKey = new Date(now).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const allErrors: any[] = [];
  let queued = 0;

  for (let start = 0; start < candidates.length; start += BATCH_LIMIT) {
    const batch = candidates.slice(start, start + BATCH_LIMIT);
    for (const row of batch) {
      await env.DB.prepare(`INSERT INTO transcript_index(trackId,status,r2Key,model,chunkCount,segmentCount,wordCount,durationSeconds,error,createdAt,updatedAt)
        VALUES (?,'queued',NULL,?,0,0,0,?,NULL,?,?)
        ON CONFLICT(trackId) DO UPDATE SET status='queued',error=NULL,updatedAt=excluded.updatedAt`)
        .bind(row.id, TRANSCRIPT_MODEL, Number(row.durationSeconds || 0), now, now).run();
    }

    const instances = batch.map((row: any, index: number) => ({
      id: `echo-transcript-bulk-${runKey}-${String(start + index).padStart(3, '0')}-${text(row.id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 36)}`,
      params: { trackId: row.id }
    }));
    const result: any = await env.TRANSCRIPT_WORKFLOW.createBatch({ instances });
    queued += Array.isArray(result?.created) ? result.created.length : 0;
    for (const error of result?.errors || []) {
      const row = batch[Number(error.index)];
      if (row) {
        await env.DB.prepare("UPDATE transcript_index SET status='pending',error=?,updatedAt=? WHERE trackId=?")
          .bind(text(error.message || error.code || 'Workflow queue error'), Date.now(), row.id).run();
      }
      allErrors.push({ index: start + Number(error.index || 0), id: text(error.id), code: text(error.code), message: text(error.message) });
    }
  }

  return { queued, errors: allErrors, status: await transcriptBulkStatus(env) };
}