// S-NEXT-A01 AI7: standalone SYNTHETIC backup safety simulation. No Cloudflare/API/storage access.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const sha = s => createHash('sha256').update(s).digest('hex');
const full = {id:'F1',kind:'FULL',parent:null,app:'echo',data:'FAKE_AUDIO_A',hash:sha('FAKE_AUDIO_A'),seq:10};
const delta = {id:'D2',kind:'DELTA',parent:'F1',app:'echo',data:'FAKE_AUDIO_B',hash:sha('FAKE_AUDIO_B'),seq:11};
const delta2 = {id:'D3',kind:'DELTA',parent:'D2',app:'echo',data:'FAKE_AUDIO_C',hash:sha('FAKE_AUDIO_C'),seq:12};
const base = () => ({
  app:'echo', chain:[{...full},{...delta},{...delta2}], target:'D3',
  centralDbCopied:false, centralLedgerRollback:false, secretCopied:false,
  currentDeletionSeq:12, backupDeletionSeq:12, currentRevocationSeq:12, backupRevocationSeq:12,
  head:{seq:12,verified:true,fresh:true,independent:true}, floor:{seq:12,verified:true,fresh:true,independent:true},
  admins:[{human:'HUMAN_A',valid:true,approved:true},{human:'HUMAN_B',valid:true,approved:true}],
  claimFresh:true, doLeaseClear:true, workflowClaimClear:true, epochCurrent:3, epochBackup:3,
  apiCompatible:true, oauthCompatible:true, cookieCompatible:true, singleWriter:true,
  authorityReachable:true, resourceOwner:'echo'
});
function preflight(s) {
  if(s.app!=='echo'||s.resourceOwner!=='echo'||s.centralDbCopied||s.centralLedgerRollback||s.secretCopied) return 'OWNERSHIP';
  if(!s.apiCompatible||!s.oauthCompatible||!s.cookieCompatible||!s.singleWriter||!s.authorityReachable) return 'MIGRATION';
  if(!s.head?.verified||!s.head.fresh||!s.head.independent||!s.floor?.verified||!s.floor.fresh||!s.floor.independent||s.head.seq!==s.floor.seq) return 'WITNESS';
  if(s.admins?.length!==2||s.admins.some(a=>!a.valid||!a.approved)||new Set(s.admins.map(a=>a.human)).size!==2) return 'TWO_HUMANS';
  if(!s.claimFresh||!s.doLeaseClear||!s.workflowClaimClear) return 'IN_FLIGHT';
  if(s.epochBackup!==s.epochCurrent||s.backupDeletionSeq<s.currentDeletionSeq||s.backupRevocationSeq<s.currentRevocationSeq) return 'ROLLBACK';
  const m=new Map(s.chain.map(x=>[x.id,x]));
  if(m.size!==s.chain.length||!m.has(s.target)) return 'CHAIN';
  let id=s.target,seen=new Set(),lastSeq=Infinity,hasFull=false;
  while(id){
    if(seen.has(id)) return 'CHAIN';
    seen.add(id);
    const n=m.get(id);
    if(!n||n.app!==s.app||n.seq>=lastSeq||sha(n.data)!==n.hash) return 'CHAIN';
    lastSeq=n.seq;
    if(n.kind==='FULL') {if(n.parent!==null) return 'CHAIN';hasFull=true;break;}
    if(n.kind!=='DELTA'||!n.parent) return 'CHAIN';
    id=n.parent;
  }
  if(!hasFull||seen.size!==m.size) return 'CHAIN';
  return 'SIMULATED_ELIGIBLE_ONLY';
}
const cases = [
 ['valid full delta chain',()=>{},'SIMULATED_ELIGIBLE_ONLY'],
 ['missing delta parent',s=>{s.chain.splice(1,1)},'CHAIN'],
 ['missing full',s=>{s.chain.splice(0,1)},'CHAIN'],
 ['corrupt full bytes',s=>{s.chain[0].data='TAMPERED'},'CHAIN'],
 ['corrupt delta bytes',s=>{s.chain[1].data='TAMPERED'},'CHAIN'],
 ['corrupt last delta bytes',s=>{s.chain[2].data='TAMPERED'},'CHAIN'],
 ['orphan extra delta',s=>{s.chain.push({...delta,id:'ORPHAN'})},'CHAIN'],
 ['duplicate backup id',s=>{s.chain.push({...delta})},'CHAIN'],
 ['cycle delta parent',s=>{s.chain[1].parent='D3'},'CHAIN'],
 ['nonmonotonic chain seq',s=>{s.chain[1].seq=13},'CHAIN'],
 ['cross app backup',s=>{s.chain[1].app='download'},'CHAIN'],
 ['central D1 copy',s=>{s.centralDbCopied=true},'OWNERSHIP'],
 ['central ledger rollback',s=>{s.centralLedgerRollback=true},'OWNERSHIP'],
 ['secret copied',s=>{s.secretCopied=true},'OWNERSHIP'],
 ['cross app resource owner',s=>{s.resourceOwner='id'},'OWNERSHIP'],
 ['old deletion tombstone',s=>{s.backupDeletionSeq=11},'ROLLBACK'],
 ['old revocation watermark',s=>{s.backupRevocationSeq=11},'ROLLBACK'],
 ['old restore epoch',s=>{s.epochBackup=2},'ROLLBACK'],
 ['missing highest head',s=>{s.head.verified=false},'WITNESS'],
 ['stale highest head',s=>{s.head.fresh=false},'WITNESS'],
 ['third floor missing',s=>{s.floor.verified=false},'WITNESS'],
 ['head floor fork',s=>{s.floor.seq=11},'WITNESS'],
 ['same human twice',s=>{s.admins[1].human='HUMAN_A'},'TWO_HUMANS'],
 ['second human absent',s=>{s.admins.pop()},'TWO_HUMANS'],
 ['approval expired',s=>{s.admins[1].valid=false},'TWO_HUMANS'],
 ['claim replay',s=>{s.claimFresh=false},'IN_FLIGHT'],
 ['DO in flight',s=>{s.doLeaseClear=false},'IN_FLIGHT'],
 ['workflow in flight',s=>{s.workflowClaimClear=false},'IN_FLIGHT'],
 ['OAuth callback mismatch',s=>{s.oauthCompatible=false},'MIGRATION'],
 ['cookie incompatibility',s=>{s.cookieCompatible=false},'MIGRATION'],
 ['Starry ID API unreachable',s=>{s.authorityReachable=false},'MIGRATION'],
 ['dual writer risk',s=>{s.singleWriter=false},'MIGRATION'],
 ['untrusted head custody',s=>{s.head.independent=false},'WITNESS'],
 ['untrusted floor custody',s=>{s.floor.independent=false},'WITNESS']
];
for(const [name,mutate,expected] of cases) test('SYNTHETIC '+name,()=>{const state=base();mutate(state);assert.equal(preflight(state),expected);});
test('simulation never performs restore/delete',()=>{assert.equal(typeof preflight(base()),'string');assert.equal(preflight(base()),'SIMULATED_ELIGIBLE_ONLY');});
