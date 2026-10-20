"""Second-round AI3 cross-team N1A-S1 Fake-only proof/ledger checks.

The #469 TypeScript file is reviewed READ-ONLY at SHA 629ba524;
our Python adapter is deliberately not a bundled copy or production import.
"""
import concurrent.futures
import time
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from datetime import date,timedelta,timezone,datetime
from n1a_s1_b07_fake import FakeId,FakeIndependentWitness,FakeEchoQueue,FakeCostLedger
from n1a_s1_b07_proof_bridge_fake import (
    FakeB07SecurityBridge,UINT64_MAX,FIELDS,wire_uint64,parse_uint64
)

class FakeS1R2SecurityProof(unittest.TestCase):
    def setUp(self):
        temp=TemporaryDirectory(prefix="n1a-s1-round2-offline-")
        self.addCleanup(temp.cleanup)
        d=Path(temp.name)
        self.ids=FakeId()
        self.witness=FakeIndependentWitness()
        self.echo=FakeEchoQueue(str(d/"echo-fake.sqlite"))
        self.ledger=FakeCostLedger(str(d/"central-fake.sqlite"),self.ids,self.witness,self.echo)
        self.bridge=FakeB07SecurityBridge(self.ids,self.witness,self.ledger)
        self.ids.register("fake-member")
        self.now=int(time.time()*1000)
    def grant(self,**kw):
        opts={"user":"fake-member","track":"fake-track-1","source":"a"*64}
        opts.update(kw)
        g=self.witness.issue(opts["user"],track=opts["track"],source=opts["source"])
        self.ledger.sources[(g.app,g.track)]=g.source
        return g
    def proof(self,g,req="req-one"):
        return self.bridge.issue_fake_proof(g,req,now_ms=self.now)
    def claim_once(self,g,p,request="req-one",run_id="run-one"):
        return self.bridge.fake_claim(p,g,request,run_id,0,now_ms=self.now)

    def test_01_exact_securityproof_v1_field_list_and_fake_only_issuer(self):
        g=self.grant();p=self.proof(g)
        self.assertEqual(set(p),FIELDS)
        self.assertEqual((p["schemaVersion"],p["issuer"],p["audience"],p["action"]),
           ("N1A-S1-FAKE-v1","fake-star-id-plus-witness","n1a-offline-only","ai.attempt"))
        self.assertEqual(p["approvalGrantId"],g.id)
        self.assertEqual(p["sourceRevision"],g.source)
        self.assertEqual(p["restoreEpoch"],"1")
        self.assertEqual(p["securitySeq"],"1")
        self.assertEqual(self.bridge.assess(p,g,"req-one",now_ms=self.now),
                         (True,"fake_evidence_consistent"))

    def test_02_same_grant_new_request_id_or_run_id_never_recharges(self):
        g=self.grant()
        p1=self.proof(g,"req-first")
        self.assertEqual(self.bridge.fake_reserve(p1,g,"req-first",run_id="run-first",now_ms=self.now),"reserved")
        self.echo.enqueue("run-first",g)
        self.assertEqual(self.claim_once(g,p1,"req-first","run-first"),"one_ticket")
        p2=self.proof(g,"req-second")
        self.assertEqual(self.bridge.fake_reserve(p2,g,"req-second",run_id="run-second",now_ms=self.now),"denied_duplicate")
        self.echo.enqueue("run-second",g)
        self.assertEqual(self.claim_once(g,p2,"req-second","run-second"),"denied_used")
        self.assertEqual(self.ledger.count("runs"),1)
        self.assertEqual(self.ledger.count("tickets"),1)
        self.assertEqual(self.ledger.fake_provider(g,0),"confirmed")
        self.assertEqual(self.ledger.fake_provider(g,0),"denied_repeat_send")
        self.assertEqual(self.ledger.fake_sends,1)

    def test_03_proof_request_id_must_match_current_http_request(self):
        g=self.grant()
        p=self.proof(g,"req-one")
        self.assertEqual(self.bridge.fake_reserve(p,g,"req-not-bound",now_ms=self.now),
                        "proof_denied:proof_rebound_to_other_action")
        self.assertEqual(self.ledger.count("runs"),0)

    def test_04_grant_id_cannot_be_forged_even_with_fake_attestation(self):
        g=self.grant()
        p=self.proof(g)
        p["approvalGrantId"]="fake-different-grant"
        self.assertEqual(self.bridge.fake_reserve(p,g,"req-one",now_ms=self.now),
                         "proof_denied:ai_grant_missing_or_mismatch")

    def test_05_epochs_above_js_safe_integer_roundtrip_as_strings_only(self):
        self.witness.epoch=9007199254740993
        self.witness.seq=9007199254740995
        g=self.grant()
        p=self.proof(g)
        self.assertEqual(p["restoreEpoch"],"9007199254740993")
        self.assertEqual(p["securitySeq"],"9007199254740996")
        self.assertEqual(parse_uint64(p["restoreEpoch"]),self.witness.epoch)
        self.assertEqual(self.bridge.assess(p,g,"req-one",now_ms=self.now)[0],True)
        self.assertEqual(wire_uint64(UINT64_MAX),str(UINT64_MAX))
        self.assertEqual(parse_uint64(str(UINT64_MAX)),UINT64_MAX)

    def test_06_invalid_versions_rejected_not_coerced_to_python_int_or_js_number(self):
        g=self.grant()
        for bad in (1,True,1.0,"01","-1","+1","1e3",
                    "18446744073709551616",9007199254740993.0,""):
            p=self.proof(g);p["restoreEpoch"]=bad
            self.assertEqual(self.bridge.assess(p,g,"req-one",now_ms=self.now)[0],
                             False,msg=str(bad))
        for bad in (True,0.0,-1,UINT64_MAX+1):
            with self.assertRaises(ValueError): wire_uint64(bad)

    def test_07_grant_and_anchor_security_seq_are_not_membership_revision(self):
        g=self.grant();p=self.proof(g)
        p["membershipRevision"]="4"
        p["securitySeq"]="1"
        self.assertTrue(self.bridge.assess(p,g,"req-one",now_ms=self.now)[0])
        self.bridge.membership_revision[g.user]="5"
        self.assertEqual(self.bridge.assess(p,g,"req-one",now_ms=self.now)[1],
                         "membership_revoked_or_revision_changed")
        self.assertNotEqual(p["membershipRevision"],p["securitySeq"])

    def test_08_precheck_pass_then_witness_updated_must_deny_before_commit(self):
        g=self.grant();p=self.proof(g)
        self.assertEqual(self.bridge.fake_reserve(p,g,"req-one",now_ms=self.now),"reserved")
        self.echo.enqueue("run-one",g)
        self.assertEqual(self.bridge.assess(p,g,"req-one",stage="precheck",now_ms=self.now)[0],True)
        self.witness.seq+=1
        self.assertEqual(self.claim_once(g,p),"proof_denied:external_witness_changed_or_rolled_back")
        self.assertEqual(self.ledger.count("tickets"),0)
        self.assertEqual(self.ledger.totals()[1],g.held)

    def test_09_restored_epoch_or_anchor_down_denies_new_attempt(self):
        g=self.grant();p=self.proof(g)
        self.bridge.fake_reserve(p,g,"req-one",now_ms=self.now)
        self.echo.enqueue("run-one",g)
        self.witness.down=True
        self.assertEqual(self.claim_once(g,p),"proof_denied:external_witness_missing")
        self.witness.down=False
        self.witness.rollback_epoch()
        self.assertEqual(self.claim_once(g,p),"proof_denied:external_witness_changed_or_rolled_back")
        self.assertEqual(self.ledger.count("tickets"),0)

    def test_10_member_revocation_and_source_edit_after_reserve_deny(self):
        g=self.grant();p=self.proof(g)
        self.bridge.fake_reserve(p,g,"req-one",now_ms=self.now)
        self.echo.enqueue("run-one",g)
        self.ids.active[(g.user,g.app)]=False
        self.assertEqual(self.claim_once(g,p),"proof_denied:membership_revoked_or_revision_changed")
        self.ids.active[(g.user,g.app)]=True
        self.ledger.sources[(g.app,g.track)]="different-etag"
        self.assertEqual(self.claim_once(g,p),"proof_denied:resource_changed_since_approval")
        self.assertEqual(self.ledger.count("tickets"),0)

    def test_11_permission_and_correction_revisions_are_distinct_from_source(self):
        g=self.grant();p=self.proof(g)
        self.assertEqual(p["sourceRevision"],g.source)
        self.bridge.permission_revision[g.track]="9"
        self.assertEqual(self.bridge.assess(p,g,"req-one",now_ms=self.now)[1],
                         "resource_changed_since_approval")
        self.bridge.permission_revision[g.track]="8"
        self.bridge.correction_revision[g.track]="4"
        self.assertEqual(self.bridge.assess(p,g,"req-one",now_ms=self.now)[1],
                         "resource_changed_since_approval")

    def test_12_expired_future_or_over_30sec_proof_denies(self):
        g=self.grant()
        for change in ({"expiresAtMs":self.now},{"issuedAtMs":self.now+1},
                       {"expiresAtMs":self.now+60000}):
            p=self.proof(g);p.update(change)
            self.assertEqual(self.bridge.assess(p,g,"req-one",now_ms=self.now)[1],
                             "expired_or_future_proof")

    def test_13_fake_attestation_missing_or_wrong_audience_denies(self):
        g=self.grant()
        p=self.proof(g);p["fakeAttestation"]="browser-says-verified"
        self.assertEqual(self.bridge.assess(p,g,"req-one",now_ms=self.now)[1],
                         "unverified_fake_attestation")
        p=self.proof(g);p["audience"]="production"
        self.assertEqual(self.bridge.assess(p,g,"req-one",now_ms=self.now)[1],
                         "wrong_schema_or_audience")
        self.assertEqual(self.ledger.count("runs"),0)

    def test_14_unknown_provider_result_and_request_id_rewrite_deny_new_attempt(self):
        g=self.grant();p=self.proof(g)
        self.bridge.fake_reserve(p,g,"req-one",now_ms=self.now)
        self.echo.enqueue("run-one",g)
        self.assertEqual(self.claim_once(g,p),"one_ticket")
        self.assertEqual(self.ledger.fake_provider(g,0,"timeout"),"unknown")
        replay=self.proof(g,"different-req")
        self.assertEqual(self.bridge.fake_reserve(replay,g,"different-req",now_ms=self.now),
                         "denied_duplicate")
        self.assertEqual(self.claim_once(g,replay,"different-req"),"denied_hold")
        self.assertEqual(self.ledger.fake_provider(g,0),"denied_repeat_send")
        self.assertEqual(self.ledger.fake_sends,1)
        self.assertEqual(self.ledger.totals()[1],g.held)

    def test_15_different_utc_date_same_grant_no_second_run(self):
        g=self.grant();p=self.proof(g)
        today=date.today();tomorrow=today+timedelta(days=1)
        self.assertEqual(self.bridge.fake_reserve(p,g,"req-one",day=str(today),now_ms=self.now),
                         "reserved")
        p2=self.proof(g,"req-later")
        self.assertEqual(self.bridge.fake_reserve(p2,g,"req-later",day=str(tomorrow),now_ms=self.now),
                         "denied_duplicate")
        self.assertEqual(self.ledger.count("runs"),1)

    def test_16_race_80_new_request_ids_with_accurate_fake_proofs_one_reservation(self):
        g=self.grant()
        def worker(i):
            rid=f"req-{i}"
            proof=self.proof(g,rid)
            return self.bridge.fake_reserve(proof,g,rid,now_ms=self.now)
        with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
            result=list(pool.map(worker,range(80)))
        self.assertEqual(result.count("reserved"),1)
        self.assertEqual(result.count("denied_duplicate"),79)
        self.assertEqual(self.ledger.count("runs"),1)
        self.assertEqual(self.ledger.count("tickets"),0)

    def test_17_twostage_reread_prevents_pending_rereq_when_anchor_revokes(self):
        g=self.grant();p=self.proof(g)
        self.assertEqual(self.bridge.assess(p,g,"req-one",stage="precheck",now_ms=self.now)[0],True)
        self.bridge.revocation_watermark+=1
        self.bridge.revoked_resources.add(g.track)
        self.assertEqual(self.bridge.assess(p,g,"req-one",stage="before_commit",now_ms=self.now)[1],
                         "external_witness_changed_or_rolled_back")
        self.assertGreaterEqual(self.bridge.read_count["anchor"],2)

    def test_18_proof_not_rebound_to_other_app_or_action(self):
        g=self.grant();p=self.proof(g)
        p["action"]="transcript.publish"
        self.assertEqual(self.bridge.assess(p,g,"req-one",now_ms=self.now)[1],
                         "proof_rebound_to_other_action")
        p=self.proof(g);p["appId"]="mirror"
        self.assertEqual(self.bridge.assess(p,g,"req-one",now_ms=self.now)[1],
                         "proof_rebound_to_other_action")

    def test_19_overflowed_fake_witness_never_grants_ticket(self):
        g=self.grant();p=self.proof(g)
        self.witness.seq=UINT64_MAX+1
        self.assertEqual(self.bridge.assess(p,g,"req-one",now_ms=self.now)[1],
                         "external_witness_invalid_version")
        self.assertEqual(self.bridge.fake_claim(p,g,"req-one","run-one",0,now_ms=self.now),
                         "proof_denied:external_witness_invalid_version")
        self.assertEqual(self.ledger.count("tickets"),0)

    def test_20_partial_success_unknown_segment_cannot_rekey_or_settle(self):
        g=self.witness.issue("fake-member",track="partial-track",source="b"*64,segments=2)
        self.ledger.sources[(g.app,g.track)]=g.source
        p=self.proof(g)
        self.assertEqual(self.bridge.fake_reserve(p,g,"req-one",now_ms=self.now),"reserved")
        self.echo.enqueue("run-one",g)
        self.assertEqual(self.bridge.fake_claim(p,g,"req-one","run-one",0,now_ms=self.now),"one_ticket")
        self.assertEqual(self.ledger.fake_provider(g,0),"confirmed")
        self.assertEqual(self.ledger.settle(g),"denied_partial")
        self.assertEqual(self.bridge.fake_claim(p,g,"req-one","run-one",1,now_ms=self.now),"one_ticket")
        self.assertEqual(self.ledger.fake_provider(g,1,"timeout"),"unknown")
        replay=self.proof(g,"req-again")
        self.assertEqual(self.bridge.fake_reserve(replay,g,"req-again",now_ms=self.now),
                         "denied_duplicate")
        self.assertEqual(self.bridge.fake_claim(replay,g,"req-again","run-one",1,now_ms=self.now),
                         "denied_hold")
        self.assertEqual(self.ledger.settle(g),"denied_unknown")
        self.assertEqual(self.ledger.totals()[1],g.held)
        self.assertEqual(self.ledger.fake_sends,2)


if __name__=="__main__":
    unittest.main(verbosity=2)
