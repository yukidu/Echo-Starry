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

async function findUniqueActiveMember(db: any, amwayId: string) {
  const result: any = await db.prepare(`SELECT u.id,p.amwayId
    FROM users u
    JOIN profiles p ON p.userId=u.id
    WHERE u.status='active' AND TRIM(COALESCE(p.amwayId,''))=?
    LIMIT 2`).bind(amwayId).all();
  const rows = result?.results || [];
  if (rows.length !== 1 || text(rows[0].amwayId) !== amwayId) return null;
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

/**
 * Called only after v211 already returned a response. A 404 on a safe numeric
 * public slug can mean an older central member has an Amway ID but has never
 * opened card settings, so no public_cards row exists yet. Create that row and
 * immediately hand rendering back to v211 so the same privacy rules/UI apply.
 */
export async function handleStarryIdV212PublicCardFallback(
  request: Request,
  env: StarryV212Env,
  v211Response: Response
): Promise<Response | null> {
  if (v211Response.status !== 404 || !env.STARRY_ID_DB) return null;
  const slug = v212PublicAmwaySlug(request);
  if (!slug) return null;

  try {
    const member = await findUniqueActiveMember(env.STARRY_ID_DB, slug);
    if (!member) return null;

    const ready = await materializeCard(env.STARRY_ID_DB, member, slug);
    if (!ready) return null;

    const rendered = await handleStarryIdV211(request, env);
    return rendered && rendered.status !== 404 ? rendered : null;
  } catch (error) {
    console.warn('Starry ID v212 public-card fallback:', error);
    return null;
  }
}
