import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 f22Window,normalizedF22Metrics,f22CentralSuperAdmin,
 f22Statistics,handleF22SpeakerUsage
} from '../worker/f22SpeakerUsageStatistics';

const backend=readFileSync(new URL('../worker/f22SpeakerUsageStatistics.ts',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/components/AiSpeakerUsageStatistics.tsx',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/components/AiSpeakerAdmin.tsx',import.meta.url),'utf8');
const main=readFileSync(new URL('../worker/starryMainInlineLoginRouter.ts',import.meta.url),'utf8');

test('F22 Taiwan time windows are local-midnight based, end is not in the future',()=>{
 const now=Date.parse('2026-10-19T20:55:00Z'); // Taiwan Oct 20, 04:55
 assert.equal(f22Window('today',now).start,Date.parse('2026-10-19T16:00:00Z'));
 assert.equal(f22Window('today',now).startDay,'2026-10-20');
 assert.equal(f22Window('7d',now).startDay,'2026-10-14');
 assert.equal(f22Window('30d',now).startDay,'2026-09-21');
 assert.equal(f22Window('all',now).start,0);
});
test('F22 distinguishes absent cost/latency/tokens from actual zero',()=>{
 const unknown=normalizedF22Metrics({calls:12,members:3,successes:10,failures:2,repeat30:2});
 assert.equal(unknown.calls,12);
 assert.equal(unknown.members,3);
 assert.equal(unknown.actualTwd,null);
 assert.equal(unknown.estimatedTwd,null);
 assert.equal(unknown.tokenCount,null);
 assert.equal(unknown.responseMs,null);
 assert.equal(unknown.fallbackCalls,null);
 assert.equal(unknown.costState,'no_history');
 assert.equal(normalizedF22Metrics({calls:0}).calls,0);
});
test('F22 API strictly denies without central membership even if Echo user exists',async()=>{
 const req=new Request('https://echo.starry.phd/api/admin/ai-speaker-usage');
 assert.equal(await f22CentralSuperAdmin(req,{}),false);
 const res=await handleF22SpeakerUsage(req,{});
 assert.equal(res?.status,403);
 assert.match(res?.headers.get('cache-control')||'',/no-store/);
 assert.equal(await res?.text(),'{"error":"central_super_admin_required"}');
});
test('F22 never exposes member questions or transcripts, uses four guarded read-only SQL queries',async()=>{
 const prepared:string[]=[];const calls:{kind:string;params:unknown[]}[]=[];
 const db={prepare:(sql:string)=>{prepared.push(sql);return{
  bind:(...params:unknown[])=>({
    first:async()=>{calls.push({kind:'first',params});return {calls:3,members:2,successes:2,failures:1,repeat30:1};},
    all:async()=>{calls.push({kind:'all',params});
      if(sql.includes('SELECT COUNT(*) AS n FROM ('))return {results:[{n:3}],meta:{rows_read:3}};
      if(sql.includes('AS title'))return {results:[{id:'audio-1',title:'音檔測試',speaker:'甲&乙',
        linkedSpeakers:'甲、乙',calls:3,members:2,successes:2,failures:1,repeat30:1}]};
      return {results:[{day:'2026-10-20',calls:3}]};
    }
  })
 }}};
 const data=await f22Statistics({DB:db},'7d','track','members',Date.parse('2026-10-20T02:00:00Z'));
 assert.equal(calls.length,4);
 assert.equal(data.rows[0].calls,3);
 assert.deepEqual(data.rows[0].linkedSpeakers,['甲','乙']);
 assert.equal(data.totals.members,2);
 assert.equal(data.rows[0].actualTwd,null);
 assert.equal(data.trend[0].calls,3);
 assert.ok(prepared.every(sql=>sql.includes('qa_claims INDEXED BY qa_claims_day')));
 assert.ok(prepared.every(sql=>sql.includes('createdAt>=?')&&sql.includes('createdAt<?')));
 assert.ok(prepared.every(sql=>!/\b(insert|update|delete|alter|create)\b/i.test(sql)));
 assert.ok(prepared.every(sql=>!/\b(content|question|prompt|api_key)\b/i.test(sql)));
 assert.match(prepared.find(x=>x.includes('AS title'))||'',/SELECT GROUP_CONCAT\(ts\.speakerName/);
 assert.ok(prepared.some(x=>x.includes('LIMIT 60')));
 assert.ok(prepared.some(x=>x.includes('LIMIT 6000')));
 assert.ok(prepared.some(x=>x.includes('LIMIT ?')));
});
test('F22 multi speaker cannot double-count or invent individual QA attribution',async()=>{
 const sql:string[]=[];
 const db={prepare:(text:string)=>{sql.push(text);return {bind:()=>({
  first:async()=>({calls:2,members:1}),
  all:async()=>text.includes('SELECT COUNT(*) AS n FROM (')?{results:[{n:2}],meta:{rows_read:2}}:{results:[]}
 })}}};
 await f22Statistics({DB:db},'today','speaker','calls');
 const owned=sql.find(x=>x.includes('speaker_count'));
 assert.ok(owned);
 assert.match(owned||'',/COUNT\(\*\) AS n/);
 assert.match(owned||'',/WHEN sc\.n>1/);
 assert.match(owned||'',/多人演講（未歸屬）/);
 assert.match(owned||'',/COUNT\(DISTINCT CASE WHEN identity LIKE 'member:%'/);
});
test('F22 is wired only into admin audio workspace, isolated from B07/AI7',()=>{
 assert.match(page,/AiSpeakerUsageStatistics/);
 assert.match(page,/subtab==='usage'/);
 assert.match(main,/handleF22SpeakerUsage/);
 assert.match(main,/\/api\/admin\/ai-speaker-usage/);
 assert.match(ui,/md:grid-cols-4/);
 assert.match(ui,/lg:grid-cols-2/);
 assert.match(ui,/aria-expanded/);
 assert.match(ui,/成本|費用/);
 assert.match(backend,/STARRY_ID_DB/);
 assert.match(backend,/centralRole==='super-admin'/);
 assert.doesNotMatch(backend,/starry_ai_b07_calls|starry_backup_/);
 assert.doesNotMatch(ui,/熱門 AI 學習問題/);
});
