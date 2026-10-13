import privacyWorker from './privacyCrawlerRouter';
import type { Env } from './index';

type StarryV212Env = Env & { STARRY_ID_DB?: any };

const STAR_DOMAIN = 'id.starry.phd';
const RESERVED_SLUGS = new Set(['api', 'robots.txt', 'login', 'logout', 'admin', 'manifest.webmanifest', 'favicon.ico', 'assets']);
const NUMBER_CARD_RE = /^n[1-9][0-9]*$/;

function text(value: unknown) {
  return value == null ? '' : String(value).trim();
}

function lower(value: unknown) {
  return text(value).toLowerCase();
}

function slugify(value: unknown) {
  const result = lower(value)
    .normalize('NFKC')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return RESERVED_SLUGS.has(result) ? '' : result;
}

export function v212PublicSlug(request: Request) {
  const url = new URL(request.url);
  if (url.hostname !== STAR_DOMAIN || request.method.toUpperCase() !== 'GET') return '';
  if (url.pathname === '/' || url.pathname.startsWith('/api/') || url.pathname === '/robots.txt') return '';

  let raw = '';
  try {
    raw = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ''));
  } catch {
    return '';
  }
  if (!raw || raw.includes('/')) return '';

  const normalized = lower(raw);
  if (!normalized || slugify(normalized) !== normalized || RESERVED_SLUGS.has(normalized)) return '';
  return normalized;
}

async function readCardBySlug(db: any, slug: string) {
  return db.prepare('SELECT seq,userId,slug,cardNumber FROM public_cards WHERE slug=? LIMIT 1').bind(slug).first();
}

async function readCardByUser(db: any, userId: string) {
  return db.prepare('SELECT seq,userId,slug,cardNumber FROM public_cards WHERE userId=? LIMIT 1').bind(userId).first();
}

async function readActiveMember(db: any, userId: string) {
  return db.prepare(`SELECT u.id,u.status,p.amwayId
    FROM users u LEFT JOIN profiles p ON p.userId=u.id
    WHERE u.id=? AND u.status='active' LIMIT 1`).bind(userId).first();
}

async function findActiveMemberByAmwayId(db: any, slug: string) {
  const result: any = await db.prepare(`SELECT u.id,u.status,p.amwayId
    FROM users u JOIN profiles p ON p.userId=u.id
    WHERE u.status='active' AND LOWER(TRIM(COALESCE(p.amwayId,'')))=?
    LIMIT 2`).bind(slug).all();
  const rows = result?.results || [];
  if (rows.length !== 1) return null;
  return slugify(rows[0].amwayId) === slug ? rows[0] : null;
}

async function syncCardToMember(db: any, member: any) {
  const desired = slugify(member?.amwayId);
  if (!desired) return null;

  const collision: any = await db.prepare('SELECT userId FROM public_cards WHERE slug=? LIMIT 1').bind(desired).first();
  if (collision && text(collision.userId) !== text(member.id)) return null;

  let card: any = await readCardByUser(db, member.id);
  const now = Date.now();
  if (!card) {
    const temporary = `pending-${crypto.randomUUID()}`;
    await db.prepare('INSERT INTO public_cards (userId,slug,cardNumber,createdAt,updatedAt) VALUES (?,?,?,?,?)')
      .bind(member.id, temporary, temporary, now, now).run();
    card = await readCardByUser(db, member.id);
    if (!card) return null;
    const number = `n${Number(card.seq)}`;
    await db.prepare('UPDATE public_cards SET slug=?,cardNumber=?,updatedAt=? WHERE userId=?')
      .bind(desired, number, now, member.id).run();
    return { ...card, slug: desired, cardNumber: number };
  }

  if (card.slug !== desired) {
    await db.prepare('UPDATE public_cards SET slug=?,updatedAt=? WHERE userId=?')
      .bind(desired, now, member.id).run();
    card.slug = desired;
  }
  return card;
}

async function repairExistingCardUrl(request: Request, env: StarryV212Env, slug: string) {
  const db = env.STARRY_ID_DB;
  if (!db) return null;
  try {
    const card: any = await readCardBySlug(db, slug);
    if (!card) return null;
    const member: any = await readActiveMember(db, card.userId);
    if (!member) return null;

    const desired = slugify(member.amwayId) || lower(card.cardNumber);
    if (!desired || desired === slug) return null;

    const collision: any = await db.prepare('SELECT userId FROM public_cards WHERE slug=? LIMIT 1').bind(desired).first();
    if (collision && text(collision.userId) !== text(card.userId)) return null;

    await db.prepare('UPDATE public_cards SET slug=?,updatedAt=? WHERE userId=?')
      .bind(desired, Date.now(), card.userId).run();
    const next = new URL(request.url);
    next.pathname = `/${desired}`;
    next.search = '';
    return Response.redirect(next.toString(), 308);
  } catch {
    // v211 creates the card tables lazily. A first-ever request can arrive before
    // that bootstrap, so the normal v211 router runs below and prepares schema.
    return null;
  }
}

async function materializeAmwayCardAfterV211Bootstrap(env: StarryV212Env, slug: string) {
  const db = env.STARRY_ID_DB;
  if (!db || NUMBER_CARD_RE.test(slug)) return false;
  try {
    const member = await findActiveMemberByAmwayId(db, slug);
    if (!member) return false;
    const card = await syncCardToMember(db, member);
    return Boolean(card && card.slug === slug);
  } catch (error) {
    console.warn('Starry ID v212 public-card materialization failed', {
      code: error instanceof Error ? error.message : 'unknown'
    });
    return false;
  }
}

export default {
  async fetch(request: Request, env: StarryV212Env, ctx?: any): Promise<Response> {
    const slug = v212PublicSlug(request);
    if (!slug || !env.STARRY_ID_DB) return privacyWorker.fetch(request, env, ctx);

    const redirect = await repairExistingCardUrl(request, env, slug);
    if (redirect) return redirect;

    // Let v211 handle every existing card normally. On the first request for an
    // older Amway member, v211 also guarantees public_cards/visibility schema exists.
    const first = await privacyWorker.fetch(request, env, ctx);
    if (first.status !== 404 || NUMBER_CARD_RE.test(slug)) return first;

    // v212 compatibility bridge: existing Starry ID members may predate v211 and
    // therefore have an Amway ID but no public_cards row yet. Materialize it on
    // demand, then re-run the unchanged v211 renderer so field privacy stays intact.
    const created = await materializeAmwayCardAfterV211Bootstrap(env, slug);
    if (!created) return first;
    return privacyWorker.fetch(request, env, ctx);
  }
};
