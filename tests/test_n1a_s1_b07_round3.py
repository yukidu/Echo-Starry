"""N1A-S1 R3: MUST RED on old fake ledger, GREEN only after 3 targeted fixes.

All identities, grants, Echo database, invoice authority and provider calls FAKE.
"""
import unittest
from datetime import datetime,timezone,timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from n1a_s1_b07_fake import FakeId,FakeIndependentWitness,FakeEchoQueue,FakeCostLedger


class FakeB07R3Adversarial(unittest.TestCase):
    def setUp(self):
        tmp=TemporaryDirectory(prefix="n1a-s1-r3-fake-")
        self.addCleanup(tmp.cleanup)
        root=Path(tmp.name)
        self.identity=FakeId()
        self.witness=FakeIndependentWitness()
        self.echo=FakeEchoQueue(str(root/"echo.sqlite"))
        self.ledger=FakeCostLedger(str(root/"central.sqlite"),
                                   self.identity,self.witness,self.echo,
                                   max_calls=1)
        self.identity.register("fake-user")
        for reviewer in ("a1","a2"):
            self.identity.register(reviewer,"starry-id")

    def grant(self,track):
        g=self.witness.issue("fake-user",track=track,source="a"*64)
        self.ledger.sources[(g.app,g.track)]=g.source
        return g

    def unknown(self,g,run):
        self.assertEqual(self.ledger.reserve(g,run=run),"reserved")
        self.assertEqual(self.echo.enqueue(run,g),"success")
        self.assertEqual(self.ledger.claim(g,run,0),"one_ticket")
        self.assertEqual(self.ledger.fake_provider(g,0,"timeout"),"unknown")
        return g

    def test_R3_01_client_date_override_cannot_bypass_shared_budget(self):
        first=self.grant("one")
        second=self.grant("two")
        self.assertEqual(self.ledger.reserve(first),"reserved")
        alternate=(datetime.now(timezone.utc)+timedelta(days=1)).date().isoformat()
        self.assertEqual(
            self.ledger.reserve(second,day=alternate),
            "denied_untrusted_day",
            "request-controlled accounting date must never create a fresh quota bucket")
        self.assertEqual(self.ledger.count("runs"),1)
        self.assertEqual(self.ledger.totals()[0],1)

    def test_R3_02_queued_echo_must_not_release_central_hold_without_ticket(self):
        g=self.grant("queued")
        self.assertEqual(self.ledger.reserve(g),"reserved")
        self.assertEqual(self.echo.enqueue("run-queued",g),"success")
        self.assertEqual(self.ledger.count("tickets"),0)
        self.assertEqual(self.ledger.cancel_never_sent(g),"denied_dispatch_not_proven")
        self.assertEqual(self.ledger.totals()[1],g.held)
        self.assertEqual(self.ledger.count("runs"),1)

    def test_R3_03_lost_queue_ack_is_not_proof_of_no_dispatch(self):
        g=self.grant("queue-unknown")
        self.assertEqual(self.ledger.reserve(g),"reserved")
        self.assertEqual(self.echo.enqueue("run-unknown",g,lost_ack=True),"unknown")
        self.assertEqual(self.ledger.cancel_never_sent(g),"denied_dispatch_not_proven")
        self.assertEqual(self.ledger.totals()[1],g.held)

    def test_R3_04_durable_echo_never_enqueued_fence_allows_safe_fake_void(self):
        g=self.grant("never-queued")
        self.assertEqual(self.ledger.reserve(g),"reserved")
        self.assertEqual(self.echo.certify_never_queued(g.run_key),"fenced")
        self.assertEqual(self.ledger.cancel_never_sent(g),"void")
        self.assertEqual(self.echo.enqueue("late-run",g),"cancelled")
        self.assertEqual(self.ledger.reserve(g,http_key="replay"),"denied_duplicate")
        self.assertEqual(self.ledger.totals(),(0,0,0))

    def test_R3_05_same_invoice_line_cannot_reconcile_two_independent_runs(self):
        first=self.unknown(self.grant("unknown-one"),"u1")
        # Simulate a different day with a trusted internal clock, NOT the HTTP day.
        self.ledger._trusted_utc_day=lambda: (
            datetime.now(timezone.utc)+timedelta(days=1)).date().isoformat()
        second=self.unknown(self.grant("unknown-two"),"u2")
        line="f"*64
        self.ledger.invoices.attest_fake_invoice_line(line,first,1)
        self.assertEqual(self.ledger.reconcile(first,line,1,"a1","a2"),"reconciled")
        # Malicious replay of same otherwise valid invoice line for a new run.
        self.assertEqual(
            self.ledger.reconcile(second,line,1,"a1","a2"),
            "denied_invoice_reused")
        self.assertEqual(self.ledger.count("reconciliations"),1)
        self.assertEqual(self.ledger.totals()[1],second.held)

    def test_R3_06_unknown_source_invoice_receipt_must_not_be_trusted(self):
        g=self.unknown(self.grant("unknown-evidence"),"evidence-run")
        self.assertEqual(self.ledger.reconcile(g,"a"*64,1,"a1","a2"),
                         "denied_invoice_unverified")
        self.assertEqual(self.ledger.count("reconciliations"),0)
        self.assertEqual(self.ledger.totals()[1],g.held)

if __name__=="__main__":
    unittest.main(verbosity=2)
