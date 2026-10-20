import { queueNextTranscriptV293 } from './transcriptSequentialSchedulerV293';
import { gate2Enabled } from './transcriptP0Safety';
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
  const itemRows: any = await env.DB.prepare(`SELECT
    t.id AS trackId,
    COALESCE(i.status,'pending') AS status,
    i.error AS error,
    COALESCE(i.updatedAt,0) AS updatedAt
    FROM tracks t
    LEFT JOIN transcript_index i ON i.trackId=t.id
    WHERE t.audioUrl IS NOT NULL AND TRIM(t.audioUrl)<>''
    ORDER BY COALESCE(t.uploadDate,'') DESC,t.id`).all();
  const candidateRows:any = gate2Enabled(env)
    ? await env.DB.prepare("SELECT trackId,runId,state FROM transcript_runs WHERE intent='relisten' "+
      "AND state IN ('pending','queued','processing','awaiting_review','failed') "+
      "ORDER BY createdAt DESC LIMIT 200").all()
    : {results:[]};
  const candidateByTrack=new Map<string,{runId:string;state:string}>();
  for(const row of candidateRows?.results||[]){
    const id=text(row.trackId);
    if(!candidateByTrack.has(id))candidateByTrack.set(id,{runId:text(row.runId),state:text(row.state)});
  }
  const items = (itemRows?.results || []).map((item: any) => ({
    trackId: text(item.trackId),
    status: text(item.status) || 'pending',
    error: text(item.error) || null,
    updatedAt: Number(item.updatedAt || 0),
    candidateState:candidateByTrack.get(text(item.trackId))?.state||null,
    candidateRunId:candidateByTrack.get(text(item.trackId))?.runId||null
  }));
  return {
    audioTracks: Number(allTracks?.n || 0),
    indexed: Number(row?.total || 0),
    ready: Number(row?.ready || 0),
    queued: Number(row?.queued || 0),
    processing: Number(row?.processing || 0),
    failed: Number(row?.failed || 0),
    pending: Number(row?.pending || 0),
    items
  };
}

export async function queueAllPendingTranscripts(env: SchedulerEnv) {
  await ensureIndex(env);
  // The old bulk action bypassed the concurrency gate by starting 100
  // workflows directly. It now only enqueues pending work in D1.
  const now=Date.now();
  await env.DB.prepare(`INSERT OR IGNORE INTO transcript_index
      (trackId,status,r2Key,model,chunkCount,segmentCount,wordCount,durationSeconds,error,createdAt,updatedAt)
      SELECT t.id,'pending',NULL,?,0,0,0,COALESCE(t.durationSeconds,0),NULL,?,?
      FROM tracks t WHERE t.audioUrl IS NOT NULL AND TRIM(t.audioUrl)<>''`).bind(TRANSCRIPT_MODEL,now,now).run();
  // Gate2 must never revive a failed/previously paid transcription in a bulk retry.
  if(!gate2Enabled(env)){
    await env.DB.prepare("UPDATE transcript_index SET status='pending',error=NULL,updatedAt=? WHERE status='failed'")
      .bind(now).run();
  }
  const scheduled=await queueNextTranscriptV293(env,{includeFailed:false});
  return {
    queued:scheduled.queued,errors:scheduled.failures,
    status:await transcriptBulkStatus(env),
    note:'剩餘逐字稿保持排隊，由中央 AI 優先權自動安排啟動'
  };
}
