"""N1A-S1 AI3: 100% fake member, independent witness, Echo D1 and Provider tests."""
import concurrent.futures
from datetime import datetime,timezone,timedelta
from pathlib import Path
import tempfile
import threading
import unittest
from n1a_s1_b07_fake import FakeId,FakeIndependentWitness,FakeEchoQueue,FakeCostLedger

class B07N1AS1(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='n1a-b07-fake-')
        self.addCleanup(self.tmp.cleanup)
        home=Path(self.tmp.name)
        self.ident=FakeId()
        self.anchor=FakeIndependentWitness()
        self.echo=FakeEchoQueue(str(home/'fake-echo.sqlite'))
        self.b=FakeCostLedger(str(home/'fake-central.sqlite'),self.ident,self.anchor,self.echo)
        self.ident.register('member-a')
        for a in ('a1','a2','a1alias'):self.ident.register(a,'starry-id')
    def grant(self,member='member-a',track='t1',source='a'*64,segments=1,model='@cf/fake/whisper',app='echo'):
        self.ident.register(member,app)
        g=self.anchor.issue(member,app=app,track=track,source=source,model=model,segments=segments)
        self.b.sources[(app,track)]=source
        return g
    def both(self,g,run='run',key='any',queue_fail=False,lost_hold=False,lost_queue=False):
        hold=self.b.reserve(g,key,run,ack_lost=lost_hold)
        queue=self.echo.enqueue(run,g,failed=queue_fail,lost_ack=lost_queue)
        return hold,queue

    def test_01_80_different_request_keys_one_billable_ticket(self):
        g=self.grant()
        with concurrent.futures.ThreadPoolExecutor(max_workers=16) as p:
            results=list(p.map(lambda i:self.b.reserve(g,f'new-key-{i}',f'run-{i}'),range(80)))
        self.assertEqual(results.count('reserved'),1)
        self.assertEqual(self.b.count('runs'),1)
        self.echo.enqueue('verified',g)
        with concurrent.futures.ThreadPoolExecutor(max_workers=16) as p:
            tickets=list(p.map(lambda _:self.b.claim(g,'verified',0),range(80)))
        self.assertEqual(tickets.count('one_ticket'),1)
        self.assertEqual(self.b.fake_provider(g,0),'confirmed')
        self.assertEqual(self.b.fake_provider(g,0),'denied_repeat_send')
        self.assertEqual(self.b.fake_sends,1)
        self.assertEqual(self.b.settle(g),'settled')

    def test_02_run_id_and_utc_date_rewrite_no_extra_hold(self):
        g=self.grant()
        d=datetime.now(timezone.utc).date()
        self.assertEqual(self.b.reserve(g,'first','old-run',str(d)),'reserved')
        self.assertEqual(self.b.reserve(g,'different-key','new-run',str(d+timedelta(days=1))),'denied_duplicate')
        self.assertEqual(self.b.count('runs'),1)

    def test_03_new_grant_when_prior_unresolved_cannot_bypass(self):
        a=self.grant()
        self.assertEqual(self.b.reserve(a),'reserved')
        b=self.anchor.issue(a.user,app=a.app,task=a.task,track=a.track,source=a.source,model=a.model)
        self.assertEqual(self.b.reserve(b),'denied_prior_unresolved')

    def test_04_true_new_fake_approval_only_after_previous_settled(self):
        old=self.grant()
        self.both(old)
        self.assertEqual(self.b.claim(old,'run',0),'one_ticket')
        self.assertEqual(self.b.fake_provider(old,0),'confirmed')
        self.assertEqual(self.b.settle(old),'settled')
        fresh=self.anchor.issue(old.user,app=old.app,task=old.task,track=old.track,source=old.source,model=old.model)
        self.assertEqual(self.b.reserve(fresh),'reserved')
        self.assertEqual(self.b.count('runs'),2)

    def test_05_timeout_bills_unknown_no_retry_or_refund(self):
        g=self.grant()
        self.both(g)
        self.assertEqual(self.b.claim(g,'run',0),'one_ticket')
        self.assertEqual(self.b.fake_provider(g,0,'timeout'),'unknown')
        self.assertEqual(self.b.claim(g,'run',0),'denied_hold')
        self.assertEqual(self.b.fake_provider(g,0),'denied_repeat_send')
        self.assertEqual(self.b.totals()[1],g.held)
        self.assertEqual(self.b.settle(g),'denied_unknown')

    def test_06_crash_after_ticket_before_fake_provider_cannot_retry(self):
        g=self.grant()
        self.both(g)
        self.assertEqual(self.b.claim(g,'run',0),'one_ticket')
        self.assertEqual(self.b.claim(g,'run',0),'denied_used')
        self.assertEqual(self.b.cancel_never_sent(g),'denied_possible_send')
        self.assertEqual(self.b.fake_sends,0)
        self.assertEqual(self.b.totals()[1],g.held)

    def test_07_hold_commits_but_ack_lost_stays_funding_unknown(self):
        g=self.grant()
        self.assertEqual(self.both(g,lost_hold=True)[0],'unknown_ack')
        self.assertEqual(self.b.claim(g,'run',0),'denied_hold')
        self.assertEqual(self.b.reserve(g,'new-key'),'denied_duplicate')
        self.assertEqual(self.b.totals()[1],g.held)

    def test_08_echo_queue_ok_hold_denied(self):
        self.b.max_cost=0
        g=self.grant()
        self.assertEqual(self.both(g),('denied_zero_budget','success'))
        self.assertEqual(self.b.claim(g,'run',0),'denied_hold')
        self.assertEqual(self.b.fake_sends,0)

    def test_09_hold_success_queue_failure_orphan(self):
        g=self.grant()
        self.assertEqual(self.both(g,queue_fail=True),('reserved','failed'))
        self.assertEqual(self.b.claim(g,'run',0),'denied_queue')
        self.assertEqual(self.b.totals()[1],g.held)

    def test_10_hold_failed_queue_failed(self):
        self.b.max_cost=0
        g=self.grant()
        self.assertEqual(self.both(g,queue_fail=True),('denied_zero_budget','failed'))
        self.assertEqual(self.b.count('runs'),0)

    def test_11_queue_ack_unknown_denies_dispatch(self):
        g=self.grant()
        self.assertEqual(self.both(g,lost_queue=True),('reserved','unknown'))
        self.assertEqual(self.b.claim(g,'run',0),'denied_queue')
        self.assertEqual(self.b.count('tickets'),0)

    def test_12_partial_success_and_unknown_segment_never_settle(self):
        g=self.grant(segments=2)
        self.both(g)
        self.assertEqual(self.b.claim(g,'run',0),'one_ticket')
        self.assertEqual(self.b.fake_provider(g,0),'confirmed')
        self.assertEqual(self.b.settle(g),'denied_partial')
        self.assertEqual(self.b.claim(g,'run',1),'one_ticket')
        self.assertEqual(self.b.fake_provider(g,1,'timeout'),'unknown')
        self.assertEqual(self.b.settle(g),'denied_unknown')
        self.assertEqual(self.b.totals(),(1,g.held,0))

    def test_13_reconciliation_two_humans_once_only(self):
        g=self.grant(segments=2)
        self.both(g)
        self.b.claim(g,'run',0)
        self.b.fake_provider(g,0,'timeout')
        self.assertEqual(self.b.reconcile(g,'c'*64,1,'a1','a2'),'reconciled')
        self.assertEqual(self.b.reconcile(g,'c'*64,1,'a1','a2'),'already_reconciled')
        self.assertEqual(self.b.reconcile(g,'d'*64,2,'a1','a2'),'denied_conflict')
        self.assertEqual(self.b.totals(),(1,0,2))
        self.assertEqual(self.b.count('reconciliations'),1)

    def test_14_same_human_two_admin_accounts_and_revoked_human_rejected(self):
        g=self.grant()
        self.both(g)
        self.b.claim(g,'run',0)
        self.b.fake_provider(g,0,'timeout')
        self.assertEqual(self.b.reconcile(g,'c'*64,1,'a1','a1alias'),'denied_review')
        self.ident.active[('a2','starry-id')]=False
        self.assertEqual(self.b.reconcile(g,'c'*64,1,'a1','a2'),'denied_review')
        self.assertEqual(self.b.totals()[1],g.held)

    def test_15_revoke_source_change_and_restore_epoch_denied(self):
        a=self.grant(track='a')
        self.both(a,run='ra')
        self.anchor.revoke(a)
        self.assertEqual(self.b.claim(a,'ra',0),'denied_identity')
        b=self.grant(track='b')
        self.both(b,run='rb')
        self.anchor.rollback_epoch()
        self.assertEqual(self.b.claim(b,'rb',0),'denied_identity')
        c=self.grant(track='c')
        self.both(c,run='rc')
        self.b.sources[(c.app,c.track)]='different-etag'
        self.assertEqual(self.b.claim(c,'rc',0),'denied_identity')

    def test_16_missing_witness_bad_tariff_and_free_account_unknown_fail_closed(self):
        g=self.grant(model='@cf/fake/free')
        self.assertEqual(self.b.reserve(g),'denied_free_unknown')
        self.anchor.down=True
        a=self.grant(track='other')
        self.assertEqual(self.b.reserve(a),'denied_identity')
        self.anchor.down=False
        b=self.grant(track='bad',model='@cf/fake/not-verified')
        self.assertEqual(self.b.reserve(b),'denied_tariff')
        self.assertEqual(self.b.count('runs'),0)

    def test_17_cancel_without_ticket_preserves_tombstone(self):
        g=self.grant()
        self.both(g)
        self.assertEqual(self.b.cancel_never_sent(g),'void')
        self.assertEqual(self.b.reserve(g,'other-key'),'denied_duplicate')
        self.assertEqual(self.b.totals(),(0,0,0))
        self.assertEqual(self.b.count('runs'),1)

    def test_18_2000_fake_members_share_global_budget_24_actual_threads(self):
        grants=[]
        for i in range(2000):
            actor=f'fake-member-{i:04d}'
            grants.append(self.grant(member=actor,track=f'track-{i:04d}',source=f'{i:064x}'))
        start=threading.Event()
        def reserve(i):
            start.wait()
            return self.b.reserve(grants[i],f'http-{i}',f'run-{i}')
        with concurrent.futures.ThreadPoolExecutor(max_workers=24) as pool:
            future=[pool.submit(reserve,i) for i in range(2000)]
            start.set()
            results=[f.result() for f in future]
        self.assertEqual(results.count('reserved'),40)
        self.assertEqual(len(results)-results.count('reserved'),1960)
        self.assertEqual(self.b.totals()[0],40)
        self.assertEqual(self.b.count('runs'),40)
        self.assertEqual(self.b.fake_sends,0)
        print('N1A_B07_S1_FAKE_2000 '+repr({
            'fakeUsers':2000,'realTestThreads':24,'granted':40,'denied':1960,
            'realProviderCalls':0,'cloudflareRequests':0,'productionDeploys':0}))

    def test_19_two_apps_compete_for_one_global_budget(self):
        self.b.max_calls=1
        a=self.grant(track='one',app='echo')
        b=self.grant(track='two',app='mirror')
        self.assertEqual(self.b.reserve(a),'reserved')
        self.assertEqual(self.b.reserve(b),'denied_budget')
        self.assertEqual(self.b.totals()[0],1)

    def test_20_outcome_lost_after_fake_send_does_not_allow_repeat(self):
        g=self.grant()
        self.both(g)
        self.assertEqual(self.b.claim(g,'run',0),'one_ticket')
        self.assertEqual(self.b.fake_provider(g,0,'crash_after_send'),'unknown_ack')
        self.assertEqual(self.b.fake_provider(g,0),'denied_repeat_send')
        self.assertEqual(self.b.claim(g,'run',0),'denied_used')
        self.assertEqual(self.b.cancel_never_sent(g),'denied_possible_send')
        self.assertEqual(self.b.fake_sends,1)

if __name__=='__main__':unittest.main(verbosity=2)
