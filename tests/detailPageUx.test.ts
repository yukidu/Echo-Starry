import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const detail = readFileSync(new URL('../src/components/DetailView.tsx', import.meta.url), 'utf8');
const comments = readFileSync(new URL('../src/components/CommentsSection.tsx', import.meta.url), 'utf8');
test('detail page mobile interaction rules', () => { assert.match(detail, /thumbTouchRadius = 28/); assert.match(detail, /onPointerDown=\{handleScrubberPointerDown\}/); assert.match(detail, /grid-cols-\[1fr_auto_1fr\]/); assert.match(detail, /showDetailKeywords, setShowDetailKeywords\] = useState\(false\)/); assert.match(detail, /<span>編輯<\/span>/); assert.doesNotMatch(detail, />演講資訊與備註</); assert.match(detail, /if \(!raw\) return '';/); });
test('comment composer and rows are compact and readable', () => { assert.doesNotMatch(comments, /送出心得/); assert.match(comments, /'送出'/); assert.match(comments, /w-10 h-10 rounded-full object-cover/); assert.match(comments, /h-10 min-w-0 flex flex-col justify-center/); assert.match(comments, /text-base text-slate-700[\s\S]*leading-snug pl-12/); });
