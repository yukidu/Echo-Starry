"""N1A-S1 Central AI3 fake-only cost/authority contract. NEVER a Worker import.

SQLite = disposable fake Central/Echo databases. Anchor/Starry ID/AI = in-memory
fixtures only. There is NO external account, SDK, network or provider request.
"""
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib, json, re, sqlite3, threading, time, uuid

def digest(*fields):
    return hashlib.sha256(json.dumps(fields,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()

@contextmanager
def opened(path):
    c=sqlite3.connect(path,timeout=20,isolation_level=None)
    c.execute('PRAGMA busy_timeout=20000')
    try: yield c
    finally: c.close()

@dataclass(frozen=True)
class Grant:
    id:str; user:str; app:str; task:str; track:str; source:str; model:str
    epoch:int; seq:int; expires:int; segments:int=1; price:int=2; max_units:int=2
    @property
    def run_key(self):
        # Deliberately no HTTP requestKey, runId, generation or UTC day.
        return digest('n1a:s1:run:1',self.id,self.app,self.task,self.track,self.source,self.model)
    def segment_key(self,n):
        return digest('n1a:s1:segment:1',self.id,self.app,self.task,self.track,self.source,self.model,n)
    @property
    def held(self): return self.segments*self.price*self.max_units

class FakeId:
    def __init__(self):
        self.active={}
        self.admins={'a1':'human-1','a2':'human-2','a1alias':'human-1'}
    def register(self,user,app='echo'): self.active[(user,app)]=True
    def can(self,user,app): return self.active.get((user,app),False)
    def reviewer(self,user):
        return self.admins.get(user) if self.can(user,'starry-id') else None

class FakeIndependentWitness:
    """Monotonic in RAM for simulation; NOT a certified non-rollback authority."""
    def __init__(self):
        self.seq=0;self.epoch=1;self.grants={};self.revoked=set();self.down=False
        self.lock=threading.Lock()
    def issue(self,user,app='echo',task='transcript',track='t1',source='a'*64,
              model='@cf/fake/whisper',segments=1):
        with self.lock:
            self.seq+=1
            g=Grant('fake-'+str(uuid.uuid4()),user,app,task,track,source,model,
                    self.epoch,self.seq,int(time.time())+300,segments,0 if model=='@cf/fake/free' else 2)
            self.grants[g.id]=g
            return g
    def valid(self,g):
        return not self.down and self.grants.get(g.id)==g and g.id not in self.revoked and \
               g.epoch==self.epoch and g.expires>int(time.time())
    def revoke(self,g):
        with self.lock:self.seq+=1;self.revoked.add(g.id)
    def rollback_epoch(self):
        with self.lock:self.seq+=1;self.epoch+=1

class FakeInvoiceAuthority:
    """Disposable MOCK provider-invoice-line registry. Never a real supplier proof.

    Only the fake supplier test fixture should call attest_fake_invoice_line;
    a caller's 64-character string is NOT evidence of actual billing.
    """
    def __init__(self):
        self._lines={}
        self._lock=threading.Lock()
    def attest_fake_invoice_line(self,invoice_line,grant,units):
        if not isinstance(invoice_line,str) or not re.fullmatch(r"[a-f0-9]{64}",invoice_line) or \
           type(units) is not int or units<0:
            return False
        expected=(grant.run_key,units)
        with self._lock:
            old=self._lines.get(invoice_line)
            if old is not None:return old==expected
            self._lines[invoice_line]=expected
            return True
    def verified(self,invoice_line,grant,units):
        with self._lock:
            return self._lines.get(invoice_line)==(grant.run_key,units)


class FakeEchoQueue:
    def __init__(self,path):
        self.path=path
        with opened(path) as c:
            c.executescript("""
                CREATE TABLE fake_echo_queue(
                    id TEXT PRIMARY KEY,run_key TEXT,state TEXT);
                CREATE TABLE fake_echo_cancel_fences(
                    run_key TEXT PRIMARY KEY,state TEXT NOT NULL CHECK(state='never_queued'));
            """)
    def enqueue(self,run_id,g,failed=False,lost_ack=False):
        if failed:return 'failed'
        with opened(self.path) as c:
            # The queue and fence serialize in ONE fake Echo SQLite writer lock.
            c.execute('BEGIN IMMEDIATE')
            if c.execute('SELECT 1 FROM fake_echo_cancel_fences WHERE run_key=?',
                         (g.run_key,)).fetchone():
                c.execute('ROLLBACK');return 'cancelled'
            c.execute('INSERT OR IGNORE INTO fake_echo_queue VALUES (?,?,?)',
                      (run_id,g.run_key,'dispatch_unknown' if lost_ack else 'queued'))
            c.execute('COMMIT')
        return 'unknown' if lost_ack else 'success'
    def certify_never_queued(self,run_key):
        """Irreversible Fake Echo dispatch fence, not a cross-D1 transaction."""
        with opened(self.path) as c:
            c.execute('BEGIN IMMEDIATE')
            if c.execute('SELECT 1 FROM fake_echo_queue WHERE run_key=? LIMIT 1',
                         (run_key,)).fetchone():
                c.execute('ROLLBACK');return 'denied_queued'
            c.execute('INSERT OR IGNORE INTO fake_echo_cancel_fences VALUES(?,?)',
                      (run_key,'never_queued'))
            c.execute('COMMIT')
        return 'fenced'
    def is_cancel_fenced(self,run_key):
        try:
            with opened(self.path) as c:
                return bool(c.execute(
                    'SELECT 1 FROM fake_echo_cancel_fences WHERE run_key=?',
                    (run_key,)).fetchone())
        except sqlite3.Error:
            return False
    def confirmed(self,run_id,g):
        with opened(self.path) as c:
            return c.execute('SELECT state,run_key FROM fake_echo_queue WHERE id=?',
                             (run_id,)).fetchone()==('queued',g.run_key)

class FakeCostLedger:
    def __init__(self,path,ids,witness,echo,max_calls=40,max_cost=100000):
        self.path=path;self.ids=ids;self.witness=witness;self.echo=echo
        self.max_calls=max_calls;self.max_cost=max_cost;self.sources={}
        self.invoices=FakeInvoiceAuthority()
        # Internal fake server clock, never an HTTP date from the caller.
        self._trusted_utc_day=lambda: datetime.now(timezone.utc).date().isoformat()
        self.fake_sends=0;self.send_lock=threading.Lock()
        self.official_free_known=False
        with opened(path) as c:c.executescript("""
          CREATE TABLE usage(day TEXT PRIMARY KEY,calls INTEGER NOT NULL CHECK(calls>=0),
            held INTEGER NOT NULL CHECK(held>=0),settled INTEGER NOT NULL CHECK(settled>=0));
          CREATE TABLE runs(key TEXT PRIMARY KEY,grant TEXT UNIQUE NOT NULL,
            app TEXT,task TEXT,track TEXT,source TEXT,model TEXT,day TEXT,
            count INTEGER,held INTEGER,unitprice INTEGER, state TEXT NOT NULL);
          CREATE TABLE tickets(key TEXT PRIMARY KEY,run_key TEXT NOT NULL,segment INTEGER,
            state TEXT NOT NULL,sent INTEGER NOT NULL DEFAULT 0 CHECK(sent IN(0,1)),
            units INTEGER NOT NULL DEFAULT 0, receipt TEXT NOT NULL DEFAULT '',
            UNIQUE(run_key,segment));
          CREATE TABLE reconciliations(run_key TEXT PRIMARY KEY,invoice TEXT NOT NULL UNIQUE,
            human1 TEXT NOT NULL,human2 TEXT NOT NULL,units INTEGER,amount INTEGER);
        """)
    def trusted(self,g):
        return self.ids.can(g.user,g.app) and self.witness.valid(g) and \
               self.sources.get((g.app,g.track))==g.source
    def reserve(self,g,http_key='any',run='run',day=None,ack_lost=False):
        # Compatibility argument is deliberately REJECTED, not used for accounting.
        # Day rollover tests must advance the internal trusted mock clock.
        if day is not None:return 'denied_untrusted_day'
        if not self.trusted(g):return 'denied_identity'
        if g.model=='@cf/fake/free' and not self.official_free_known:return 'denied_free_unknown'
        if g.model not in ('@cf/fake/free','@cf/fake/whisper'):return 'denied_tariff'
        if g.price and self.max_cost==0:return 'denied_zero_budget'
        if not 1<=g.segments<=100 or g.held>1_000_000_000:return 'denied_plan'
        day=self._trusted_utc_day()
        if not isinstance(day,str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}",day):
            return 'denied_untrusted_clock'
        with opened(self.path) as c:
            c.execute('BEGIN IMMEDIATE')
            if c.execute('SELECT 1 FROM runs WHERE key=?',(g.run_key,)).fetchone():
                c.execute('ROLLBACK');return 'denied_duplicate'
            # A genuine new grant can't buy over an unresolved old grant.
            outstanding=c.execute("""SELECT 1 FROM runs r WHERE app=? AND task=? AND track=? AND
             source=? AND model=? AND (state IN ('reserved','funding_unknown') OR
             (state='unknown' AND NOT EXISTS
               (SELECT 1 FROM reconciliations q WHERE q.run_key=r.key))) LIMIT 1""",
               (g.app,g.task,g.track,g.source,g.model)).fetchone()
            if outstanding:c.execute('ROLLBACK');return 'denied_prior_unresolved'
            c.execute('INSERT OR IGNORE INTO usage VALUES (?,0,0,0)',(day,))
            updated=c.execute("""UPDATE usage SET calls=calls+1,held=held+? WHERE day=?
                              AND calls<? AND held+settled+?<=?""",
                              (g.held,day,self.max_calls,g.held,self.max_cost))
            if updated.rowcount!=1:c.execute('ROLLBACK');return 'denied_budget'
            c.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
                      (g.run_key,g.id,g.app,g.task,g.track,g.source,g.model,day,
                       g.segments,g.held,g.price,'funding_unknown' if ack_lost else 'reserved'))
            c.execute('COMMIT')
        return 'unknown_ack' if ack_lost else 'reserved'
    def claim(self,g,run_id,segment):
        if not self.trusted(g):return 'denied_identity'
        if not self.echo.confirmed(run_id,g):return 'denied_queue'
        if not isinstance(segment,int) or not 0<=segment<g.segments:return 'denied_segment'
        with opened(self.path) as c:
            c.execute('BEGIN IMMEDIATE')
            row=c.execute('SELECT state FROM runs WHERE key=?',(g.run_key,)).fetchone()
            if not row or row[0]!='reserved':c.execute('ROLLBACK');return 'denied_hold'
            other=c.execute("""SELECT 1 FROM tickets WHERE run_key=? AND
                             (segment=? OR state IN ('may_have_sent','unknown')) LIMIT 1""",
                            (g.run_key,segment)).fetchone()
            if other:c.execute('ROLLBACK');return 'denied_used'
            if segment>0:
                previous=c.execute("""SELECT COUNT(*) FROM tickets WHERE run_key=?
                                AND segment<? AND state='confirmed'""",
                                (g.run_key,segment)).fetchone()[0]
                if previous!=segment:c.execute('ROLLBACK');return 'denied_previous'
            c.execute("INSERT INTO tickets(key,run_key,segment,state) VALUES(?,?,?,'may_have_sent')",
                      (g.segment_key(segment),g.run_key,segment))
            c.execute('COMMIT')
        return 'one_ticket'
    def fake_provider(self,g,segment,outcome='confirmed',units=1):
        # Single durable dispatch even if a local crash occurs before send.
        with opened(self.path) as c:
            c.execute('BEGIN IMMEDIATE')
            ticket=c.execute("""UPDATE tickets SET sent=1 WHERE key=? AND
                             state='may_have_sent' AND sent=0""",
                             (g.segment_key(segment),))
            if ticket.rowcount!=1:c.execute('ROLLBACK');return 'denied_repeat_send'
            c.execute('COMMIT')
        with self.send_lock:self.fake_sends+=1
        if outcome=='crash_after_send':return 'unknown_ack'
        if outcome=='timeout':return self.complete(g,segment,'unknown')
        return self.complete(g,segment,'confirmed',units)
    def complete(self,g,segment,status,units=0):
        if status not in ('confirmed','unknown') or \
           (status=='confirmed' and not isinstance(units,int) or status=='confirmed' and not 0<=units<=g.max_units):
            return 'denied_result'
        with opened(self.path) as c:
            c.execute('BEGIN IMMEDIATE')
            r=c.execute("""UPDATE tickets SET state=?,units=?,receipt=?
                        WHERE key=? AND state='may_have_sent'""",
                        (status,units if status=='confirmed' else 0,
                         'e'*64 if status=='confirmed' else '',g.segment_key(segment)))
            if r.rowcount!=1:c.execute('ROLLBACK');return 'denied_result_replay'
            if status=='unknown':
                c.execute("UPDATE runs SET state='unknown' WHERE key=? AND state='reserved'",
                          (g.run_key,))
            c.execute('COMMIT')
        return status
    def settle(self,g):
        with opened(self.path) as c:
            c.execute('BEGIN IMMEDIATE')
            run=c.execute('SELECT day,held,count,unitprice,state FROM runs WHERE key=?',
                          (g.run_key,)).fetchone()
            if not run or run[4]!='reserved':c.execute('ROLLBACK');return 'denied_unknown'
            tickets=c.execute('SELECT state,units FROM tickets WHERE run_key=?',
                              (g.run_key,)).fetchall()
            if len(tickets)!=run[2] or any(s!='confirmed' for s,u in tickets):
                c.execute('ROLLBACK');return 'denied_partial'
            paid=sum(u for s,u in tickets)*run[3]
            if paid>run[1]:c.execute('ROLLBACK');return 'denied_over_cost'
            c.execute("UPDATE runs SET state='settled' WHERE key=?",(g.run_key,))
            c.execute('UPDATE usage SET held=held-?,settled=settled+? WHERE day=?',
                      (run[1],paid,run[0]))
            c.execute('COMMIT')
        return 'settled'
    def cancel_never_sent(self,g):
        # Missing/unknown Echo dispatch state is NOT evidence of non-dispatch.
        # Only an irrevocable Fake Echo-side never-queued fence can justify void.
        if not self.echo.is_cancel_fenced(g.run_key):
            return 'denied_dispatch_not_proven'
        with opened(self.path) as c:
            c.execute('BEGIN IMMEDIATE')
            run=c.execute('SELECT day,held,state FROM runs WHERE key=?',(g.run_key,)).fetchone()
            seen=c.execute('SELECT 1 FROM tickets WHERE run_key=? LIMIT 1',(g.run_key,)).fetchone()
            if not run or run[2]!='reserved' or seen:
                c.execute('ROLLBACK');return 'denied_possible_send'
            c.execute("UPDATE runs SET state='void' WHERE key=?",(g.run_key,))
            c.execute('UPDATE usage SET held=held-?,calls=calls-1 WHERE day=?',(run[1],run[0]))
            c.execute('COMMIT')
        return 'void'
    def reconcile(self,g,invoice,units,a,b):
        human1=self.ids.reviewer(a);human2=self.ids.reviewer(b)
        if not human1 or not human2 or human1==human2 or \
           not isinstance(invoice,str) or not re.fullmatch(r"[a-f0-9]{64}",invoice) or \
           type(units) is not int or units<0:return 'denied_review'
        with opened(self.path) as c:
            c.execute('BEGIN IMMEDIATE')
            row=c.execute('SELECT day,held,unitprice,state FROM runs WHERE key=?',
                          (g.run_key,)).fetchone()
            if not row or row[3]!='unknown':c.execute('ROLLBACK');return 'denied_not_unknown'
            existing=c.execute('SELECT invoice,units FROM reconciliations WHERE run_key=?',
                               (g.run_key,)).fetchone()
            if existing:
                c.execute('ROLLBACK')
                return 'already_reconciled' if existing==(invoice,units) else 'denied_conflict'
            # A supplier CHARGE LINE (not the whole batch invoice) is one-use
            # across ALL runs, including different UTC accounting dates.
            if c.execute('SELECT 1 FROM reconciliations WHERE invoice=?',
                         (invoice,)).fetchone():
                c.execute('ROLLBACK');return 'denied_invoice_reused'
            if not self.invoices.verified(invoice,g,units):
                c.execute('ROLLBACK');return 'denied_invoice_unverified'
            actual=units*row[2]
            if actual>row[1]:c.execute('ROLLBACK');return 'denied_over_hold'
            c.execute('INSERT INTO reconciliations VALUES(?,?,?,?,?,?)',
                      (g.run_key,invoice,human1,human2,units,actual))
            c.execute('UPDATE usage SET held=held-?,settled=settled+? WHERE day=?',
                      (row[1],actual,row[0]))
            c.execute('COMMIT')
        return 'reconciled'
    def totals(self):
        with opened(self.path) as c:
            return c.execute('SELECT COALESCE(SUM(calls),0),COALESCE(SUM(held),0),COALESCE(SUM(settled),0) FROM usage').fetchone()
    def count(self,table):
        if table not in ('runs','tickets','reconciliations'):raise ValueError('invalid fixture table')
        with opened(self.path) as c:
            return c.execute('SELECT COUNT(*) FROM '+table).fetchone()[0]
