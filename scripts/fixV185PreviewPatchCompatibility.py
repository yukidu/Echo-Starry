from pathlib import Path


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text)


def once(path, old, new):
    text = read(path)
    if old not in text:
        raise SystemExit(f'Compatibility pattern not found in {path}: {old[:140]!r}')
    write(path, text.replace(old, new, 1))


# 1) Keep favoriteRouter exactly on its original responsibility.
# New v185 metadata must not force every track request through a D1 schema migration.
once(
    'worker/favoriteRouter.ts',
    """      if (!columns.has('favoriteCount')) {
        try { await db.prepare('ALTER TABLE tracks ADD COLUMN favoriteCount INTEGER DEFAULT 0').run(); }
        catch (error) {
          const check = await db.prepare('PRAGMA table_info(tracks)').all();
          if (!check.results.some((row: any) => row.name === 'favoriteCount')) throw error;
        }
      }
      if (!columns.has('authorizedOnlyVisible')) {
        try { await db.prepare('ALTER TABLE tracks ADD COLUMN authorizedOnlyVisible INTEGER DEFAULT 0').run(); }
        catch (error) {
          const check = await db.prepare('PRAGMA table_info(tracks)').all();
          if (!check.results.some((row: any) => row.name === 'authorizedOnlyVisible')) throw error;
        }
      }
      if (!columns.has('socialLinks')) {
        try { await db.prepare("ALTER TABLE tracks ADD COLUMN socialLinks TEXT DEFAULT '[]'").run(); }
        catch (error) {
          const check = await db.prepare('PRAGMA table_info(tracks)').all();
          if (!check.results.some((row: any) => row.name === 'socialLinks')) throw error;
        }
      }""",
    """      if (!columns.has('favoriteCount')) {
        try { await db.prepare('ALTER TABLE tracks ADD COLUMN favoriteCount INTEGER DEFAULT 0').run(); }
        catch (error) {
          const check = await db.prepare('PRAGMA table_info(tracks)').all();
          if (!check.results.some((row: any) => row.name === 'favoriteCount')) throw error;
        }
      }"""
)
once(
    'worker/favoriteRouter.ts',
    """    const favoriteAction = url.pathname.match(/^\/api\/tracks\/([^/]+)\/favorite$/);
    const trackRoute = url.pathname === '/api/tracks' || url.pathname.startsWith('/api/tracks/');

    if (!favoriteAction && !trackRoute) return appWorker.fetch(request, env);""",
    """    const favoriteAction = url.pathname.match(/^\/api\/tracks\/([^/]+)\/favorite$/);
    const trackList = url.pathname === '/api/tracks' && method === 'GET';

    if (!favoriteAction && !trackList) return appWorker.fetch(request, env);"""
)
once(
    'worker/favoriteRouter.ts',
    "    if (!favoriteAction) return appWorker.fetch(request, env);\n",
    "    if (trackList) return appWorker.fetch(request, env);\n"
)

# 2) Persist v185 track extras inside the existing externalFiles JSON column.
# This keeps the D1 schema unchanged and preserves old VIP/track mocks and production data.
helper_anchor = """function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: CORS_HEADERS
  });
}
"""
helper_code = helper_anchor + """

const V185_TRACK_META_NAME = '__ECHOSTARS_V185_META__';

function decodeTrackExtras(value: any) {
  let items: any[] = [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    items = Array.isArray(parsed) ? parsed : [];
  } catch {
    items = [];
  }

  const metaItem = items.find(item => item && typeof item === 'object' && item.name === V185_TRACK_META_NAME);
  let meta: any = {};
  if (metaItem) {
    try {
      meta = JSON.parse(String(metaItem.url || '{}'));
    } catch {
      meta = {};
    }
  }

  return {
    externalFiles: items.filter(item => !(item && typeof item === 'object' && item.name === V185_TRACK_META_NAME)),
    socialLinks: Array.isArray(meta.socialLinks) ? meta.socialLinks : [],
    authorizedOnlyVisible: Boolean(meta.authorizedOnlyVisible)
  };
}

function encodeTrackExtras(externalFiles: any[], socialLinks: any[], authorizedOnlyVisible: boolean) {
  const visibleFiles = (Array.isArray(externalFiles) ? externalFiles : [])
    .filter(item => !(item && typeof item === 'object' && item.name === V185_TRACK_META_NAME));
  const links = Array.isArray(socialLinks) ? socialLinks : [];
  if (!authorizedOnlyVisible && links.length === 0) return visibleFiles;
  return [
    ...visibleFiles,
    {
      name: V185_TRACK_META_NAME,
      url: JSON.stringify({ authorizedOnlyVisible: Boolean(authorizedOnlyVisible), socialLinks: links })
    }
  ];
}
"""
once('worker/index.ts', helper_anchor, helper_code)

# Track list: expose decoded public fields, never expose the reserved metadata item.
once(
    'worker/index.ts',
    """                  externalFiles: t.externalFiles ? JSON.parse(t.externalFiles) : [],
                  socialLinks: t.socialLinks ? JSON.parse(t.socialLinks) : [],
                  likedBy: t.likedBy ? JSON.parse(t.likedBy) : [],""",
    """                  ...decodeTrackExtras(t.externalFiles),
                  likedBy: t.likedBy ? JSON.parse(t.likedBy) : [],"""
)
once(
    'worker/index.ts',
    """                  guestVisible: Boolean(t.guestVisible),
                  authorizedOnlyVisible: Boolean(t.authorizedOnlyVisible),
                  isPrivateVip: Boolean(t.isPrivateVip)""",
    """                  guestVisible: Boolean(t.guestVisible),
                  isPrivateVip: Boolean(t.isPrivateVip)"""
)

# Track creation: keep the old 34-column INSERT and encode extras into externalFiles.
once(
    'worker/index.ts',
    """                  externalVideos, externalPpts, externalFiles, likedBy, ratings, vipToken, vipExpiresAt, vipDurationDays, keywordMeta, guestVisible, socialLinks, authorizedOnlyVisible
                ) VALUES (${Array(36).fill('?').join(', ')})""",
    """                  externalVideos, externalPpts, externalFiles, likedBy, ratings, vipToken, vipExpiresAt, vipDurationDays, keywordMeta, guestVisible
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"""
)
once(
    'worker/index.ts',
    """                JSON.stringify(newTrack.externalPpts), JSON.stringify(newTrack.externalFiles),
                JSON.stringify(newTrack.likedBy), JSON.stringify(newTrack.ratings), newTrack.vipToken, newTrack.vipExpiresAt, newTrack.vipDurationDays, JSON.stringify(newTrack.keywordMeta), newTrack.guestVisible ? 1 : 0, JSON.stringify(newTrack.socialLinks), newTrack.authorizedOnlyVisible ? 1 : 0
""",
    """                JSON.stringify(newTrack.externalPpts), JSON.stringify(encodeTrackExtras(newTrack.externalFiles, newTrack.socialLinks, newTrack.authorizedOnlyVisible)),
                JSON.stringify(newTrack.likedBy), JSON.stringify(newTrack.ratings), newTrack.vipToken, newTrack.vipExpiresAt, newTrack.vipDurationDays, JSON.stringify(newTrack.keywordMeta), newTrack.guestVisible ? 1 : 0
"""
)

# Partial edit: derive current extras from externalFiles and commit one compatible externalFiles write.
once(
    'worker/index.ts',
    """            if (has('authorizedOnlyVisible') && typeof body.authorizedOnlyVisible !== 'boolean') return errorResponse('只對有權限者顯示格式錯誤', 400);
            const nextAuthorizedOnlyVisible = has('authorizedOnlyVisible') ? body.authorizedOnlyVisible === true : Boolean(existing.authorizedOnlyVisible);
            if (has('authorizedOnlyVisible')) add('authorizedOnlyVisible', nextAuthorizedOnlyVisible ? 1 : 0);
            if (has('guestVisible')) {
              if (typeof body.guestVisible !== 'boolean') return errorResponse('訪客可見格式錯誤', 400);
              add('guestVisible', nextAuthorizedOnlyVisible ? 0 : (body.guestVisible ? 1 : 0));
            } else if (nextAuthorizedOnlyVisible && Boolean(existing.guestVisible)) {
              add('guestVisible', 0);
            }""",
    """            if (has('authorizedOnlyVisible') && typeof body.authorizedOnlyVisible !== 'boolean') return errorResponse('只對有權限者顯示格式錯誤', 400);
            if (has('socialLinks') && !Array.isArray(body.socialLinks)) return errorResponse('socialLinks 格式錯誤', 400);
            const existingExtras = decodeTrackExtras(existing.externalFiles);
            const nextAuthorizedOnlyVisible = has('authorizedOnlyVisible') ? body.authorizedOnlyVisible === true : existingExtras.authorizedOnlyVisible;
            const nextSocialLinks = has('socialLinks') ? body.socialLinks : existingExtras.socialLinks;
            if (has('guestVisible')) {
              if (typeof body.guestVisible !== 'boolean') return errorResponse('訪客可見格式錯誤', 400);
              add('guestVisible', nextAuthorizedOnlyVisible ? 0 : (body.guestVisible ? 1 : 0));
            } else if (nextAuthorizedOnlyVisible && Boolean(existing.guestVisible)) {
              add('guestVisible', 0);
            }
            if (has('authorizedOnlyVisible') || has('socialLinks') || has('externalFiles')) {
              const nextExternalFiles = has('externalFiles') ? body.externalFiles : existingExtras.externalFiles;
              if (!Array.isArray(nextExternalFiles)) return errorResponse('externalFiles 格式錯誤', 400);
              add('externalFiles', JSON.stringify(encodeTrackExtras(nextExternalFiles, nextSocialLinks, nextAuthorizedOnlyVisible)));
            }"""
)
once(
    'worker/index.ts',
    "            for (const field of ['externalVideos', 'externalPpts', 'externalFiles', 'socialLinks'] as const) {",
    "            for (const field of ['externalVideos', 'externalPpts'] as const) {"
)
once(
    'worker/index.ts',
    """              externalFiles: parseArray(row.externalFiles),
              socialLinks: parseArray(row.socialLinks),
              likedBy: parseArray(row.likedBy),""",
    """              ...decodeTrackExtras(row.externalFiles),
              likedBy: parseArray(row.likedBy),"""
)
once(
    'worker/index.ts',
    """              ratings: parseObject(row.ratings),
              guestVisible: Boolean(row.guestVisible),
              authorizedOnlyVisible: Boolean(row.authorizedOnlyVisible),
              isPrivateVip: Boolean(row.isPrivateVip)""",
    """              ratings: parseObject(row.ratings),
              guestVisible: Boolean(row.guestVisible),
              isPrivateVip: Boolean(row.isPrivateVip)"""
)

# 3) The Preview storage policy changed by explicit user decision: Preview intentionally
# shares Production D1/R2/KV. Retire only obsolete assertions that demand isolation.
# The replacement v185 test below verifies the new policy positively.
for test_path in Path('tests').glob('*.test.ts'):
    text = test_path.read_text()
    needle = "test('preview configuration stays isolated from production storage bindings'"
    if needle in text:
        test_path.write_text(text.replace(needle, "test.skip('preview configuration stays isolated from production storage bindings'", 1))

# The visible tab was deliberately renamed from 其他規則 to 其他.
for test_path in Path('tests').glob('*.test.ts'):
    text = test_path.read_text()
    if '其他規則' in text:
        test_path.write_text(text.replace('其他規則', '其他'))

# Strengthen the new v185 regression with the current explicit Preview storage policy.
v185_test = Path('tests/v185PermissionProfileSocial.test.ts')
text = v185_test.read_text()
if "import { readFileSync } from 'node:fs';" not in text:
    text = text.replace("import assert from 'node:assert/strict';\n", "import assert from 'node:assert/strict';\nimport { readFileSync } from 'node:fs';\n", 1)
if "固定 Preview 使用 preview 環境標記但共用正式 D1/R2/KV" not in text:
    text += """

test('固定 Preview 使用 preview 環境標記但共用正式 D1/R2/KV', () => {
  const wrangler = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  assert.match(wrangler, /\[previews\.vars\][\s\S]*ENVIRONMENT = \"preview\"/);
  assert.equal((wrangler.match(/database_id = \"e0a696a9-0233-4186-be4d-229435b19a27\"/g) || []).length, 2);
  assert.equal((wrangler.match(/bucket_name = \"echoes-audio-bucket\"/g) || []).length, 2);
  assert.equal((wrangler.match(/id = \"a2e345e244cb40b4a804be3f89584b90\"/g) || []).length, 2);
});
"""
v185_test.write_text(text)

print('Applied v185 compatibility fixes without changing the D1 tracks schema')
