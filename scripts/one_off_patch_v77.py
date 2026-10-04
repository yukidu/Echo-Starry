from pathlib import Path
import re

component = Path('src/components/CollapsibleCommentText.tsx')
component.write_text(r'''import React, { useLayoutEffect, useRef, useState } from 'react';

interface CollapsibleCommentTextProps {
  children: React.ReactNode;
  className?: string;
  lines?: number;
  resetKey?: React.Key;
  moreLabel?: string;
  lessLabel?: string;
}

export const CollapsibleCommentText: React.FC<CollapsibleCommentTextProps> = ({
  children,
  className = '',
  lines = 3,
  resetKey,
  moreLabel = '更多',
  lessLabel = '收起'
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [canToggle, setCanToggle] = useState(false);
  const [collapsedHeight, setCollapsedHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    setExpanded(false);
  }, [resetKey]);

  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element || typeof window === 'undefined') return;

    const measure = () => {
      const style = window.getComputedStyle(element);
      const parsedLineHeight = Number.parseFloat(style.lineHeight);
      const fontSize = Number.parseFloat(style.fontSize) || 14;
      const lineHeight = Number.isFinite(parsedLineHeight) ? parsedLineHeight : fontSize * 1.5;
      const limit = Math.max(1, lines) * lineHeight;
      setCollapsedHeight(limit);
      setCanToggle(element.scrollHeight > limit + 1);
    };

    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [children, lines, expanded]);

  return (
    <div className="min-w-0">
      <div
        ref={contentRef}
        className={className}
        style={!expanded && collapsedHeight !== null ? { maxHeight: `${collapsedHeight}px`, overflow: 'hidden' } : undefined}
      >
        {children}
      </div>
      {canToggle && (
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          className="mt-1 text-xs font-extrabold text-[var(--color-primary,#c06c84)] hover:underline cursor-pointer"
          aria-expanded={expanded}
        >
          {expanded ? lessLabel : moreLabel}
        </button>
      )}
    </div>
  );
};
''')

comments = Path('src/components/CommentsSection.tsx')
text = comments.read_text()
anchor = "import { VisitorIdentity } from '../utils/visitor';\n"
if "./CollapsibleCommentText" not in text:
    assert anchor in text, 'CommentsSection import anchor not found'
    text = text.replace(anchor, anchor + "import { CollapsibleCommentText } from './CollapsibleCommentText';\n", 1)
old = '''                  <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed pl-6 whitespace-pre-wrap mt-0.5 break-words">
                    {c.replyToAuthor && <span className="text-[11px] text-[var(--color-primary,#c06c84)] font-bold mr-1.5">回覆 @{c.replyToAuthor}：</span>}
                    {renderFormattedContent(c.content)}
                  </div>'''
new = '''                  <CollapsibleCommentText
                    className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed pl-6 whitespace-pre-wrap mt-0.5 break-words"
                    resetKey={`${c.id}:${c.content}`}
                  >
                    {c.replyToAuthor && <span className="text-[11px] text-[var(--color-primary,#c06c84)] font-bold mr-1.5">回覆 @{c.replyToAuthor}：</span>}
                    {renderFormattedContent(c.content)}
                  </CollapsibleCommentText>'''
assert old in text, 'CommentsSection comment display block not found'
comments.write_text(text.replace(old, new, 1))

profile = Path('src/components/ProfileModal.tsx')
text = profile.read_text()
anchor = "import { AvatarCropModal } from './AvatarCropModal';\n"
if "./CollapsibleCommentText" not in text:
    assert anchor in text, 'ProfileModal import anchor not found'
    text = text.replace(anchor, anchor + "import { CollapsibleCommentText } from './CollapsibleCommentText';\n", 1)
old = '''                          <div className="bg-white/80 dark:bg-slate-900/60 p-2 rounded-xl border border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                            {c.replyToAuthor && (
                              <span className="text-[11px] text-[var(--color-primary,#c06c84)] font-bold mr-1">
                                回覆 @{c.replyToAuthor}：
                              </span>
                            )}
                            {c.content}
                          </div>'''
new = '''                          <CollapsibleCommentText
                            className="bg-white/80 dark:bg-slate-900/60 p-2 rounded-xl border border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap"
                            resetKey={`${c.id}:${c.content}`}
                          >
                            {c.replyToAuthor && (
                              <span className="text-[11px] text-[var(--color-primary,#c06c84)] font-bold mr-1">
                                回覆 @{c.replyToAuthor}：
                              </span>
                            )}
                            {c.content}
                          </CollapsibleCommentText>'''
assert old in text, 'ProfileModal comment display block not found'
profile.write_text(text.replace(old, new, 1))

member = Path('src/components/MemberPreviewModal.tsx')
text = member.read_text()
anchor = "import { NumerologyGrid } from './NumerologyGrid';\n"
if "./CollapsibleCommentText" not in text:
    assert anchor in text, 'MemberPreviewModal import anchor not found'
    text = text.replace(anchor, anchor + "import { CollapsibleCommentText } from './CollapsibleCommentText';\n", 1)
old = '''                      <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap pl-2 border-l-2 border-[var(--color-primary,#c06c84)]">
                        {c.content}
                      </p>'''
new = '''                      <CollapsibleCommentText
                        className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap pl-2 border-l-2 border-[var(--color-primary,#c06c84)]"
                        resetKey={`${c.id}:${c.content}`}
                      >
                        {c.content}
                      </CollapsibleCommentText>'''
assert old in text, 'MemberPreviewModal comment display block not found'
member.write_text(text.replace(old, new, 1))

export_file = Path('src/utils/memberLearningCardExport.ts')
text = export_file.read_text()
pattern = re.compile(r"function measureRecordHeight\(ctx: CanvasRenderingContext2D, item: Item, no: number, w: number\) \{.*?\n\}\n\nfunction drawRecord\(ctx: CanvasRenderingContext2D, item: Item, no: number, x: number, y: number, w: number\) \{.*?\n\}\n\nexport async function exportMemberLearningCard", re.S)
replacement = r'''function measureRecordHeight(ctx: CanvasRenderingContext2D, item: Item, no: number, w: number) {
  ctx.font = `bold 14.5px ${font}`;
  const titleLines = wrapText(ctx, recordTitle(item, no), w - 20);
  const comment = String(item.record.comment || '').trim();
  ctx.font = `12px ${font}`;
  const commentLines = comment ? wrapText(ctx, `心得：${comment}`, w - 20) : [];
  return 10 + titleLines.length * 17 + 16 + 16 + (commentLines.length ? commentLines.length * 15 + 2 : 0) + 7;
}

function drawRecord(ctx: CanvasRenderingContext2D, item: Item, no: number, x: number, y: number, w: number) {
  const { track, record } = item;
  ctx.font = `bold 14.5px ${font}`;
  const titleLines = wrapText(ctx, recordTitle(item, no), w - 20);
  const comment = String(record.comment || '').trim();
  ctx.font = `12px ${font}`;
  const commentLines = comment ? wrapText(ctx, `心得：${comment}`, w - 20) : [];
  const h = 10 + titleLines.length * 17 + 16 + 16 + (commentLines.length ? commentLines.length * 15 + 2 : 0) + 7;

  ctx.strokeStyle = '#d6d6d6';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#000';
  ctx.font = `bold 14.5px ${font}`;
  titleLines.forEach((line, index) => ctx.fillText(line, x + 10, y + 17 + index * 17));

  let cursor = y + 17 + titleLines.length * 17;
  const progress = Math.round(canonicalProgressPercent(record as any, {
    id: track.id,
    title: track.title,
    speaker: track.speaker,
    speakerRank: track.speakerRank,
    durationSeconds: track.durationSeconds
  }));
  const done = progress >= 95 || Boolean(record.completed || record.finishDate);

  ctx.font = `12px ${font}`;
  ctx.fillStyle = '#333';
  ctx.fillText(`首次：${date(record.firstListenDate)}   最近：${date(record.lastListenDate)}   ${done ? '已聽完' : '未聽完'}`, x + 10, cursor);
  cursor += 16;

  const rating = record.rating && record.rating > 0
    ? '★'.repeat(Math.min(5, Math.max(0, Math.round(record.rating))))
    : '未評價';
  ctx.fillText(`進度：${done ? 100 : progress}%   評價：${rating}`, x + 10, cursor);
  cursor += 16;

  if (commentLines.length) {
    ctx.fillStyle = '#555';
    commentLines.forEach((line, index) => ctx.fillText(line, x + 10, cursor + index * 15));
  }
  return h;
}

export async function exportMemberLearningCard'''
text, count = pattern.subn(replacement, text, count=1)
assert count == 1, f'learning card record renderer replacement count={count}'
export_file.write_text(text)

sw = Path('public/sw.js')
sw.write_text(sw.read_text().replace("echostars-shell-v76", "echostars-shell-v77"))

release = Path('tests/releaseIntegrity.test.ts')
text = release.read_text()
text = text.replace("test('v76 is the single current PWA cache version'", "test('v77 is the single current PWA cache version'")
text = text.replace("echostars-shell-v76", "echostars-shell-v77")
release.write_text(text)

changelog = Path('src/changelogReleaseNotes.ts')
text = changelog.read_text()
marker = "    '個人中心的「上手白金」與「上手鑽石」改為真正可用的關聯詞提示：輸入或點進欄位時，會從現有會員姓名與既有上手資料中自動顯示符合候選詞，可直接點選帶入。'"
addition = marker + ",\n    '心得留言過長時，音檔詳細頁、自己的個人中心與查閱他人學習資料卡都先顯示前三行，可按「更多」展開全文、再按「收起」縮回。匯出個人學習卡則不截斷，會依完整心得內容自動換行並增加圖卡高度。'"
if '心得留言過長時，音檔詳細頁' not in text:
    assert marker in text, 'changelog marker not found'
    text = text.replace(marker, addition, 1)
changelog.write_text(text)

test = Path('tests/commentCollapse.test.ts')
test.write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const collapsible = readFileSync(new URL('../src/components/CollapsibleCommentText.tsx', import.meta.url), 'utf8');
const comments = readFileSync(new URL('../src/components/CommentsSection.tsx', import.meta.url), 'utf8');
const profile = readFileSync(new URL('../src/components/ProfileModal.tsx', import.meta.url), 'utf8');
const member = readFileSync(new URL('../src/components/MemberPreviewModal.tsx', import.meta.url), 'utf8');
const learningExport = readFileSync(new URL('../src/utils/memberLearningCardExport.ts', import.meta.url), 'utf8');

test('long web comments collapse to three lines and can expand/collapse', () => {
  assert.match(collapsible, /lines = 3/);
  assert.match(collapsible, /element\.scrollHeight > limit \+ 1/);
  assert.match(collapsible, /moreLabel = '更多'/);
  assert.match(collapsible, /lessLabel = '收起'/);
  assert.match(collapsible, /aria-expanded=\{expanded\}/);
});

test('all three requested web comment surfaces use the shared collapsible renderer', () => {
  for (const source of [comments, profile, member]) {
    assert.match(source, /CollapsibleCommentText/);
    assert.match(source, /resetKey=\{`\$\{c\.id\}:\$\{c\.content\}`\}/);
  }
  assert.match(comments, /renderFormattedContent\(c\.content\)/);
});

test('personal learning card export keeps the full comment instead of truncating it', () => {
  assert.doesNotMatch(learningExport, /short\(record\.comment/);
  assert.match(learningExport, /wrapText\(ctx, `心得：\$\{comment\}`, w - 20\)/);
  assert.match(learningExport, /commentLines\.length \* 15/);
  assert.match(learningExport, /commentLines\.forEach\(\(line, index\) => ctx\.fillText/);
});
''')
