/** N1A-S1 AI4: SELF-CONTAINED OFFLINE fake evidence/citation publication gate.
 * No real Starry ID, D1, R2, Workers, signer, AI answer, or network adapter.
 * DO NOT import into production routers. The final SEND fence is only an
 * in-memory model, NOT a cross-service atomicity guarantee.
 */
import { createHash } from 'node:crypto';

export const N1A_AI4_FAKE_ONLY = true as const;
export const N1A_AI4_PRODUCTION_ENABLED = false as const;

export type FakeSource = Readonly<{
  trackId: string; version: string; sourceRevision: string;
  correctionRevision: string; permissionRevision: string; text: string;
}>;
/** Request-visible descriptor: private transcript bytes must never be handed to T0. */
export type FakeSourceRef = Readonly<Omit<FakeSource, 'text'>>;
const bodyDigest = (text:string):string =>
  createHash('sha256').update(text,'utf8').digest('hex');

export type FakeProof = Readonly<{
  subjectId: string; appId: 'echo'; requestId: string;
  action: 'transcript.searchEvidence'; memberRevision: string;
  witnessSeq: string; checkpointSeq: string; restoreEpoch: string;
  revocationWatermark: string; deletionWatermark: string;
  issuedAtMs: number; expiresAtMs: number;
  source: ReadonlyArray<Readonly<{
    trackId: string; version: string; sourceRevision: string;
    correctionRevision: string; permissionRevision: string;
    deleted: boolean; revoked: boolean; revocationPending: boolean;
    entitled: boolean; contentDigest: string;
  }>>;
  fakeIssuer: 'offline-starry-id-plus-witness';
}>;
export type FakeDecision = Readonly<{
  reason: string; stage: 'T0' | 'T1' | 'T2' | 'SEND';
  released: readonly string[]; productionAuthorized: false; sideEffects: 0;
}>;
export type FakeAuthority = Readonly<{
  read(subjectId: string, requestId: string, ids: readonly string[]): Promise<FakeProof | null>;
  /** May fetch private fake bytes only after T0/T1 checks, never from a request. */
  readTextIfCurrent(proof: FakeProof, sources: readonly FakeSourceRef[],
    nowMs: number): readonly string[] | null;
  sendIfCurrent(proof: FakeProof, sources: readonly FakeSourceRef[],
    buffered: readonly string[], nowMs: number): readonly string[] | null;
}>;
export type FakeHooks = Readonly<{
  afterT0?(): void | Promise<void>; afterSQL?(): void | Promise<void>;
  afterT1?(): void | Promise<void>; beforeSend?(): void | Promise<void>;
}>;
const dec = (stage: FakeDecision['stage'], reason: string, released: readonly string[] = []): FakeDecision =>
  ({ stage, reason, released, productionAuthorized: false, sideEffects: 0 });
const canonical = (x: unknown): x is string =>
  typeof x === 'string' && /^(0|[1-9]\d{0,19})$/.test(x) && BigInt(x) <= 18446744073709551615n;
const same = (a: FakeProof, b: FakeProof): boolean =>
  a.subjectId === b.subjectId && a.appId === b.appId && a.requestId === b.requestId &&
  a.memberRevision === b.memberRevision && a.witnessSeq === b.witnessSeq &&
  a.checkpointSeq === b.checkpointSeq && a.restoreEpoch === b.restoreEpoch &&
  a.revocationWatermark === b.revocationWatermark && a.deletionWatermark === b.deletionWatermark &&
  a.source.length === b.source.length && a.source.every((v,i) => {
    const w = b.source[i];
    return w?.trackId === v.trackId && w.version === v.version &&
      w.sourceRevision === v.sourceRevision && w.correctionRevision === v.correctionRevision &&
      w.permissionRevision === v.permissionRevision && w.deleted === v.deleted &&
      w.revoked === v.revoked && w.revocationPending === v.revocationPending &&
      w.entitled === v.entitled && w.contentDigest === v.contentDigest;
  });

export function validateFakeProof(p: FakeProof | null, expected: Readonly<{
  subjectId: string; requestId: string; sources: readonly FakeSourceRef[];
}>, nowMs: number): boolean {
  if (!p || p.fakeIssuer !== 'offline-starry-id-plus-witness' || p.appId !== 'echo' ||
      p.action !== 'transcript.searchEvidence' || p.subjectId !== expected.subjectId ||
      p.requestId !== expected.requestId || !Number.isSafeInteger(nowMs) ||
      !Number.isSafeInteger(p.issuedAtMs) || !Number.isSafeInteger(p.expiresAtMs) ||
      p.issuedAtMs > nowMs || p.expiresAtMs <= nowMs ||
      p.expiresAtMs - p.issuedAtMs > 30_000 ||
      ![p.memberRevision,p.witnessSeq,p.checkpointSeq,p.restoreEpoch,
        p.revocationWatermark,p.deletionWatermark].every(canonical) ||
      BigInt(p.witnessSeq) < BigInt(p.checkpointSeq) ||
      p.source.length !== expected.sources.length || expected.sources.length === 0 ||
      expected.sources.length > 5) return false;
  if (new Set(p.source.map(s => s.trackId)).size !== expected.sources.length ||
      new Set(expected.sources.map(s => s.trackId)).size !== expected.sources.length) return false;
  return expected.sources.every((source,i) => {
    const q = p.source[i];
    return q?.trackId === source.trackId && q.version === source.version &&
      q.sourceRevision === source.sourceRevision && q.correctionRevision === source.correctionRevision &&
      q.permissionRevision === source.permissionRevision && q.entitled === true &&
      typeof q.contentDigest === 'string' && /^[0-9a-f]{64}$/.test(q.contentDigest) &&
      !q.deleted && !q.revoked &&
      !q.revocationPending && !!q.trackId && !!q.version && !!q.sourceRevision;
  });
}

/** Three independent fake re-reads and one atomic in-memory SEND decision.
 * Sensitive text never leaves this function before all four mock gates pass.
 * Real cross-service revocation cannot rely on in-process JS atomicity.
 */
export async function simulateProtectedQA(input: Readonly<{
  subjectId: string; requestId: string; authority: FakeAuthority;
  candidates: readonly FakeSourceRef[]; nowMs(): number; hooks?: FakeHooks;
}>): Promise<FakeDecision> {
  const { subjectId, requestId, authority, candidates, hooks } = input;
  if (!subjectId || !requestId || !candidates.length || candidates.length > 5 ||
      candidates.some(c=>!c || typeof c!=='object' || 'text' in c))
    return dec('T0','invalid_scope');
  const tracks = candidates.map(s => s.trackId);
  try {
    const t0 = await authority.read(subjectId,requestId,tracks);
    if (!validateFakeProof(t0,{subjectId,requestId,sources:candidates},input.nowMs()))
      return dec('T0','access_unproven');
    await hooks?.afterT0?.();
    // Fictional SQL retrieves a protected candidate, never discloses it.
    await hooks?.afterSQL?.();
    const t1 = await authority.read(subjectId,requestId,tracks);
    if (!validateFakeProof(t1,{subjectId,requestId,sources:candidates},input.nowMs()) || !same(t0!,t1!))
      return dec('T1','source_or_access_changed');
    // Private mock bytes are acquired only AFTER T0 and T1 are both valid.
    // This helper must compare authority/version/content digest once more.
    const buffered=authority.readTextIfCurrent(t1!,candidates,input.nowMs());
    if (buffered===null || buffered.length!==candidates.length)
      return dec('T1','protected_source_unavailable');
    await hooks?.afterT1?.();
    // A potential AI answer is buffered privately, not sent or persisted.
    const t2 = await authority.read(subjectId,requestId,tracks);
    if (!validateFakeProof(t2,{subjectId,requestId,sources:candidates},input.nowMs()) || !same(t1!,t2!))
      return dec('T2','publication_authority_changed');
    await hooks?.beforeSend?.();
    const output = authority.sendIfCurrent(t2!,candidates,buffered,input.nowMs());
    return output === null ? dec('SEND','revoked_before_send') : dec('SEND','fake_admitted',output);
  } catch {
    return dec('SEND','fake_authority_unavailable');
  }
}

/** Independent mutable FAKE Starry ID/source/witness; no valid attestation. */
export class MutableFakeAuthority implements FakeAuthority {
  readonly subjectId = 'member-fake';
  readonly appId = 'echo' as const;
  readonly resources = new Map<string,FakeSource>();
  /** Explicit fake grant map: a live member is NOT entitled to every track. */
  readonly entitlements = new Map<string,boolean>();
  active = true; memberRevision = '7'; witnessSeq = '20'; checkpointSeq = '20';
  epoch = '6'; revokeSeq = '2'; deleteSeq = '3';
  pending = new Set<string>(); revoked = new Set<string>(); deleted = new Set<string>();
  offline = false; readCount = 0; bodyReadCount = 0; sentCount = 0; clock = 1_000_000;
  constructor(sources: readonly FakeSource[], grantedTrackIds: readonly string[] = []) {
    // Fail-closed fixture: merely having a live member and a source document
    // NEVER grants access. Synthetic grants must be explicitly named.
    const grants=new Set(grantedTrackIds);
    for (const source of sources) {
      this.resources.set(source.trackId,source);
      this.entitlements.set(source.trackId,grants.has(source.trackId));
    }
  }
  private bump(): void { this.witnessSeq = String(BigInt(this.witnessSeq)+1n); }
  setEntitlement(trackId:string, allowed:boolean):void {
    const previous=this.resources.get(trackId);
    if (!previous || typeof allowed!=='boolean')throw new Error('invalid_fake_resource');
    if (this.entitlements.get(trackId)===allowed)return;
    this.entitlements.set(trackId,allowed);
    this.resources.set(trackId,{...previous,
      permissionRevision:String(BigInt(previous.permissionRevision)+1n)});
    this.bump();
  }
  block(trackId: string): void {
    this.pending.add(trackId); this.revokeSeq = String(BigInt(this.revokeSeq)+1n); this.bump();
  }
  revoke(trackId: string): void { this.block(trackId); this.revoked.add(trackId); }
  remove(trackId: string): void { this.deleted.add(trackId); this.deleteSeq = String(BigInt(this.deleteSeq)+1n); this.bump(); }
  correct(trackId: string): void {
    const s = this.resources.get(trackId)!;
    this.resources.set(trackId,{...s,correctionRevision:String(BigInt(s.correctionRevision)+1n)}); this.bump();
  }
  replace(trackId: string): void {
    const s = this.resources.get(trackId)!;
    this.resources.set(trackId,{...s,version:'v2',sourceRevision:'etag.new'}); this.bump();
  }
  suspendMember(): void {
    this.active = false; this.memberRevision = String(BigInt(this.memberRevision)+1n); this.bump();
  }
  private evidence(trackId:string):FakeProof['source'][number]|null {
    const live=this.resources.get(trackId);
    if (!live)return null;
    return {trackId,version:live.version,sourceRevision:live.sourceRevision,
      correctionRevision:live.correctionRevision,permissionRevision:live.permissionRevision,
      deleted:this.deleted.has(trackId),revoked:this.revoked.has(trackId),
      revocationPending:this.pending.has(trackId),
      entitled:this.entitlements.get(trackId)===true,
      contentDigest:bodyDigest(live.text)};
  }
  async read(subjectId: string, requestId: string, trackIds: readonly string[]): Promise<FakeProof|null> {
    this.readCount++;
    if (this.offline || !this.active || subjectId !== this.subjectId || !requestId)return null;
    const source=trackIds.map(id=>this.evidence(id));
    if (source.some(item=>item===null))return null;
    return {
      subjectId,appId:this.appId,requestId,action:'transcript.searchEvidence',
      memberRevision:this.memberRevision,witnessSeq:this.witnessSeq,checkpointSeq:this.checkpointSeq,
      restoreEpoch:this.epoch,revocationWatermark:this.revokeSeq,deletionWatermark:this.deleteSeq,
      issuedAtMs:this.clock-1,expiresAtMs:this.clock+5_000,
      fakeIssuer:'offline-starry-id-plus-witness',
      source:source as FakeProof['source']
    };
  }
  private currentProof(p:FakeProof,candidates:readonly FakeSourceRef[],nowMs:number):FakeProof|null {
    if (this.offline || !this.active || p.subjectId!==this.subjectId ||
        !p.requestId || !Number.isSafeInteger(nowMs) || nowMs!==this.clock)return null;
    const currentSources=candidates.map(s=>this.evidence(s.trackId));
    if(currentSources.some(v=>v===null))return null;
    return {...p,
      memberRevision:this.memberRevision,
      witnessSeq:this.witnessSeq,checkpointSeq:this.checkpointSeq,
      restoreEpoch:this.epoch,revocationWatermark:this.revokeSeq,
      deletionWatermark:this.deleteSeq,
      source:currentSources as FakeProof['source']};
  }
  private checkCurrent(p:FakeProof,candidates:readonly FakeSourceRef[],nowMs:number):boolean {
    const current=this.currentProof(p,candidates,nowMs);
    return current!==null && same(p,current) &&
      validateFakeProof(current,{subjectId:p.subjectId,requestId:p.requestId,sources:candidates},nowMs);
  }
  readTextIfCurrent(p:FakeProof,candidates:readonly FakeSourceRef[],nowMs:number):readonly string[]|null {
    // No protected bytes are read for unauthorized T0 or T1 requests.
    if(!this.checkCurrent(p,candidates,nowMs))return null;
    this.bodyReadCount++;
    return candidates.map(c=>this.resources.get(c.trackId)!.text);
  }
  sendIfCurrent(p:FakeProof,candidates:readonly FakeSourceRef[],
    buffered:readonly string[],nowMs:number):readonly string[]|null {
    // Single-process FAKE "send fence": not a distributed safety guarantee.
    if (!this.checkCurrent(p,candidates,nowMs) ||
        buffered.length!==candidates.length ||
        !candidates.every((ref,i)=>{
          const current=this.resources.get(ref.trackId);
          return current!==undefined && buffered[i]===current.text &&
            bodyDigest(buffered[i])===p.source[i]?.contentDigest;
        }))return null;
    this.sentCount++;
    return buffered;
  }
}
