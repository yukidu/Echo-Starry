# AI5 S-NEXT-A02 — Offline 2,000-member analytics and privacy test plan

Status: **SYNTHETIC ONLY / PRODUCTION NOT VERIFIED / ALL PRIVATE GATES OFF**. No member records, production API, D1, R2, secrets, provider, or Cloudflare actions.

## Reproduce
- File: `tests/ai5SNextA02OfflineAnalytics.test.ts`
- From the repository root with the existing Node/tsx test dependencies installed: `node --import tsx --test tests/ai5SNextA02OfflineAnalytics.test.ts`
- Expected test names: 10; expected fixture: 2,000 pseudonymous synthetic member integers × 30 days = **90,000 in-memory events** (60,000 accepted + 30,000 completed); 1,000 members per app; 30,000 accepted per app.
- The existing regression workflow scans `tests/*.test.ts`; verify the exact A02 `TEST FILE` marker and TAP pass/fail/skip in the resulting GitHub job log **before claiming actual CI execution**.

## Measurement and privacy matrix
| Dimension | A02 isolated check | Actual production acceptance still required |
|---|---|---|
| Distinct members | Daily vs multi-day unique member counts; no summing daily DISTINCT | Independently computed oracle from real ingestion schema, deletion and late-arrival semantics |
| Cross-App | Echo/Download disjoint fixture, cross-audience and app-admin DENY | Real Starry ID + resource-owner grant + Worker/D1 data isolation |
| Read/export | Independent action grants | Production auth and export endpoints; deny before any private downstream read |
| Revocation | Simulated first-byte/chunk flags | Atomic revocation vs SEND ordering across Workers, actual response bytes, Range/retry |
| Cache | Stale-cache flag DENY | Browser BFCache, SW, Cache API, CDN, R2 URLs and real invalidation |
| Privacy | k=5 example suppression, CSV candidate escaping | AI2/owner-approved k, differencing/repeated queries, safe CSV in target spreadsheet software |
| Quota | 79/80/100 thresholds and UNKNOWN | AI3 authoritative receipts, real cap and unknown-held semantics |
| Burst | 20/100/500 **sequential** in-memory stats scans | 20/100/500 real concurrent requests in isolated staging; P50/P95/P99, errors, CPU, D1 rows read, R2 requests and costs |
| Reliability | 90,000 generated events; deterministic totals | 2,000 simultaneous clients, reconnect/retry/clock skew, failure recovery, durability |
| Costs | Zero external calls; no paid resources | AI2-approved budget and Cloudflare/Provider unit prices; no unsupported cost estimate |

## Synthetic limits and acceptance blockers
- **2,000 members are fixtures, not 2,000 concurrent sessions**; 90,000 events are arrays, not DB records. The 20/100/500 burst checks are sequential calls, **not parallel load**. Host-dependent timing is deliberately not an SLA or performance pass gate.
- Gate checks are an invented policy reference function; they do **not** exercise the real Starry ID, D1, SW, Worker, CSV endpoint, security watermarks, or streaming.
- `k=5` is a demonstration threshold, not an approved privacy policy. Query differencing remains untested. No proof of post-revocation 0 bytes or 0 actual private downstream reads.
- No actual 80/100% provider/billing cutoff or ledger correctness is tested; UNKNOWN must never be reported as zero or paid.
- Before real integration: AI2 must approve resource owner, field whitelist, retention, privacy k, revocation/SEND authority, data oracle, target concurrency and P95/P99/error/cost budgets; user must separately authorize any code/real-resource work.
- Preserve existing AI5 A01 Draft #484 unchanged. A02 is a separate Draft proposal. No merge/deploy.

## Acceptance checklist
1. Obtain CI runner log showing A02 file and ten TAP test outcomes.
2. Report actual exit code if captured; never infer a separate shell exit-code line from green UI alone.
3. Keep formal private read/export/F24 OFF; mark live security and 2,000-concurrency **NOT VERIFIED**.
