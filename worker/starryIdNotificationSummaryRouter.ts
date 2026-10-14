import type { Env } from './index';
import { sessionContext } from './starryIdProfileDirectoryRouter';

function text(value: unknown) { return value == null ? '' : String(value).trim(); }
function effectiveRank(row: any) {
  const approved = text(row?.approvedRank);
  if (approved) return approved;
  return Number(row?.rankApproved || 0) === 1 ? text(row?.rank) : '';
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
  });
}

export async function handleStarryIdNotificationSummary(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.hostname !== 'id.starry.phd' || url.pathname !== '/api/notifications' || url.searchParams.get('summary') !== '1' || request.method.toUpperCase() !== 'GET') return null;
  const session = await sessionContext(request, env);
  if (!session) return json({ error: '請先登入 Starry ID' }, 401);
  const db = (env as any).STARRY_ID_DB;
  if (!db) return json({ error: 'Starry ID service unavailable' }, 503);
  const me: any = await db.prepare('SELECT rank,approvedRank,rankApproved,rankAuditStatus FROM profiles WHERE userId=? LIMIT 1').bind(session.userId).first();
  let unread = 0;
  try {
    const count: any = await db.prepare('SELECT COUNT(*) AS count FROM starry_notifications WHERE userId=? AND isRead=0').bind(session.userId).first();
    unread = Number(count?.count || 0);
  } catch { unread = 0; }
  return json({
    unread,
    rankStatus: {
      approvedRank: effectiveRank(me),
      pendingRank: text(me?.rankAuditStatus) === 'pending' ? text(me?.rank) : '',
      status: text(me?.rankAuditStatus) || (Number(me?.rankApproved || 0) === 1 ? 'approved' : '')
    }
  });
}
