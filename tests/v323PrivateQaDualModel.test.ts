import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isQaTestOwner } from '../worker/aiSpeakerQaTestRouter';

const source=(name:string)=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const privateRouter=source('worker/aiSpeakerQaTestRouter.ts');
const qaRouter=source('worker/aiSpeakerQaRouter.ts');
const entry=source('worker/starryMainInlineLoginRouter.ts');
const comments=source('src/components/CommentsSection.tsx');

test('only the specified authenticated super administrator can access private tests',()=>{
  assert.equal(isQaTestOwner(null),false);
  assert.equal(isQaTestOwner({email:'other@example.com',role:'超級管理員'}),false);
  assert.equal(isQaTestOwner({email:'yukidu@gmail.com',role:'會員'}),true);
  assert.match(privateRouter,/await actor\(req,env\)/);
  assert.match(privateRouter,/if\(!isQaTestOwner\(user\)\)return json/);
  assert.match(privateRouter,/req\.headers\.get\('Origin'\)!==url\.origin/);
});
test('private questions have isolated storage, no public comments and no battery deductions',()=>{
  assert.match(privateRouter,/qa_private_test_entries/);
  assert.match(privateRouter,/qa_private_test_daily/);
  assert.match(privateRouter,/WHERE ownerId=\? AND trackId=\? AND model=\?/);
  assert.doesNotMatch(privateRouter,/battery_transactions|INSERT INTO comments|processQaAfterComment/);
  assert.match(comments,/if \(qaTestModel\) \{/);
  assert.match(comments,/\/api\/qa\/test/);
  assert.match(comments,/qaTestEntries\.map/);
  assert.match(entry,/handleQaTestRequest/);
  assert.match(qaRouter,/export async function excerpts/);
});
test('models are fixed and never silently switch to fallback in a test',()=>{
  assert.match(privateRouter,/gpt-6-luna/);
  assert.match(privateRouter,/@cf\/zai-org\/glm-4\.7-flash/);
  assert.match(privateRouter,/max_output_tokens:750,store:false/);
  assert.match(privateRouter,/const DAILY_LIMIT = 30/);
  assert.doesNotMatch(privateRouter,/generateQaAnswer\(/);
  assert.match(privateRouter,/await excerpts\(env,track,user,mode,question\)/);
  assert.match(privateRouter,/formatQaAnswer\(generated/);
});
