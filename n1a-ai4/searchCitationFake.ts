/** N1A-S1 AI4: SELF-CONTAINED OFFLINE fake evidence/citation publication gate.
 * No real Starry ID, D1, R2, Workers, signer, AI answer, or network adapter.
 * DO NOT import into production routers. The final SEND fence is only an
 * in-memory model, NOT a cross-service atomicity guarantee.
 */
export const N1A_AI4_FAKE_ONLY = true as const;
export const N1A_AI4_PRODUCTION_ENABLED = false as const;

export type FakeSource = Readonly<{
  trackId: string; version: string; sourceRevision: string;
  correctionRevision: string; permissionRevision: string; text: string;
}>;
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
  }>>;
  fakeIssuer: 'offline-starry-id-plus-witness';
}>;
export type FakeDecision = Readonly<{
  reason: string; stage: 'T0' | 'T1' | 'T2' | 'SEND';
  released: readonly string[]; productionAuthorized: false; sideEffects: 0;
}>;
export type FakeAuthority = Readonly<{
  read(subjectId: string, requestId: string, ids: readonly string[]): Promise<FakeProof | null>;
  sendIfCurrent(proof: FakeProof, sources: readonly FakeSource[], nowMs: number): readonly string[] | null;
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
      w.revoked === v.revoked && w.revocationPending === v.revocationPending;
  });

export function validateFakeProof(p: FakeProof | null, expected: Readonly<{
  subjectId: string; requestId: string; sources: readonly FakeSource[];
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
      q.permissionRevision === source.permissionRevision && !q.deleted && !q.revoked &&
      !q.revocationPending && !!q.trackId && !!q.version && !!q.sourceRevision;
  });
}

/** Three independent fake re-reads and one atomic in-memory SEND decision.
 * Sensitive text never leaves this function before all four mock gates pass.
 * Real cross-service revocation cannot rely on in-process JS atomicity.
 */
export async function simulateProtectedQA(input: Readonly<{
  subjectId: string; requestId: string; authority: FakeAuthority;
  candidates: readonly FakeSource[]; nowMs(): number; hooks?: FakeHooks;
}>): Promise<FakeDecision> {
  const { subjectId, requestId, authority, candidates, hooks } = input;
  if (!subjectId || !requestId || !candidates.length || candidates.length > 5)
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
    await hooks?.afterT1?.();
    // A potential AI answer is buffered privately, not sent or persisted.
    const t2 = await authority.read(subjectId,requestId,tracks);
    if (!validateFakeProof(t2,{subjectId,requestId,sources:candidates},input.nowMs()) || !same(t1!,t2!))
      return dec('T2','publication_authority_changed');
    await hooks?.beforeSend?.();
    const output = authority.sendIfCurrent(t2!,candidates,input.nowMs());
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
  active = true; memberRevision = '7'; witnessSeq = '20'; checkpointSeq = '20';
  epoch = '6'; revokeSeq = '2'; deleteSeq = '3';
  pending = new Set<string>(); revoked = new Set<string>(); deleted = new Set<string>();
  offline = false; readCount = 0; sentCount = 0; clock = 1_000_000;
  constructor(sources: readonly FakeSource[]) { for (const s of sources) this.resources.set(s.trackId,s); }
  private bump(): void { this.witnessSeq = String(BigInt(this.witnessSeq)+1n); }
  block(trackId: string): void { this.pending.add(trackId); this.revokeSeq = String(BigInt(this.revokeSeq)+1n); this.bump(); }
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
  async read(subjectId: string, requestId: string, trackIds: readonly string[]): Promise<FakeProof|null> {
    this.readCount++;
    if (this.offline || !this.active || subjectId !== this.subjectId || !requestId) return null;
    const rows = trackIds.map(id => this.resources.get(id));
    if (rows.some(s => !s)) return null;
    return {
      subjectId,appId:this.appId,requestId,action:'transcript.searchEvidence',
      memberRevision:this.memberRevision,witnessSeq:this.witnessSeq,checkpointSeq:this.checkpointSeq,
      restoreEpoch:this.epoch,revocationWatermark:this.revokeSeq,deletionWatermark:this.deleteSeq,
      issuedAtMs:this.clock-1,expiresAtMs:this.clock+5_000,fakeIssuer:'offline-starry-id-plus-witness',
      source:rows.map(s => ({
        trackId:s!.trackId,version:s!.version,sourceRevision:s!.sourceRevision,
        correctionRevision:s!.correctionRevision,permissionRevision:s!.permissionRevision,
        deleted:this.deleted.has(s!.trackId),revoked:this.revoked.has(s!.trackId),
        revocationPending:this.pending.has(s!.trackId),
      })),
    };
  }
  sendIfCurrent(p: FakeProof, candidates: readonly FakeSource[], nowMs: number): readonly string[] | null {
    if (this.offline || !this.active || Math.abs(this.clock-nowMs)>30_000) return null;
    // Synchronous fake admission only; DO NOT mistake for distributed send lock.
    const current: FakeProof = {...p,
      witnessSeq:this.witnessSeq,checkpointSeq:this.checkpointSeq,restoreEpoch:this.epoch,
      memberRevision:this.memberRevision,revocationWatermark:this.revokeSeq,
      deletionWatermark:this.deleteSeq,
      source:candidates.map(s => {
        const live = this.resources.get(s.trackId);
        return {trackId:s.trackId,version:live?.version||'',sourceRevision:live?.sourceRevision||'',
          permissionRevision:live?.permissionRevision||'',correctionRevision:live?.correctionRevision||'',
          deleted:this.deleted.has(s.trackId),revoked:this.revoked.has(s.trackId),
          revocationPending:this.pending.has(s.trackId)};
      }),
    };
    if (!same(p,current) || !validateFakeProof(current,{subjectId:p.subjectId,requestId:p.requestId,sources:candidates},nowMs))
      return null;
    this.sentCount++;
    return candidates.map(s => s.text);
  }
}
