import { handleStarryIdV211 } from './starryIdV211Router';
import type { Env } from './index';

type StarryV212Env = Env & { STARRY_ID_DB?: any };

const STAR_DOMAIN = 'id.starry.phd';
const AMWAY_ID_RE = /^[0-9]+$/;

function text(value: unknown) {
  return value == null ? '' : String(value).trim();
}

/**
 * v212 only fills the legacy-member gap for numeric Amway-ID public URLs.
 * Existing n1/n2/... cards and every API route stay entirely in v211.
 */
export function v212PublicAmwaySlug(request: Request) {
  const url = new URL(request.url);
  if (url.hostname !== STAR_DOMAIN || request.method.toUpperCase() !== 'GET') return '';
  if (url.pathname === '/' || url.pathname.startsWith('/api/')) return '';

  let raw = '';
  try {
    raw = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ''));
  } catch {
    return '';
  }

  if (!raw || raw.includes('/') || !AMWAY_ID_RE.test(raw)) return '';
  return raw;
}

async function findCanonicalActiveMember(db: any, amwayId: string) {
  const result: any = await db.prepare(`SELECT u.id,p.amwayId
    FROM users u
    JOIN profiles p ON p.userId=u.id
    WHERE u.status='active' AND TRIM(COALESCE(p.amwayId,''))=?
    ORDER BY u.id
    LIMIT 3`).bind(amwayId).all();
  const rows = result?.results || [];
  if (rows.length === 1 && text(rows[0].amwayId) === amwayId) return rows[0];
  if (rows.length !== 2 || rows.some((row: any) => text(row.amwayId) !== amwayId)) return null;

  const pair: any = await db.prepare(`SELECT id FROM spouse_links
    WHERE status='active'
      AND ((userA=? AND userB=?) OR (userA=? AND userB=?))
    LIMIT 1`).bind(rows[0].id,rows[1].id,rows[1].id,rows[0].id).first().catch(()=>null);
  if (!pair) return null;

  // A shared distributor number is intentionally one URL. Prefer whichever spouse
  // already owns that slug, otherwise keep a deterministic existing card owner.
  const existing: any = await db.prepare(`SELECT userId FROM public_cards
    WHERE userId IN (?,?)
    ORDER BY CASE WHEN LOWER(slug)=LOWER(?) THEN 0 ELSE 1 END, seq, userId
    LIMIT 1`).bind(rows[0].id,rows[1].id,amwayId).first().catch(()=>null);
  if (existing?.userId) {
    const chosen = rows.find((row: any) => text(row.id) === text(existing.userId));
    if (chosen) return chosen;
  }
  return rows[0];
}

async function materializeCard(db: any, member: any, slug: string) {
  const collision: any = await db.prepare(
    'SELECT userId FROM public_cards WHERE slug=? LIMIT 1'
  ).bind(slug).first();
  if (collision && text(collision.userId) !== text(member.id)) return false;

  let card: any = await db.prepare(
    'SELECT seq,userId,slug,cardNumber FROM public_cards WHERE userId=? LIMIT 1'
  ).bind(member.id).first();

  const now = Date.now();
  if (card) {
    if (text(card.slug) !== slug) {
      await db.prepare('UPDATE public_cards SET slug=?,updatedAt=? WHERE userId=?')
        .bind(slug, now, member.id).run();
    }
    return true;
  }

  const pending = `pending-${crypto.randomUUID()}`;
  try {
    await db.prepare(
      'INSERT INTO public_cards (userId,slug,cardNumber,createdAt,updatedAt) VALUES (?,?,?,?,?)'
    ).bind(member.id, pending, pending, now, now).run();
  } catch {
    // Two first-time public requests can race. The unique userId constraint makes
    // one win; the losing request simply reloads the row below.
  }

  card = await db.prepare(
    'SELECT seq,userId,slug,cardNumber FROM public_cards WHERE userId=? LIMIT 1'
  ).bind(member.id).first();
  if (!card) return false;

  const number = /^n[1-9][0-9]*$/.test(text(card.cardNumber))
    ? text(card.cardNumber)
    : `n${Number(card.seq)}`;

  const slugCollision: any = await db.prepare(
    'SELECT userId FROM public_cards WHERE slug=? LIMIT 1'
  ).bind(slug).first();
  if (slugCollision && text(slugCollision.userId) !== text(member.id)) return false;

  await db.prepare('UPDATE public_cards SET slug=?,cardNumber=?,updatedAt=? WHERE userId=?')
    .bind(slug, number, now, member.id).run();
  return true;
}

export async function handleStarryIdV212PublicCardFallback(
  request: Request,
  env: StarryV212Env,
  v211Response: Response
): Promise<Response> {
  // v212 must never widen v211 failure modes. It is a narrow fallback only.
  if (v211Response.status !== 404) return v211Response;

  const amwayId = v212PublicAmwaySlug(request);
  if (!amwayId || !env.STARRY_ID_DB) return v211Response;

  try {
    const member = await findCanonicalActiveMember(env.STARRY_ID_DB, amwayId);
    if (!member) return v211Response;

    const ready = await materializeCard(env.STARRY_ID_DB, member, amwayId);
    if (!ready) return v211Response;

    // Reuse the complete v211 public-card renderer so all privacy, tracking,
    // zodiac and view-log behaviour remains identical to native v211 cards.
    const rendered = await handleStarryIdV211(request, env);
    if (rendered && rendered.status !== 404) return rendered;
    return v211Response;
  } catch (error) {
    console.warn('Starry ID v212 public-card fallback:', error);
    return v211Response;
  }
}