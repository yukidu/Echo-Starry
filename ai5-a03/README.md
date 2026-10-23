# AI5 S-NEXT-A03 — isolated private statistics / export safety (DRAFT, OFF)

## Scope and ownership

- **Not wired to any production router, real account, D1, R2, Worker, Cloudflare or paid provider.** The module in `ai5-a03/privateStatisticsGate.ts` is a reviewed pre-integration contract, not a live private-data endpoint.
- `#459` (F22-S1) owns the present read-only speaker statistics UI/router/queries against Echo `qa_claims`. Its central-super-admin membership check is **not** a substitute for a per-action central permission.
- `#466` (F22-S2) owns the separate incremental rollup / synthetic SQLite schema proposal. No rollup schema or migration is imported or modified here.
- **AI6 / #494 owns the shared live authority contract** (Starry ID session/role/permission revisions and Echo resource/source/revocation/restore revisions). AI5 must consume, not fork, a reviewed central authority and permission state.
- **AI5 owns only private statistics presentation/export boundaries**: independent actions `stats.private.read` versus `stats.report.export`, coarse approved aggregates, no private member row fields, CSV formula neutralization, and no response bytes before repeated checks and an atomic send claim.
- User requests to search content, Echo admin role, or broad central super-admin identity **never implicitly authorize** these private actions. Cross-App grants cannot be reused.
- Minimum cohort 5 is an **illustrative, not approved production privacy policy**. AI2 must decide policy, including intersection/differencing attacks across filters, period, and neighboring counts.

## Offline runnable tests

From the repo root on Node **22** with the existing `tsx` dependency:

```sh
node --import tsx --test tests/ai5A03PrivateStatistics.test.ts
```

For an isolated environment with Node 22.16.0, TypeScript syntax stripping works with:

```sh
node --experimental-strip-types --test tests/ai5A03PrivateStatistics.test.ts
```

The file is included by the existing `tests/*.test.ts` GitHub Regression audit without workflow modification. Fake subjects, fake audit stamps and fake event IDs only. Test SQLite uses `DatabaseSync(':memory:')`, real SQL `INSERT/SELECT/UPDATE`, `BEGIN IMMEDIATE` and a UNIQUE claim key. **This is a transactional local test, not a deployed D1 or multi-Worker safety guarantee.**

Sixteen tests cover: OFF gate; UNKNOWN quota; independent read/export grants; subject/App/report scope; revocation before SQL query; revocation during load and post-claim; seven stale revision dimensions; expiry/authority unavailable; atomic duplicate nonce denial; k=5 small-cell row omission; Echo/Download isolation; spreadsheet formulas and quote escaping; invalid policies; and 2,000 **synthetic** members across 30 days (60,000 fake events, sequential INSERT). Counts alone do not establish real HTTP concurrency or production P95/P99.

## Zero-leak expectations and known limits

- DENY returns **no bytes** and performs **no source query** when access is refused before load.
- Recheck after load, again after claim. A fake grant revoked mid-load or after claim must yield zero returned bytes.
- Explicitly not proved: a real HTTP server's atomic SEND boundary after final check, multi-Worker claim persistence, approved cache bypass, D1 read costs, session binding in production, true CSV spreadsheet compatibility across Excel versions, cross-period differential privacy, or 2,000 concurrent users. **Real SEND can still race after the final check without AI6's durable serialized fence.**
- Never return raw member IDs, prompts, questions, email or audio transcripts; the read/export contract only emits approved `day,label,members,calls` aggregate fields and completely drops subthreshold groups, including their identifying label.
- A healthy runner and synthetic PASS must never unlock live `stats.private.read`, `stats.report.export` or F24. All live gates remain OFF/LOCKED.

## AI2 integration decisions required BEFORE any live wiring

1. Canonical owner of `stats.private.read` and `stats.report.export` action grants (per-App audience/issuer), plus session/role/permission/restore revision freshness; use **AI6 shared authority**, not separate AI5 identity logic.
2. Report owner, resource ID/version and authoritative revocation watermark; storage isolation from Starry ID core and other Apps.
3. Atomic SEND claim and last-byte revocation semantics. Decide whether exports must be all-or-nothing buffered or abortable chunks, and specify bounded memory/row/byte sizes, Cache-Control no-store, access logs without sensitive payloads.
4. Approved minimum anonymity threshold, aggregate budget/differential-privacy treatment for repeated slices and adjacent period comparisons.
5. Real sandbox HTTP/D1 load harness with objective P50/P95/P99, memory, rows_read/rows_written, Cloudflare daily account quota and NT$ ceiling, plus 2,000-person **concurrency** separately from fake event counts.
6. A reversible migration/deployment plan owned by AI2, review of #459/#466/#494 overlap and GitHub production protections. No production changes/merges until separate acceptance.

Status: independent AI5 A03 Draft only; no main, Cloudflare, real members or Production touched.
