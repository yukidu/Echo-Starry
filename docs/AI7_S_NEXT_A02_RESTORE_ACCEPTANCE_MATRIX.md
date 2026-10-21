# AI7 S-NEXT-A02 — Offline Restore / Revocation Acceptance Matrix

Status: **SYNTHETIC ONLY / DRAFT / OFF / NO DEPLOYMENT**.
Dispatch: https://github.com/yukidu/Echo-Starry/issues/455#issuecomment-6309948965
Baseline main: `60fc222f076dd0c9821a76df780414d78f0538aa`.
A01 independent Draft: https://github.com/yukidu/Echo-Starry/pull/485 (unchanged).

## Acceptance matrix and expected result

| Group | Scenario | Expected |
|---|---|---|
| Normal | Complete Full F -> Delta D | SIMULATION_ONLY, never executable restore |
| Full/Delta | Missing Full; missing Delta; missing parent; cycle; duplicate ID; changed Full bytes; changed Delta bytes; nonmonotonic seq; wrong App in Delta | CHAIN deny |
| Isolation | Echo resource belongs to Download; central Starry ID D1 copied; central Ledger copied | ISOLATION deny |
| Tombstones | Deletion after backup; revocation after backup; old restoreEpoch | REVOCATION deny |
| Witness | Highest head unavailable; independent floor unavailable; head/floor fork | WITNESS deny |
| Human approval | One reviewer; same human twice; reviewer no longer valid | TWO_HUMANS deny |
| Cutover | Replayed claim; dual writer; old session still valid; pending DO; pending Workflow | CUTOVER deny |
| No side effects | No actual restore/delete implementation in model | SIMULATION_ONLY |

## Actual isolated Node runner (not production)

Executed **locally** on a standalone Node built-in test runner using only fake strings and flags, no network or cloud. Command:

```bash
node --test /mnt/data/ai7a02/acceptance.test.mjs > /mnt/data/ai7a02/runner.log 2>&1
echo $?
sha256sum /mnt/data/ai7a02/acceptance.test.mjs
```

Observed exit code **0**; TAP: **28 tests, 28 pass, 0 fail, 0 skipped, 0 cancelled, 0 todo**, duration **112.552711 ms**. Source SHA-256 `32cb271eb2eab8c18c8862fc08f8667ed3d49b74f0276f3f1b9cb7ccc08cf028`. Source and complete stdout are separate local artifacts referenced in #455 report; **not GitHub CI evidence**. This PR is an acceptance specification only and does **not** contain an executable GitHub CI test.

## Unverified / blocking gates

1. No production D1/R2 full or incremental snapshot, no real object bytes, real metadata transaction, backup manifest signature or independent highest-head/floor attestation.
2. No real two-person identity, durable single-use claim, cross-Worker sequencing, live revocation/delete tombstone authority, in-flight DO/Workflow checkpoint or authenticated cutover.
3. Local fake string hash verification cannot prove backup consistency or RPO/RTO. No real restoration or deletion attempted.
4. Any missing or stale evidence -> UNKNOWN/DENY. RESTORE/DELETE/CLEANUP remain OFF/LOCKED.
5. AI2 must separately authorize real sandbox/cloud recovery tests and set budget, acceptance thresholds and human custodians.

No product code, shared workflow, main, production data, credentials, Cloudflare or paid resources modified.
