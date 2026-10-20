# AI3 N1A-S3A: actual shared TS verifier × Python fake B07

Authorization: #455 comment 6291692925. No deployment or real authority approved.
Base: AI2 #475 SHA db58589b3937b99d62a7f15edb59d7bd9688db3c.
PR base must be safety/ai2-n1a-s3a-shared-envelope-20261020, not main.

## Actual executable connection

`tests/ai3N1aS3aB07.test.ts` imports the original
`evaluateS3aFakeEnvelope()` from `security-contract-v1/s3aEnvelope.ts`.
Its `gated()` path evaluates that exact function before requesting a reserve
or claim from a private Python JSONL child. That child imports original
`FakeCostLedger.reserve()` and `FakeCostLedger.claim()`, using two separate
temporary SQLite files and the original fake queue, identity, witness and invoice
authority. A denial returns before invoking reserve/claim. Repeated stages
read mutable TS fake authorities again. The fake attestation registry binds the
entire issued envelope, not merely a caller-supplied boolean or ticket string.

The existing Python Fake modules and 46 S1 tests are copied byte-for-byte from
AI3 #474 SHA a23e60836fda6e285952bd0aadb3e59cf034aaf8. No #464/#467 branch,
runtime, migration, router or Cloudflare config is copied. Python S1 semantic
bridge exists only for unchanged S1 regression; S3A does NOT use it instead of
the actual shared TypeScript verifier.

## Narrow fixture mapping

One synthetic member/app/resource, fixed fake model and one segment. The opaque
TS sourceRevision is `etag-one`; its contentDigest maps to the existing Python
Grant.source (`a` repeated 64 times). This mapping is test-local and rejects
other resource/source values. TS membership/session and independent checkpoint
versions are not coerced into Python witness sequence numbers. Both domains
have independent fake validity checks. No claim of real signatures, distributed
atomicity, or real source attestation is made.

The Python child is isolated (`-I`), gets only PATH, has fixed executable/script
arguments without a shell, uses temporary directories, and disables socket
construction before serving fixture operations. No cloud credentials are passed.
IPC is only a private test channel, not an HTTP endpoint or production capability.
Its fake send increments only a SQLite/in-memory fixture counter.

## Scenarios

11 S3A tests: successful gate/reserve/queue/claim/fake-send/settle; changed
requestKey and runId; new grant while prior source hold is unresolved; revocation,
membership-version change, witness unavailable, per-resource denial, changed
source after reserve; unknown invoice/timeout hold and repeated-send rejection;
same invoice line reused across unknown jobs; tampered grant registry denial.
Also run AI2's 14 shared-envelope cases and unchanged 46 Python S1 cases.

A genuinely NEW approval after the former job has settled/reconciled is not
globally forbidden: only replay and unresolved-work bypass must be denied.
This distinction is exercised in invoice reuse testing. Mere lack of a queue
record is not evidence to refund; original R3 cancellation-fence regression
remains intact.

## Hard limitations / OFF

`ai.attempt` permits only `before_commit` in the current shared contract. AI3
therefore invokes that phase on reserve and immediately before claim; it does
not invent a SEND-compatible contract or alter AI2's shared module. These are
two real verifier calls, not a distributed SEND fence. Real authority revocation
between the final read/claim/send remains BLOCKED, as do immutable billing
identity, true provider receipts, non-rollback external storage and actual
central-admin review. No exactly-once provider billing guarantee.

All decisions productionAuthorized=false, irreversibleActionsAllowed=false,
providerCalls=0; fakeSends is separately named. No real database, cloud resources,
provider, key, official price/balance, migration, main merge or deployment.
#461 Whisper gate is untouched. Preview build checks, if externally automatic,
are not production acceptance; this workflow itself has no build/deploy step.

## Validation evidence

Local commands and GitHub CI outcomes are reported on the Draft PR with exact
HEAD. Existing regression failures, if any, must be reported rather than hidden.
S3A success proves fixture interoperability only; it is not 2,000-user load,
actual Cloudflare performance, actual cost protection or launch readiness.
