from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1):
    p = Path(path)
    text = p.read_text()
    actual = text.count(old)
    if actual < count:
        raise SystemExit(f"{path}: expected at least {count}, found {actual}: {old[:120]!r}")
    p.write_text(text.replace(old, new, count))


# Shared display formatter keeps API timestamp canonical while presenting the requested three-line layout.
p = Path('shared/commentTime.ts')
text = p.read_text()
addition = """

export function formatCommentTimestampDisplay(source: CommentTimestampSource): string[] {
  const canonical = formatCommentTimestamp(source);
  const match = canonical.match(/^(\\d{4})\\/(\\d{2})\\/(\\d{2}) (\\d{2}:\\d{2})$/);
  if (!match) return [canonical];
  return [`${match[1]}年`, `${Number(match[2])}月/${Number(match[3])}日`, match[4]];
}
"""
if 'export function formatCommentTimestampDisplay' not in text:
    p.write_text(text.rstrip() + addition + '\n')

# Comment UI: three-line time, tighter like/reply spacing, larger heart.
replace(
    'src/components/CommentsSection.tsx',
    "import { CollapsibleCommentText } from './CollapsibleCommentText';",
    "import { CollapsibleCommentText } from './CollapsibleCommentText';\nimport { formatCommentTimestampDisplay } from '../../shared/commentTime';"
)
replace(
    'src/components/CommentsSection.tsx',
    "            const isClickable = !!registeredAuthor;",
    "            const isClickable = !!registeredAuthor;\n            const timestampLines = formatCommentTimestampDisplay(c);"
)
replace(
    'src/components/CommentsSection.tsx',
    '            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono whitespace-nowrap leading-none">{c.timestamp}</span>',
    '            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono leading-[1.15] text-center">{timestampLines.map((line, index) => <span key={`${c.id}-time-${index}`} className="block whitespace-nowrap">{line}</span>)}</span>'
)
replace(
    'src/components/CommentsSection.tsx',
    '<div className="flex items-center gap-1 shrink-0 pt-0.5">',
    '<div className="flex items-center gap-0 shrink-0 pt-0.5">'
)
replace(
    'src/components/CommentsSection.tsx',
    'className={`flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-lg transition-colors cursor-pointer ${userLiked',
    'className={`flex items-center gap-0.5 text-[11px] px-0.5 py-0.5 rounded-lg transition-colors cursor-pointer ${userLiked'
)
replace(
    'src/components/CommentsSection.tsx',
    '<Heart className={`w-3 h-3 ${userLiked ? \'fill-rose-500 text-rose-500\' : \'\'}`} />',
    '<Heart className={`w-5 h-5 ${userLiked ? \'fill-rose-500 text-rose-500\' : \'\'}`} />'
)
replace(
    'src/components/CommentsSection.tsx',
    'className="flex items-center gap-0.5 text-[11px] text-slate-400 hover:text-[var(--color-primary,#c06c84)] px-1.5 py-0.5 rounded-lg',
    'className="flex items-center gap-0 text-[11px] text-slate-400 hover:text-[var(--color-primary,#c06c84)] px-0.5 py-0.5 rounded-lg'
)

# Regression coverage.
replace(
    'tests/commentTimestamp.test.ts',
    "import { formatCommentTimestamp } from '../shared/commentTime';",
    "import { formatCommentTimestamp, formatCommentTimestampDisplay } from '../shared/commentTime';"
)
replace(
    'tests/commentTimestamp.test.ts',
    "  assert.equal(formatCommentTimestamp({ timestamp: '剛剛' }), '時間未知');",
    "  assert.equal(formatCommentTimestamp({ timestamp: '剛剛' }), '時間未知');\n  assert.deepEqual(formatCommentTimestampDisplay({ createdAt }), ['2026年', '10月/4日', '23:14']);"
)
p = Path('tests/commentTimestamp.test.ts')
text = p.read_text()
if "comment time layout and actions follow the mobile presentation rules" not in text:
    text += """

test('comment time layout and actions follow the mobile presentation rules', () => {
  const comments = readFileSync(new URL('../src/components/CommentsSection.tsx', import.meta.url), 'utf8');
  assert.match(comments, /formatCommentTimestampDisplay\\(c\\)/);
  assert.match(comments, /timestampLines\\.map/);
  assert.match(comments, /Heart className=\\{`w-5 h-5/);
  assert.match(comments, /flex items-center gap-0 shrink-0 pt-0\\.5/);
});
"""
    p.write_text(text)

# Release note and PWA cache bump.
replace('public/sw.js', "echostars-shell-v87", "echostars-shell-v88")
replace('tests/releaseIntegrity.test.ts', "test('v87 is the single current PWA cache version'", "test('v88 is the single current PWA cache version'")
replace('tests/releaseIntegrity.test.ts', "echostars-shell-v87", "echostars-shell-v88")
replace(
    'src/changelogReleaseNotes.ts',
    "    '心得時間顯示修正：過去部分心得會把「剛剛」永久存進資料，造成幾分鐘、幾天後仍顯示錯誤時間。現在所有心得統一依真正建立時間換算台灣日期與時間；心得區獎銜也固定單行顯示，不再拆成兩三行。',",
    "    '心得時間顯示修正：過去部分心得會把「剛剛」永久存進資料，造成幾分鐘、幾天後仍顯示錯誤時間。現在所有心得統一依真正建立時間換算台灣日期與時間；心得區獎銜也固定單行顯示，不再拆成兩三行。',\n    '心得留言時間版面再調整：時間改成「年份／月日／時分」三行顯示；按讚與回覆操作靠得更近，按讚愛心同步放大，手機閱讀與操作更清楚。',"
)
