import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatCommentTimestamp, formatCommentTimestampDisplay } from '../shared/commentTime';

test('comment timestamps use canonical createdAt in Taiwan time instead of a frozen just-now label', () => {
  const createdAt = Date.UTC(2026, 9, 4, 15, 14, 0);
  assert.equal(formatCommentTimestamp({ createdAt, timestamp: '剛剛' }), '2026/10/04 23:14');
  assert.equal(formatCommentTimestamp({ createdAt: Math.floor(createdAt / 1000) }), '2026/10/04 23:14');
  assert.equal(formatCommentTimestamp({ timestamp: '2026/10/04 22:00' }), '2026/10/04 22:00');
  assert.equal(formatCommentTimestamp({ timestamp: '剛剛' }), '時間未知');
  assert.deepEqual(formatCommentTimestampDisplay({ createdAt }), ['2026年', '10月/4日', '23:14']);
});

test('production comment API derives every returned timestamp from createdAt', () => {
  const worker = readFileSync(new URL('../worker/community.ts', import.meta.url), 'utf8');
  assert.match(worker, /timestamp: formatCommentTimestamp\(row\)/);
  assert.match(worker, /const createdAt = Date\.now\(\)/);
  assert.match(worker, /timestamp: formatCommentTimestamp\(\{ createdAt \}\), createdAt/);
  assert.doesNotMatch(worker, /timestamp: '剛剛'/);
});

test('comment rank badge is forced onto one line', () => {
  const comments = readFileSync(new URL('../src/components/CommentsSection.tsx', import.meta.url), 'utf8');
  assert.match(comments, /displayAuthorBadge[^\n]*whitespace-nowrap shrink-0|whitespace-nowrap shrink-0[^\n]*displayAuthorBadge/);
  assert.doesNotMatch(comments, /displayAuthorBadge[^\n]*whitespace-normal/);
});


test('comment time, badge, actions and body follow the compact mobile layout', () => {
  const comments = readFileSync(new URL('../src/components/CommentsSection.tsx', import.meta.url), 'utf8');
  assert.match(comments, /formatCommentTimestampDisplay\(c\)/);
  assert.match(comments, /timestampLines\.map/);
  assert.match(comments, /grid grid-cols-\[3\.5rem_minmax\(0,1fr\)\]/);
  assert.match(comments, /ml-auto flex items-center justify-end gap-0\.5 shrink-0/);
  assert.match(comments, /Heart className=\{`w-5 h-5/);
  assert.match(comments, /Reply className="w-5 h-5"/);
  assert.match(comments, /className="flex items-center gap-0\.5 text-base leading-none[^\n]*<Reply/);
  assert.match(comments, /className="text-base[^\n]*whitespace-pre-wrap mt-1\.5 break-words"/);
  assert.match(comments, /text-\[8px\][^\n]*font-mono leading-\[1\.05\]/);
  assert.match(comments, /stripLegacyAutoReplyMention/);
  assert.match(comments, /await onAddComment\(question, replyingTo\?\.id,/);
  assert.match(comments, /qaMode!==\x27off\x27&&speakerOptions\.length>1/);
  assert.match(comments, /renderFormattedContent\(displayContent\)/);
  assert.doesNotMatch(comments, /setInputText\(`@\$\{displayAuthorName\} `\)/);
  assert.doesNotMatch(comments, /回覆 @\$\{replyingTo\.authorName\}/);
  assert.doesNotMatch(comments, /c\.replyToAuthor && <span/);
  assert.doesNotMatch(comments, /pl-16 whitespace-pre-wrap/);
});
