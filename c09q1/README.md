# C09/C10-Q1 — S45A isolated Chinese search prototype

**Status: Draft/OFF.** This directory is deliberately **not imported by any Echo runtime route**. `schema.sql` is an additive *proposal*, **not applied to Cloudflare D1**. Nothing here can call AI, Whisper, R2, member data or Cloudflare by itself. No FTS5 virtual tables or SQL full-text scans.

- `search.ts`: Taiwan Chinese **search-only** phrase normalization, small transparent synonym groups, Han bigrams, negative-context safeguard, bounded token-postings SQL, derived paragraph construction, optional candidate staging, generation pointer publication, source invalidation, and fail-closed final evidence selection. The source transcript text is NEVER rewritten.
- `schema.sql`: only ordinary SQLite tables (`q1_source_state`, `q1_paragraphs`, `q1_postings`) with `(term,paragraphId)` primary-key lookup, no virtual tables.
- `tests/c09q1Search.test.ts` plus `tests/c09q1Sqlite.py`: a self-contained fully synthetic seed and SQLite benchmarks/rollback-style guard checks.

## Safety / migration restrictions

All production integration remains blocked. Do not apply the schema, enable the old C09/C10 FTS5 migration, or wire this module into a Worker. **Real `P0_AUTHORITY` / external non-rollback restore epoch / latest Starry ID revocation and deletion tombstones do not yet exist in this prototype.** The `LiveAuthority` interface in tests is fake. A later separately authorized integration must implement the real authority check at request time AND immediately before AI answer publication, and atomically invalidate derived index rows whenever approved correction, deletion, permission or source revision changes. No R2-original fallback to a stale source. `invalidateQ1Source` documents the one-row mutation, but is **not** wired to existing correction/permission APIs.

`stageOrdinaryQ1` inserts candidate rows invisible until the current generation pointer is explicitly moved. `publishOrdinaryQ1` changes exactly one pointer row with a revision condition (no two-step publish) after fake-authority proof; this cannot make external Starry ID and Echo D1 updates jointly atomic. Real on-prem/Cloudflare row-count, isolation and source mutation races require separate approval and validation. Orphan index generations need AI7-approved cleanup/retention policy; never drop active transcripts or versions to save space. Search results are evidence candidates, not validated AI answers.

## Offline tests (not Cloudflare benchmarks)

From a repository with Node 22+ and project dependencies installed:

```sh
node --import tsx --test tests/c09q1Search.test.ts
```

Locally, `node --experimental-strip-types --test tests/c09q1Search.test.ts` also works with Node 22.16+. Tests spawn **local `python3`** for SQLite only. CI environment must have Python 3 for this optional test. All data files are created under OS temp directories and deleted afterwards.

The generated 44 primary + 12 differently phrased synthetic questions form a **closed domain**, and phrase rules were refined while observing this fake set. Consequently even 100% Top-5 on these samples is **not** independent real-world validation; an external frozen blind question set is a hard prerequisite to claiming 90% production-quality recall. Human QA correctness, conversational semantics and Cloudflare free D1 usage were not tested.

## Performance and free account budget

Numbers in a PR report are local SQLite wall-clock only, using 30/112/500/2000 fake transcripts of lengths ~150–1800 characters. The corpus is repetitive and uses bounded keyword matches rather than 2000 actual concurrent users. `EXPLAIN QUERY PLAN` must show primary-key `term=?`, not table scan. `p95` on a laptop does not predict Workers/D1 P95. D1 rows read/written, global account budget shared with all Starry services, restore audit and 2000-user concurrency remain **unknown** until independently approved cloud tests.
