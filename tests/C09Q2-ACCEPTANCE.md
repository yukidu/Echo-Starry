# S2367A AI4 — C09/C10-Q2 Independent Blind Acceptance Evidence

**Scope:** tests and review only. Never enable Q1/FTS5, migrate production D1, run Cloudflare, access real member transcripts or AI, merge or deploy.

- Source **main** observed `60fc222f076dd0c9821a76df780414d78f0538aa`.
- Reviewed Q1 #465 exact HEAD `63a14a637d61350783f87920143fc62cbf3d1521`; old Q1 FTS5 #460 is read-only and is not used by these tests.
- This safety branch forked from #465 HEAD and adds only Q2 test/fixture/evidence files.
- **Blind fixture frozen before inspecting Q1 search.ts** with 35 independently written fictional transcripts, 40 positive human-labeled search questions, and eight no-source questions.
- Immutable fixture SHA-256: `389b5ef7b4998a0ac40a3f74c3b25bcb0e45d315440492f56e84e14061f48d69`.
- Questions must never be altered or used to tune Q1 algorithms for this acceptance run. Any errors remain part of the report; no grade inflation.
- `tests/c09q2Blind.test.ts` imports the **unmodified** Q1 module for lexical-ranking and mock-source/authority two-phase rechecks. It distinguishes a **green test runner** from the **actual blind-quality gate** and reports failed gold questions.
- `tests/c09q2SqliteScale.py` independently models ordinary SQLite posting-table size/read/write/SQL export at 30/112 and SQLite backup API at 500/2000, including longer fake docs. The parser used for this cost simulation is **not** an exact Q1 tokenizer, so results are **cost scenarios**, not production D1 billing evidence or exact Q1 indexed rows.
- No real Q1 source, Worker, Starry ID router, D1, R2, AI, Whisper, Cloudflare, member data or deployment files are changed.
- CI requires PR base `main`. This stacked Draft PR contains upstream Q1 #465 content for context **but only adds Q2 files relative to #465**; it must **never be merged directly**. The changes must be reviewed against `safety/ai4-c09c10-q1-20261020`.
- Actual Q2 blind results and explicit PASS/FAIL/SKIP go to #455 and PR comments after CI, without modifying any search rules.

`C09Q2 feature enabled = false` (no runtime import).
