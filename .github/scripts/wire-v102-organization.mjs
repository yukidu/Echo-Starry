import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Missing source for ${label}`);
  return source.replace(search, replacement);
}

// Route organization requests through their own router before sticker handling.
const categoryPath='worker/categoryIntegrityRouter.ts';
let category=readFileSync(categoryPath,'utf8');
category=replaceOnce(category,"import appWorker from './stickerRouter';","import appWorker from './organizationRouter';",'category router chain');
writeFileSync(categoryPath,category);

// Sticker grants use canonical organization bindings first, with legacy name matching only as compatibility fallback.
const stickerPath='worker/stickerRouter.ts';
let sticker=readFileSync(stickerPath,'utf8');
sticker=replaceOnce(sticker,
  "import { canonicalProgressPercent } from '../shared/learningProgress';\n",
  "import { canonicalProgressPercent } from '../shared/learningProgress';\nimport { canonicalDownlineUserIds, isCanonicalDownlineOf } from './organizationModel';\n",
  'organization imports');
sticker=replaceOnce(sticker,
`    const { results } = await db.prepare('SELECT id, name, email, rank, approvedRank, platinumUpline, diamondUpline FROM users WHERE COALESCE(isBlocked, 0) = 0 ORDER BY name').all();
    const targets = isSuperAdmin(actor)
      ? (results || [])
      : (results || []).filter((target: any) => target.id !== actor.id && isDownlineOf(target, actor));
    return json({ targets });`,
`    const { results } = await db.prepare('SELECT id, name, email, rank, approvedRank, platinumUpline, diamondUpline FROM users WHERE COALESCE(isBlocked, 0) = 0 ORDER BY name').all();
    const canonicalIds = isSuperAdmin(actor) ? new Set<string>() : new Set(await canonicalDownlineUserIds(db, actor.id));
    const targets = isSuperAdmin(actor)
      ? (results || [])
      : (results || []).filter((target: any) => target.id !== actor.id && (canonicalIds.has(target.id) || isDownlineOf(target, actor)));
    return json({ targets });`,
  'canonical grant targets');
sticker=replaceOnce(sticker,
`      if (target.id === actor.id) return json({ error: '不可幫自己加貼紙' }, 403);
      if (!isDownlineOf(target, actor)) return json({ error: '白金以上會員只能幫自己的下線會員加貼紙' }, 403);`,
`      if (target.id === actor.id) return json({ error: '不可幫自己加貼紙' }, 403);
      const canonicalDownline = await isCanonicalDownlineOf(db, target.id, actor.id);
      if (!canonicalDownline && !isDownlineOf(target, actor)) return json({ error: '白金以上會員只能幫自己的下線會員加貼紙' }, 403);`,
  'canonical grant authorization');
writeFileSync(stickerPath,sticker);

// Deleting a member also detaches only that member from the shared organization.
const deletePath='worker/adminUserDeleteRouter.ts';
let deletion=readFileSync(deletePath,'utf8');
delection=replaceOnce(deletion,
  "import type { Env } from './index';\n",
  "import type { Env } from './index';\nimport { deleteOrganizationStateForUser } from './organizationModel';\n",
  'delete organization import');
delection=replaceOnce(deletion,
`  statements.push(env.DB.prepare('DELETE FROM users WHERE id = ?').bind(target.id));
  await env.DB.batch(statements);

  return json({`,
`  statements.push(env.DB.prepare('DELETE FROM users WHERE id = ?').bind(target.id));
  await env.DB.batch(statements);
  await deleteOrganizationStateForUser(env.DB, target.id);

  return json({`,
  'delete organization cleanup');
writeFileSync(deletePath,deletion);

console.log('Organization router wired cleanly');
