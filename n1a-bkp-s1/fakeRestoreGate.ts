/**
 * AI7 N1A-S1. Standalone, OFF, fake-only restore/witness simulation.
 * No Cloudflare imports, network, real identity, migration, backup, restore, or DELETE.
 * In particular no claim that injected hashes or source IDs are genuine signatures.
 */
export const N1A_BKP_RUNTIME_ENABLED = false as const;

export type Version = string;
export type MockEventKind =
  | 'epoch_reserve' | 'member_revoke_pending' | 'member_deleted'
  | 'track_revoke_pending' | 'track_deleted' | 'correction_changed';
export type MockEvent = Readonly<{
  seq: Version; kind: MockEventKind; target: string;
  prevHash: string; hash: string;
}>;
export type MockWitness = Readonly<{
  sourceId: string; headSeq: Version; headHash: string;
  restoreEpoch: Version; minStarryIdRevision: Version;
  observedAtMs: number; events: readonly MockEvent[];
}>;
export type MockIndependentHead = Readonly<{
  sourceId: string; headSeq: Version; headHash: string;
  restoreEpoch: Version; observedAtMs: number;
}>;
/** Separate persisted minimum watermark outside both simulated head snapshots.
 * This is still caller-injected Fake evidence, NOT a real WORM/cryptographic root.
 */
export type MockTrustedFloor = Readonly<{
  sourceId: string; headSeq: Version; headHash: string;
  restoreEpoch: Version; observedAtMs: number;
}>;
export type FakeIdRecord = Readonly<{
  id: string; active: boolean; centralSuperAdmin: boolean;
}>;
export type MockStarryId = Readonly<{
  revision: Version; observedAtMs: number;
  members: readonly FakeIdRecord[];
}>;
export type MockBackupFile = Readonly<{
  key: string; sha256: string; bytes: number; trackId: string;
  memberIds: readonly string[]; review: 'published' | 'approved-history' | 'candidate';
}>;
export type MockBackup = Readonly<{
  id: string; parentId: string | null; kind: 'full' | 'delta';
  createdAtMs: number; state: 'verified-success' | 'partial' | 'failed';
  securitySeq: Version; files: readonly MockBackupFile[];
}>;
export type MockApproval = Readonly<{
  reviewerId: string; requestId: string; backupId: string;
  manifestHash: string; headHash: string; restoreEpoch: Version;
  reviewerIdRevision: Version; decision: 'approve' | 'deny';
  approvedAtMs: number;
}>;
export type MockLock = Readonly<{
  searchLocked: boolean; publicReadsLocked: boolean;
  publicationsLocked: boolean; cleanupLocked: boolean;
  restoreEpoch: Version;
}>;
export type MockEnvironment = Readonly<{
  readWitness(stage: 'before' | 'after'): Promise<MockWitness | null>;
  readIndependentHead(stage: 'before' | 'after'): Promise<MockIndependentHead | null>;
  readTrustedFloor(stage: 'before' | 'after'): Promise<MockTrustedFloor | null>;
  readStarryId(stage: 'before' | 'after'): Promise<MockStarryId | null>;
  readFakeR2(key: string): Promise<string | null>;
  /** Must be atomic in an explicitly shared FAKE ledger, not local per-call state.
   * Claim only after every fake validation succeeds; fail-closed if unavailable.
   */
  claimFakeReviewOnce(requestId: string): Promise<boolean>;
}>;
export type SimulatedRestoreInput = Readonly<{
  nowMs: number; freshnessMs: number; approvalAgeMs: number;
  requestId: string; selectedBackupId: string; lastGoodId: string;
  manifestHash: string; backups: readonly MockBackup[];
  approvals: readonly MockApproval[]; lock: MockLock;
  retentionDays: 7 | 30 | 90;
  env: MockEnvironment;
}>;
export type SimulatedRestoreDecision = Readonly<{
  simulatedEligible: boolean; productionAuthorized: false; sideEffects: 0;
  restoreLocked: true; reasons: readonly string[];
  retentionCandidates: readonly string[]; verifiedFileCount: number;
}>;

const MAX_U64 = (1n << 64n) - 1n;
const HEAD_GENESIS = 'GENESIS';
const SHA = /^[a-f0-9]{64}$/;
const uniq = (xs: readonly string[]) => new Set(xs).size === xs.length;
const numeric = (v: number) => Number.isSafeInteger(v) && v >= 0;
export function isCanonicalBkpVersion(s: unknown): s is string {
  if (typeof s !== 'string' || !/^(0|[1-9][0-9]*)$/.test(s)) return false;
  try { return BigInt(s) <= MAX_U64; } catch { return false; }
}
const fresh = (observed: number, now: number, age: number) =>
  numeric(observed) && numeric(now) && numeric(age) && age > 0 &&
  observed <= now && now - observed <= age;
export async function sha256FakeText(s: string): Promise<string> {
  const out = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(out)].map(v=>v.toString(16).padStart(2, '0')).join('');
}
export async function fakeEventHash(e: Omit<MockEvent, 'hash'>): Promise<string> {
  return sha256FakeText(JSON.stringify([e.seq,e.kind,e.target,e.prevHash]));
}

function validateRetentionTopology(backups: readonly MockBackup[]): boolean {
  const map = new Map<string,MockBackup>();
  for(const b of backups) {
    if(!b.id || map.has(b.id) || !numeric(b.createdAtMs) ||
       b.state!=='verified-success'||!isCanonicalBkpVersion(b.securitySeq)) return false;
    map.set(b.id,b);
  }
  for(const b of backups) {
    const visited=new Set<string>(); let cur:MockBackup|undefined=b;
    while(cur) {
      if(visited.has(cur.id)) return false;
      visited.add(cur.id);
      if(cur.parentId===null) {
        if(cur.kind!=='full') return false;
        break;
      }
      if(cur.kind!=='delta') return false;
      const parent:MockBackup|undefined=map.get(cur.parentId);
      if(!parent || parent.createdAtMs>cur.createdAtMs) return false;
      cur=parent;
    }
  }
  return true;
}
function selectedChain(backups:readonly MockBackup[],selectedId:string):
  { chain:MockBackup[];valid:boolean } {
  const byId=new Map(backups.map(x=>[x.id,x]));
  const chain:MockBackup[]=[];const seen=new Set<string>();let id:string|null=selectedId;
  while(id!==null) {
    if(seen.has(id)) return {chain,valid:false};seen.add(id);
    const b=byId.get(id);if(!b)return{chain,valid:false};
    chain.push(b);id=b.parentId;
  }
  chain.reverse();
  return {chain,valid:chain.length>0 && chain[0].kind==='full' &&
    chain.every((b,i)=>b.state==='verified-success' &&
      (i===0?b.parentId===null:b.kind==='delta'&&b.parentId===chain[i-1].id))};
}
function safeRetention(backups:readonly MockBackup[],selectedId:string,now:number,days:7|30|90):string[]{
  const keep=new Set<string>();const byId=new Map(backups.map(x=>[x.id,x]));
  for(const b of backups)if(now-b.createdAtMs<=days*86400000)keep.add(b.id);
  keep.add(selectedId);
  for(const id of [...keep]) {
    let cur:string|null=id;
    const seen=new Set<string>();
    while(cur!==null && !seen.has(cur)) {
      seen.add(cur);
      keep.add(cur);
      cur=byId.get(cur)?.parentId??null;
    }
  }
  return backups.filter(b=>!keep.has(b.id)).map(b=>b.id).sort();
}

async function inspectWitness(w:MockWitness|null,h:MockIndependentHead|null,
  floor:MockTrustedFloor|null,now:number,age:number,errors:Set<string>):Promise<void>{
  if(!w||!h){errors.add('AUTHORITY_MISSING');return;}
  if(!floor){errors.add('TRUST_FLOOR_MISSING');return;}
  // Three independently retained fake records must agree about the latest HEAD;
  // matching two mutually rolled-back records is insufficient.
  if(!w.sourceId||!h.sourceId||!floor.sourceId||
     new Set([w.sourceId,h.sourceId,floor.sourceId]).size!==3)
    errors.add('WITNESS_NOT_INDEPENDENT');
  if(!fresh(w.observedAtMs,now,age)||!fresh(h.observedAtMs,now,age)||
     !fresh(floor.observedAtMs,now,age))
    errors.add('WITNESS_STALE');
  for(const v of [w.headSeq,w.restoreEpoch,w.minStarryIdRevision,
     h.headSeq,h.restoreEpoch,floor.headSeq,floor.restoreEpoch])
    if(!isCanonicalBkpVersion(v)) errors.add('WITNESS_VERSION_INVALID');
  if(w.headSeq!==floor.headSeq||w.headHash!==floor.headHash||
     w.restoreEpoch!==floor.restoreEpoch)
    errors.add('TRUST_FLOOR_MISMATCH');
  if(w.headSeq!==h.headSeq||w.headHash!==h.headHash||w.restoreEpoch!==h.restoreEpoch)
    errors.add('HEAD_DISAGREEMENT');
  if(!SHA.test(w.headHash)) errors.add('WITNESS_HASH_INVALID');
  let prev=HEAD_GENESIS;let seq=0n;
  if(w.events.length===0)errors.add('EVENT_CHAIN_MISSING');
  for(const ev of w.events){
    seq+=1n;
    if(!isCanonicalBkpVersion(ev.seq)||BigInt(ev.seq)!==seq||
       ev.prevHash!==prev||!ev.target.trim()||!SHA.test(ev.hash)){
      errors.add('EVENT_CHAIN_INVALID'); break;
    }
    const hash=await fakeEventHash({seq:ev.seq,kind:ev.kind,target:ev.target,prevHash:ev.prevHash});
    if(hash!==ev.hash){errors.add('EVENT_TAMPERED');break;}
    prev=ev.hash;
  }
  if(w.headSeq!==seq.toString()||w.headHash!==prev)errors.add('HEAD_CHAIN_MISMATCH');
}
function denyResult(errors:Set<string>,count:number):SimulatedRestoreDecision {
  return {simulatedEligible:errors.size===0,productionAuthorized:false,
    restoreLocked:true,sideEffects:0,reasons:[...errors].sort(),
    retentionCandidates:[],verifiedFileCount:count};
}

/** All inputs and readers are fake. Returned 'eligible' NEVER authorizes real restoration. */
export async function simulateN1aBackupGate(x:SimulatedRestoreInput):Promise<SimulatedRestoreDecision>{
  const errors=new Set<string>();let verified=0;
  const fail=(code:string)=>errors.add(code);
  if(!x.requestId.trim()||!fresh(x.nowMs,x.nowMs,1)||
     !numeric(x.freshnessMs)||x.freshnessMs===0||
     !numeric(x.approvalAgeMs)||x.approvalAgeMs===0)
    fail('INVALID_REQUEST');
  if(!x.lock.searchLocked||!x.lock.publicReadsLocked||
     !x.lock.publicationsLocked||!x.lock.cleanupLocked)fail('RESTORE_NOT_LOCKED');
  const structureValid=validateRetentionTopology(x.backups);
  if(!structureValid)fail('BACKUP_GRAPH_INVALID');
  const {chain,valid}=selectedChain(x.backups,x.selectedBackupId);
  if(!valid||x.selectedBackupId!==x.lastGoodId)fail('BACKUP_CHAIN_INVALID');
  const allApprovedFiles=chain.flatMap(b=>b.files.filter(f=>f.review!=='candidate'));
  if(!allApprovedFiles.length)fail('BACKUP_EMPTY');
  if(!SHA.test(x.manifestHash)||await sha256FakeText(JSON.stringify(x.backups))!==x.manifestHash)
    fail('MANIFEST_TAMPERED');

  let beforeW:MockWitness|null=null,beforeH:MockIndependentHead|null=null;
  let beforeFloor:MockTrustedFloor|null=null,beforeId:MockStarryId|null=null;
  try {
    [beforeW,beforeH,beforeFloor,beforeId]=await Promise.all([
      x.env.readWitness('before'),x.env.readIndependentHead('before'),
      x.env.readTrustedFloor('before'),x.env.readStarryId('before')]);
  }catch{fail('AUTHORITY_READ_FAILURE')}
  await inspectWitness(beforeW,beforeH,beforeFloor,x.nowMs,x.freshnessMs,errors);
  if(!beforeId||!fresh(beforeId.observedAtMs,x.nowMs,x.freshnessMs)||
     !isCanonicalBkpVersion(beforeId.revision))fail('STARRY_ID_UNKNOWN');
  if(beforeW&&beforeId&&isCanonicalBkpVersion(beforeId.revision)&&
     isCanonicalBkpVersion(beforeW.minStarryIdRevision)&&
     BigInt(beforeId.revision)<BigInt(beforeW.minStarryIdRevision))
    fail('STARRY_ID_ROLLBACK');
  if(beforeW&&x.lock.restoreEpoch!==beforeW.restoreEpoch)fail('LOCK_EPOCH_MISMATCH');
  if(beforeW){
    if(!isCanonicalBkpVersion(beforeW.restoreEpoch)||
       !isCanonicalBkpVersion(beforeW.headSeq)||
       !isCanonicalBkpVersion(chain.at(-1)?.securitySeq))
      fail('BACKUP_SECURITY_VERSION_INVALID');
    else if(BigInt(beforeW.headSeq)<BigInt(chain.at(-1)!.securitySeq))
      fail('WITNESS_BEHIND_BACKUP');
  }

  const members=new Map((beforeId?.members??[]).map(m=>[m.id,m]));
  if((beforeId?.members??[]).length!==members.size)fail('DUPLICATE_ID');
  const tracks=new Set<string>();
  for(const file of allApprovedFiles){
    tracks.add(file.trackId);
    if(!file.trackId.trim()||!file.key.trim()||!SHA.test(file.sha256)||
       !numeric(file.bytes)||!file.memberIds.length||!uniq(file.memberIds)||
       file.memberIds.some(id=>!id.trim())){fail('BAD_FILE_LINKAGE');continue;}
    for(const id of file.memberIds){
      const m=members.get(id);
      if(!m||!m.active)fail('MEMBER_MISSING_OR_REVOKED');
    }
    try {
      const content=await x.env.readFakeR2(file.key);
      if(content===null){fail('BACKUP_OBJECT_MISSING');continue;}
      if(new TextEncoder().encode(content).length!==file.bytes||
         await sha256FakeText(content)!==file.sha256)fail('BACKUP_OBJECT_TAMPERED');
      else verified++;
    }catch{fail('BACKUP_OBJECT_UNREADABLE')}
  }
  // A pending deletion/revocation must block even when old ID snapshots say active.
  // This includes BOTH signers, not only members referenced by restored content.
  const reviewerIds=new Set(x.approvals.map(a=>a.reviewerId));
  if(beforeW)for(const ev of beforeW.events){
    if(ev.kind==='member_deleted'||ev.kind==='member_revoke_pending') {
      if(allApprovedFiles.some(f=>f.memberIds.includes(ev.target)))fail('HISTORIC_MEMBER_TOMBSTONE');
      if(reviewerIds.has(ev.target))fail('REVIEWER_REVOKED_AT_WITNESS');
    }
    if(ev.kind==='track_deleted'||ev.kind==='track_revoke_pending') {
      if(tracks.has(ev.target))fail('HISTORIC_TRACK_TOMBSTONE');
    }
    if(ev.kind==='correction_changed'&&tracks.has(ev.target)&&
       chain.at(-1)&&isCanonicalBkpVersion(ev.seq)&&
       BigInt(ev.seq)>BigInt(chain.at(-1)!.securitySeq))fail('CORRECTION_AFTER_BACKUP');
  }

  if(x.approvals.length!==2||x.approvals[0]?.reviewerId===x.approvals[1]?.reviewerId)
    fail('TWO_APPROVERS_REQUIRED');
  for(const approval of x.approvals){
    if(approval.decision!=='approve'||!approval.reviewerId.trim()||
       !members.get(approval.reviewerId)?.active||
       !members.get(approval.reviewerId)?.centralSuperAdmin)fail('APPROVER_INVALID');
    if(approval.requestId!==x.requestId||approval.backupId!==x.selectedBackupId||
       approval.manifestHash!==x.manifestHash||
       approval.headHash!==beforeW?.headHash||
       approval.restoreEpoch!==beforeW?.restoreEpoch||
       approval.reviewerIdRevision!==beforeId?.revision)fail('APPROVAL_REPLAY_OR_SCOPE');
    if(!fresh(approval.approvedAtMs,x.nowMs,x.approvalAgeMs)||
       (beforeW&&approval.approvedAtMs<beforeW.observedAtMs)||
       (beforeId&&approval.approvedAtMs<beforeId.observedAtMs))
      fail('APPROVAL_EXPIRED');
  }

  let afterW:MockWitness|null=null,afterH:MockIndependentHead|null=null;
  let afterFloor:MockTrustedFloor|null=null,afterId:MockStarryId|null=null;
  try{
    [afterW,afterH,afterFloor,afterId]=await Promise.all([
      x.env.readWitness('after'),x.env.readIndependentHead('after'),
      x.env.readTrustedFloor('after'),x.env.readStarryId('after')]);
  }catch{fail('AUTHORITY_RECHECK_FAILED')}
  await inspectWitness(afterW,afterH,afterFloor,x.nowMs,x.freshnessMs,errors);
  if(!afterId||!fresh(afterId.observedAtMs,x.nowMs,x.freshnessMs))fail('STARRY_ID_RECHECK_FAILED');
  if(!beforeW||!afterW||JSON.stringify(beforeW)!==JSON.stringify(afterW)||
     !beforeH||!afterH||JSON.stringify(beforeH)!==JSON.stringify(afterH)||
     !beforeFloor||!afterFloor||JSON.stringify(beforeFloor)!==JSON.stringify(afterFloor))
    fail('WITNESS_CHANGED_DURING_REVIEW');
  if(!beforeId||!afterId||JSON.stringify(beforeId)!==JSON.stringify(afterId))
    fail('MEMBERSHIP_CHANGED_DURING_REVIEW');
  // In particular: if the witness is down, do NOT return actionable cleanup
  // candidates even if an unrelated expired backup looks removable.
  if(errors.size)return denyResult(errors,verified);
  // A durable, atomic FAKE claim is required for an eligible decision;
  // replaying the identical approved request cannot return eligible twice.
  // In production a real trusted ledger would be necessary; none is connected.
  try {
    if(!await x.env.claimFakeReviewOnce(x.requestId))fail('REVIEW_ALREADY_CONSUMED');
  }catch {fail('REVIEW_CLAIM_UNVERIFIED')}
  if(errors.size)return denyResult(errors,verified);
  const candidates=safeRetention(x.backups,x.lastGoodId,x.nowMs,x.retentionDays);
  return {simulatedEligible:true,productionAuthorized:false,restoreLocked:true,
    sideEffects:0,reasons:[],retentionCandidates:candidates,verifiedFileCount:verified};
}
