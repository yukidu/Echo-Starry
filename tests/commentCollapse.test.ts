import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const collapsible = readFileSync(new URL('../src/components/CollapsibleCommentText.tsx', import.meta.url), 'utf8');
const comments = readFileSync(new URL('../src/components/CommentsSection.tsx', import.meta.url), 'utf8');
const profile = readFileSync(new URL('../src/components/ProfileModal.tsx', import.meta.url), 'utf8');
const member = readFileSync(new URL('../src/components/MemberPreviewModal.tsx', import.meta.url), 'utf8');
const homePreview = readFileSync(new URL('../src/components/CommentPreviewModal.tsx', import.meta.url), 'utf8');
const learningExport = readFileSync(new URL('../src/utils/memberLearningCardExport.ts', import.meta.url), 'utf8');

test('long web comments collapse to three lines and can expand/collapse', () => {
  assert.match(collapsible, /lines = 3/);
  assert.match(collapsible, /element\.scrollHeight > limit \+ 1/);
  assert.match(collapsible, /moreLabel = '更多'/);
  assert.match(collapsible, /lessLabel = '收起'/);
  assert.match(collapsible, /aria-expanded=\{expanded\}/);
  assert.match(collapsible, /mt-1 ml-auto block w-fit/);
});

test('all requested web comment surfaces use the shared collapsible renderer', () => {
  for (const source of [comments, profile, member, homePreview]) {
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
