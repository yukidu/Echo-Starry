"""AI3 A03 durable SQLite integration tests (no FakeMap, no Provider).
Runs exactly the SQL exported by worker/starryAiA03OfflineLedger.ts
against a fresh local on-disk SQLite database. This is not Cloudflare D1.
"""
import concurrent.futures
import pathlib
import re
import sqlite3
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
TS = (ROOT / "worker" / "starryAiA03OfflineLedger.ts").read_text()
SCHEMA = (ROOT / "tests" / "ai3-a03" / "schema.sql").read_text()

def exact_sql(name):
    m = re.search(r"export const " + re.escape(name) +
                  r" = String\.raw`([^`]+)`;", TS)
    if not m:
        raise RuntimeError("Missing exact worker SQL: " + name)
    return m.group(1)

RESERVE = exact_sql("AI3_A03_RESERVE_SQL")
CLAIM = exact_sql("AI3_A03_CLAIM_SQL")
DIGEST = "a" * 64
SUBJECT = "subject0001"
RESOURCE = "resource0001"
ECHO = "echo-app01"
DOWNLOAD = "download01"
NOW = 1792570000000

class SqliteRealLedgerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="ai3-a03-sqlite-")
        self.db_path = str(pathlib.Path(self.tmp.name) / "real-ledger.sqlite")
        con = self.open()
        con.executescript(SCHEMA)
        con.execute("INSERT INTO ai3_a03_budget_authority VALUES ('global',1,1,10)")
        for app in (ECHO, DOWNLOAD):
            con.execute("INSERT INTO ai3_a03_subject_watermarks VALUES (?,?,1,1,1)",
                        (SUBJECT, app))
            con.execute("INSERT INTO ai3_a03_resource_watermarks VALUES (?,?,1,1,1,1)",
                        (RESOURCE, app))
        con.close()

    def tearDown(self):
        self.tmp.cleanup()

    def open(self):
        c = sqlite3.connect(self.db_path, timeout=20, isolation_level=None)
        c.execute("PRAGMA foreign_keys=ON")
        c.execute("PRAGMA busy_timeout=20000")
        return c

    def hold(self, job="job-00000001", app=ECHO, cost=1, fp=DIGEST,
             grant=1, permission=1, resource=1, source=1, restore=1,
             budget=1, connection=None):
        own = connection is None
        c = connection if connection is not None else self.open()
        args = (
            job, fp, app, SUBJECT, RESOURCE,
            grant, permission, resource, source, restore, budget, cost, NOW,
            SUBJECT, app, RESOURCE, budget,
            grant, permission, resource, source, restore, cost, cost
        )
        try:
            return c.execute(RESERVE, args).rowcount
        finally:
            if own: c.close()

    def claim(self, job="job-00000001", key="claim-00000001", budget=1,
              fp=DIGEST, connection=None):
        own = connection is None
        c = connection if connection is not None else self.open()
        try:
            return c.execute(CLAIM, (key, NOW + 1, job, fp, budget)).rowcount
        finally:
            if own: c.close()

    def count(self, table):
        c = self.open()
        try:
            return c.execute("SELECT COUNT(*) FROM " + table).fetchone()[0]
        finally:
            c.close()

    def total(self):
        c = self.open()
        try:
            return c.execute("SELECT COALESCE(SUM(max_micro_twd),0) FROM ai3_a03_holds").fetchone()[0]
        finally:
            c.close()

    def test_01_exact_worker_sql_loaded(self):
        self.assertIn("INSERT OR IGNORE", RESERVE)
        self.assertIn("ai3_a03_send_claims", CLAIM)

    def test_02_zero_budget_denies(self):
        c = self.open()
        c.execute("UPDATE ai3_a03_budget_authority SET max_micro_twd=0")
        c.close()
        self.assertEqual(self.hold(), 0)

    def test_03_disabled_budget_denies(self):
        c = self.open()
        c.execute("UPDATE ai3_a03_budget_authority SET enabled=0")
        c.close()
        self.assertEqual(self.hold(), 0)

    def test_04_one_durable_reservation(self):
        self.assertEqual(self.hold(), 1)
        self.assertEqual(self.count("ai3_a03_holds"), 1)
        self.assertEqual(self.total(), 1)

    def test_05_same_job_duplicate_never_reserves_twice(self):
        self.assertEqual(self.hold(), 1)
        self.assertEqual(self.hold(), 0)
        self.assertEqual(self.total(), 1)

    def test_06_changed_fingerprint_cannot_reuse_key(self):
        self.assertEqual(self.hold(), 1)
        self.assertEqual(self.hold(fp="b" * 64), 0)
        self.assertEqual(self.total(), 1)

    def test_07_cross_app_same_key_does_not_duplicate(self):
        self.assertEqual(self.hold(), 1)
        self.assertEqual(self.hold(app=DOWNLOAD), 0)
        self.assertEqual(self.total(), 1)

    def test_08_two_apps_share_one_global_cap(self):
        for i in range(10):
            app = ECHO if i % 2 == 0 else DOWNLOAD
            self.assertEqual(self.hold(f"job-{i:08d}", app=app), 1)
        self.assertEqual(self.hold("job-overflow-0001"), 0)
        self.assertEqual(self.total(), 10)

    def test_09_cap_denies_overpriced_single_hold(self):
        self.assertEqual(self.hold(cost=11), 0)
        self.assertEqual(self.total(), 0)

    def test_10_durable_after_reopening_db(self):
        self.assertEqual(self.hold(), 1)
        c = self.open()
        self.assertEqual(c.execute("SELECT max_micro_twd FROM ai3_a03_holds").fetchone(), (1,))
        c.close()
        self.assertEqual(self.hold(), 0)

    def test_11_real_parallel_distinct_reserves_cannot_overspend(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=24) as pool:
            results = list(pool.map(lambda i: self.hold(f"job-{i:08d}"), range(36)))
        self.assertEqual(sum(results), 10)
        self.assertEqual(self.total(), 10)

    def test_12_real_parallel_same_job_only_one_wins(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=24) as pool:
            results = list(pool.map(lambda _: self.hold(), range(36)))
        self.assertEqual(sum(results), 1)
        self.assertEqual(self.count("ai3_a03_holds"), 1)

    def test_13_once_claim_before_external_send(self):
        self.assertEqual(self.hold(), 1)
        self.assertEqual(self.claim(), 1)
        self.assertEqual(self.count("ai3_a03_send_claims"), 1)
        self.assertEqual(self.claim(), 0)

    def test_14_parallel_claim_one_winner(self):
        self.assertEqual(self.hold(), 1)
        with concurrent.futures.ThreadPoolExecutor(max_workers=24) as pool:
            results = list(pool.map(lambda i: self.claim(key=f"claim-{i:08d}"), range(32)))
        self.assertEqual(sum(results), 1)
        self.assertEqual(self.count("ai3_a03_send_claims"), 1)

    def test_15_claim_survives_crash_reopen(self):
        self.assertEqual(self.hold(), 1)
        self.assertEqual(self.claim(), 1)
        self.assertEqual(self.claim(key="claim-retry-001"), 0)
        self.assertEqual(self.total(), 1)

    def test_16_claim_must_have_hold(self):
        self.assertEqual(self.claim(), 0)

    def test_17_permission_revocation_before_claim_denies(self):
        self.assertEqual(self.hold(), 1)
        c = self.open()
        c.execute("UPDATE ai3_a03_subject_watermarks SET active=0 WHERE app_id=?", (ECHO,))
        c.close()
        self.assertEqual(self.claim(), 0)
        self.assertEqual(self.total(), 1)

    def test_18_grant_version_change_before_claim_denies(self):
        self.assertEqual(self.hold(), 1)
        c = self.open()
        c.execute("UPDATE ai3_a03_subject_watermarks SET grant_revision=2 WHERE app_id=?", (ECHO,))
        c.close()
        self.assertEqual(self.claim(), 0)

    def test_19_permission_revision_change_denies(self):
        self.assertEqual(self.hold(), 1)
        c = self.open()
        c.execute("UPDATE ai3_a03_subject_watermarks SET permission_revision=2 WHERE app_id=?", (ECHO,))
        c.close()
        self.assertEqual(self.claim(), 0)

    def test_20_resource_revision_change_denies(self):
        self.assertEqual(self.hold(), 1)
        c = self.open()
        c.execute("UPDATE ai3_a03_resource_watermarks SET resource_revision=2 WHERE app_id=?", (ECHO,))
        c.close()
        self.assertEqual(self.claim(), 0)

    def test_21_source_revision_change_denies(self):
        self.assertEqual(self.hold(), 1)
        c = self.open()
        c.execute("UPDATE ai3_a03_resource_watermarks SET source_revision=2 WHERE app_id=?", (ECHO,))
        c.close()
        self.assertEqual(self.claim(), 0)

    def test_22_restore_epoch_change_denies(self):
        self.assertEqual(self.hold(), 1)
        c = self.open()
        c.execute("UPDATE ai3_a03_resource_watermarks SET restore_epoch=2 WHERE app_id=?", (ECHO,))
        c.close()
        self.assertEqual(self.claim(), 0)

    def test_23_authority_epoch_change_denies_old_claim(self):
        self.assertEqual(self.hold(), 1)
        c = self.open()
        c.execute("UPDATE ai3_a03_budget_authority SET epoch=2")
        c.close()
        self.assertEqual(self.claim(), 0)

    def test_24_unknown_after_claim_keeps_hold(self):
        self.assertEqual(self.hold(), 1)
        self.assertEqual(self.claim(), 1)
        self.assertEqual(self.claim(key="claim-retry-002"), 0)
        self.assertEqual(self.total(), 1)

    def test_25_no_auto_refund_even_if_no_send(self):
        self.assertEqual(self.hold(), 1)
        c = self.open()
        with self.assertRaises(sqlite3.IntegrityError):
            c.execute("DELETE FROM ai3_a03_holds")
        c.close()
        self.assertEqual(self.total(), 1)

    def test_26_immutable_claim_cannot_be_reopened(self):
        self.assertEqual(self.hold(), 1)
        self.assertEqual(self.claim(), 1)
        c = self.open()
        with self.assertRaises(sqlite3.IntegrityError):
            c.execute("DELETE FROM ai3_a03_send_claims")
        with self.assertRaises(sqlite3.IntegrityError):
            c.execute("UPDATE ai3_a03_send_claims SET claim_key='hijack-retry-01'")
        c.close()

    def test_27_failed_transaction_rolls_back(self):
        c = self.open()
        c.execute("BEGIN IMMEDIATE")
        self.assertEqual(self.hold(connection=c), 1)
        c.execute("ROLLBACK")
        c.close()
        self.assertEqual(self.count("ai3_a03_holds"), 0)
        self.assertEqual(self.hold(), 1)

    def test_28_zero_or_missing_auth_cannot_claim(self):
        self.assertEqual(self.hold(), 1)
        c = self.open()
        c.execute("UPDATE ai3_a03_budget_authority SET enabled=0")
        c.close()
        self.assertEqual(self.claim(), 0)
        self.assertEqual(self.total(), 1)

    def test_29_claim_replay_with_new_key_fails_closed(self):
        self.assertEqual(self.hold(), 1)
        self.assertEqual(self.claim(), 1)
        for i in range(100):
            self.assertEqual(self.claim(key=f"claim-replay-{i:05d}"), 0)
        self.assertEqual(self.count("ai3_a03_send_claims"), 1)

    def test_30_old_grant_fails_at_reservation(self):
        c = self.open()
        c.execute("UPDATE ai3_a03_subject_watermarks SET grant_revision=2 WHERE app_id=?", (ECHO,))
        c.close()
        self.assertEqual(self.hold(grant=1), 0)
        self.assertEqual(self.hold(grant=2), 1)

    def test_31_unknown_or_missing_resource_fails_closed(self):
        c = self.open()
        c.execute("UPDATE ai3_a03_resource_watermarks SET active=0 WHERE app_id=?", (ECHO,))
        c.close()
        self.assertEqual(self.hold(), 0)

    def test_32_claim_key_global_uniqueness(self):
        self.assertEqual(self.hold(), 1)
        self.assertEqual(self.hold("job-00000002"), 1)
        self.assertEqual(self.claim(), 1)
        self.assertEqual(self.claim(job="job-00000002"), 0)
        self.assertEqual(self.count("ai3_a03_send_claims"), 1)

if __name__ == "__main__":
    unittest.main(verbosity=2)
