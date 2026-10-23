import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectRelevantQaEvidence } from '../shared/qaEvidenceSelection';

const evidence = [
  { score: 0, part: '【無關會員私密資料】不可傳給模型', title: '無關內容' },
  { score: -1, part: '不相關內容', title: '不相關' },
];
test('AI2 QA: unknown question gives empty prompt, never unrelated evidence', () => {
  assert.deepEqual(selectRelevantQaEvidence(evidence, ['詢問'], 7), { prompt: '', sources: [] });
});
test('AI2 QA: missing searchable terms must not fall back to any transcript', () => {
  const available = [{ score: 9, part: '【私密】敏感內容', title: 'private' }];
  assert.deepEqual(selectRelevantQaEvidence(available, [], 7), { prompt: '', sources: [] });
});
test('AI2 QA: evidence selector filters unrelated snippets even when another matches', () => {
  const input = [
    { score: 0, part: '無關文件', title: '不要回傳' },
    { score: 2, part: '【安全片段】報名前先看日期', title: '正確' },
    { score: Number.NaN, part: '損壞檔案', title: '不要回傳' },
  ];
  assert.deepEqual(selectRelevantQaEvidence(input, ['報名'], 7),
    { prompt: '【安全片段】報名前先看日期', sources: ['正確'] });
});
test('AI2 QA: invalid score and query fail closed', () => {
  assert.deepEqual(selectRelevantQaEvidence([{score:Infinity,part:'x',title:'x'}],['合理'],7),
    { prompt:'',sources:[] });
  assert.deepEqual(selectRelevantQaEvidence([{score:1,part:'x',title:'x'}],['?'],7),
    { prompt:'',sources:[] });
  assert.deepEqual(selectRelevantQaEvidence([{score:1,part:'x',title:'x'}],['查詢'],0),
    { prompt:'',sources:[] });
});
test('AI2 QA: no evidence means comment QA stops before paid provider', () => {
  const source = readFileSync('worker/aiSpeakerQaRouter.ts', 'utf8');
  assert.match(source, /return selectRelevantQaEvidence\(found,terms,mode==='all'\?9:7\)/);
  assert.match(source, /if\(!source\.prompt\)\{await fail\(env,q,comment\.id,'尚未有可引用的逐字稿'\);return;\}/);
  assert.match(source, /if\(!source\.prompt\)return json\(\{error:'選定音檔沒有可用的逐字稿'\},422\)/);
  const guard = source.indexOf('if(!source.prompt){await fail(');
  const provider = source.indexOf('const result=await generateQaWithQuality(', guard);
  assert.ok(guard >= 0 && provider > guard, 'provider must run after evidence guard');
});
