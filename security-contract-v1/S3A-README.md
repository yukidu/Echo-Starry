# N1A-S3A shared fake-only envelope / contract freeze candidate

## Scope
S3A only: independently versioned draft branch, synthetic data, CI. Does **not**
authenticate any real person, sign any claim, read real Cloudflare or Starry ID,
spend AI funds, delete/restore backups or publish transcript text. NEVER import
in production Worker/router. `N1A_S3A_PRODUCTION_GATE=false` at all times.

This branch is based on AI2 S1 [#469](https://github.com/yukidu/Echo-Starry/pull/469).
The S3A Draft PR must target that branch for review, NOT main, until the user
separately authorizes a future release process.

## One shared schema, different domain versions
- One request envelope + 1..5 `resources[]`, each with entitlement on
  re-read, transcript version, source ETag, exact-content SHA-256, permission
  and correction revision.
- Starry ID per-member revision + session revision are not ledger versions.
- `securitySeq` = witnessed log head; `checkpointSeq` = independently retained
  highest known accepted head; `restoreEpoch`, `revocationWatermark` and
  `deletionWatermark` are separate canonical uint64 decimal strings.
- AI5 `eventRevision:number` is an event counter; DO NOT alias into
  `sourceRevision:string` or mistake it for an audio resource ETag.
- Fake AI `approvalGrantId` is required, but it does not give a paid attempt
  ticket; AI3 must use its own atomic persistent fake grant ledger.
- `ai.attempt`, backup and publish use `before_commit`. Search verifies
  at T0, T1, T2 and SEND. Check every resource at every stage.
- All decisions include `productionAuthorized:false`, zero provider calls,
  zero restore writes and no irreversible effects. Simulated success means
  fixture values agree, never genuine user authority.

## S3A interoperability contract for AI3–AI7
Teams should create isolated S3A branches from THIS S3A HEAD, and
cherry-pick only their own previously reviewed mock files if truly needed.
Tests should **import this exact module**, not independently transcribe or
copy its type/validator and call that integration. Avoid cherry-picking any
main router, Starry ID service, D1 migration, cloud or billing adapter.
Do not change another team's PR. Individual AI3–AI7 S3A Draft PRs must
target this branch, and note if the prior S1 module is not yet accessible.

An integrated CI pass tests only in-process synthetic adapters; it cannot
demonstrate true atomicity among Cloudflare Workers, Starry ID and an external
nonrollback witness. Real WORM, independent latest-head witness, signature
keys, two genuine central admins, official live billing, restore and
private transcript send barriers remain BLOCKED.

## Local smoke
`node --import tsx --test tests/n1aS3aSharedEnvelope.test.ts`

14 synthetic scenarios including 2,000 concurrent Promise-based checks.
This is NOT a real multi-region 2,000-user load test.

## Next authorization boundary
Only after S3A integrated offline tests and user approval may a separate
phase investigate/instantiate a truly independent external witness. The
system may not turn ON during S3A; all production actions remain disabled.
