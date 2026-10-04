from pathlib import Path


def replace(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    actual = text.count(old)
    if actual < count:
        raise SystemExit(f"{path}: expected {count}, found {actual}: {old[:100]!r}")
    p.write_text(text.replace(old, new, count))


Path('shared/commentTime.ts').write_text("""export type CommentTimestampSource = {
  createdAt?: unknown;
  timestamp?: unknown;
};

function createdAtMilliseconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === 'string' && value.trim()) {
    const clean = value.trim();
    const numeric = Number(clean);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(clean);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

const taipeiDateTime = new Intl.DateTimeFormat('zh-TW-u-ca-gregory', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

export function formatCommentTimestamp(source: CommentTimestampSource): string {
  const createdAt = createdAtMilliseconds(source?.createdAt);
  if (createdAt !== null) {
    const parts = Object.fromEntries(
      taipeiDateTime.formatToParts(new Date(createdAt))
        .filter(part => part.type !== 'literal')
        .map(part => [part.type, part.value])
    ) as Record<string, string>;
    if (parts.year && parts.month && parts.day && parts.hour && parts.minute) {
      return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
    }
  }
  const legacy = String(source?.timestamp || '').trim();
  if (legacy && legacy !== '剛剛' && legacy !== '剛才') return legacy;
  return '時間未知';
}
""")

replace('worker/community.ts',
        "import { legacyData } from '../shared/legacyData';\n",
        "import { legacyData } from '../shared/legacyData';\nimport { formatCommentTimestamp } from '../shared/commentTime';\n")
replace('worker/community.ts',
        "const normalizeComment = (row: any) => ({ ...row, isAdmin: Boolean(row.isAdmin), likedBy: parse(row.likedBy, []) });",
        "const normalizeComment = (row: any) => ({ ...row, timestamp: formatCommentTimestamp(row), isAdmin: Boolean(row.isAdmin), likedBy: parse(row.likedBy, []) });")
old = "const comment = { id: `c-${crypto.randomUUID()}`, trackId: target, authorName: body.authorName || '訪客', authorAvatar: body.authorAvatar || '👤', authorBadge: body.authorBadge || '', authorEmail: body.authorEmail || '', deviceId: body.deviceId || '', content: body.content.trim(), timestamp: '剛剛', createdAt: Date.now(), replyToId: body.replyToId || null, replyToAuthor: body.replyToAuthor || null, isAdmin: !!body.isAdmin, likes: 0, likedBy: [] };"
new = "const createdAt = Date.now();\n      const comment = { id: `c-${crypto.randomUUID()}`, trackId: target, authorName: body.authorName || '訪客', authorAvatar: body.authorAvatar || '👤', authorBadge: body.authorBadge || '', authorEmail: body.authorEmail || '', deviceId: body.deviceId || '', content: body.content.trim(), timestamp: formatCommentTimestamp({ createdAt }), createdAt, replyToId: body.replyToId || null, replyToAuthor: body.replyToAuthor || null, isAdmin: !!body.isAdmin, likes: 0, likedBy: [] };"
replace('worker/community.ts', old, new)

replace('server.ts',
        "import { shareMetadata } from './shared/shareMetadata';\n",
        "import { shareMetadata } from './shared/shareMetadata';\nimport { formatCommentTimestamp } from './shared/commentTime';\n")
replace('server.ts',
        "  const newComment: Comment = {\n    id: `c-${Date.now()}`",
        "  const createdAt = Date.now();\n  const newComment: Comment = {\n    id: `c-${createdAt}`")
replace('server.ts',
        "    timestamp: '剛剛',\n    createdAt: Date.now(),",
        "    timestamp: formatCommentTimestamp({ createdAt }),\n    createdAt,")

replace('src/components/CommentsSection.tsx',
        'font-medium whitespace-normal leading-tight">{displayAuthorBadge}</span>',
        'font-medium whitespace-nowrap shrink-0 leading-tight">{displayAuthorBadge}</span>')

replace('public/sw.js', 'echostars-shell-v86', 'echostars-shell-v87')
replace('tests/releaseIntegrity.test.ts', 'v86 is the single current PWA cache version', 'v87 is the single current PWA cache version')
replace('tests/releaseIntegrity.test.ts', 'echostars-shell-v86', 'echostars-shell-v87')

anchor = "    '迷你播放器與心得閱讀再優化：回頂端與首頁按鈕移到播放器左側，右側新增關閉播放器 X，音檔標題跟隨調色盤主色；心得頭像再放大、留言時間移到頭像下方，姓名與本文同尺寸、獎銜縮小，更多與收起增加方向三角形。',\n"
note = "    '心得時間顯示修正：過去部分心得會把「剛剛」永久存進資料，造成幾分鐘、幾天後仍顯示錯誤時間。現在所有心得統一依真正建立時間換算台灣日期與時間；心得區獎銜也固定單行顯示，不再拆成兩三行。',\n"
replace('src/changelogReleaseNotes.ts', anchor, anchor + note)

Path('tests/commentTimestamp.test.ts').write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatCommentTimestamp } from '../shared/commentTime';

test('comment timestamps use canonical createdAt in Taiwan time instead of a frozen just-now label', () => {
  const createdAt = Date.UTC(2026, 9, 4, 15, 14, 0);
  assert.equal(formatCommentTimestamp({ createdAt, timestamp: '剛剛' }), '2026/10/04 23:14');
  assert.equal(formatCommentTimestamp({ createdAt: Math.floor(createdAt / 1000) }), '2026/10/04 23:14');
  assert.equal(formatCommentTimestamp({ timestamp: '2026/10/04 22:00' }), '2026/10/04 22:00');
  assert.equal(formatCommentTimestamp({ timestamp: '剛剛' }), '時間未知');
});

test('production comment API derives every returned timestamp from createdAt', () => {
  const worker = readFileSync(new URL('../worker/community.ts', import.meta.url), 'utf8');
  assert.match(worker, /timestamp: formatCommentTimestamp\\(row\\)/);
  assert.match(worker, /const createdAt = Date\\.now\\(\\)/);
  assert.match(worker, /timestamp: formatCommentTimestamp\\(\\{ createdAt \\}\\), createdAt/);
  assert.doesNotMatch(worker, /timestamp: '剛剛'/);
});

test('comment rank badge is forced onto one line', () => {
  const comments = readFileSync(new URL('../src/components/CommentsSection.tsx', import.meta.url), 'utf8');
  assert.match(comments, /displayAuthorBadge[^\\n]*whitespace-nowrap shrink-0|whitespace-nowrap shrink-0[^\\n]*displayAuthorBadge/);
  assert.doesNotMatch(comments, /displayAuthorBadge[^\\n]*whitespace-normal/);
});
""")
