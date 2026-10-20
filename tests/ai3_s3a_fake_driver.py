"""Private JSONL test child. Temp SQLite only; no provider/network capability."""
import json
import socket
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
sys.path.insert(0, str(Path(__file__).resolve().parent))
from n1a_s1_b07_fake import FakeId, FakeIndependentWitness, FakeEchoQueue, FakeCostLedger

def no_network(*args, **kwargs):
    raise RuntimeError('offline fixture: networking forbidden')
socket.socket = no_network
socket.create_connection = no_network

with TemporaryDirectory(prefix='ai3-s3a-offline-') as root:
    ids = FakeId()
    ids.register('member-one')
    for admin in ('a1', 'a2'):
        ids.register(admin, 'starry-id')
    witness = FakeIndependentWitness()
    echo = FakeEchoQueue(str(Path(root) / 'echo.sqlite'))
    ledger = FakeCostLedger(str(Path(root) / 'central.sqlite'), ids, witness, echo)
    grants = {}
    for line in sys.stdin:
        try:
            q = json.loads(line)
            op = q['op']
            g = grants.get(q.get('grant'))
            if op == 'issue':
                g = witness.issue('member-one', track=q.get('track', 'track-one'))
                grants[g.id] = g
                ledger.sources[(g.app, g.track)] = g.source
                result = {'id': g.id, 'held': g.held}
            elif op == 'reserve':
                result = ledger.reserve(g, http_key=q.get('request', 'request'), run=q.get('run', 'run'))
            elif op == 'enqueue':
                result = echo.enqueue(q['run'], g)
            elif op == 'claim':
                result = ledger.claim(g, q['run'], 0)
            elif op == 'send':
                result = ledger.fake_provider(g, 0, q.get('outcome', 'confirmed'))
            elif op == 'settle':
                result = ledger.settle(g)
            elif op == 'attest':
                result = ledger.invoices.attest_fake_invoice_line(q['invoice'], g, 1)
            elif op == 'reconcile':
                result = ledger.reconcile(g, q['invoice'], 1, 'a1', 'a2')
            elif op == 'snapshot':
                result = {'runs': ledger.count('runs'), 'tickets': ledger.count('tickets'),
                          'reconciliations': ledger.count('reconciliations'),
                          'totals': ledger.totals(), 'fakeSends': ledger.fake_sends,
                          'realProviderCalls': 0, 'productionAuthorized': False}
            else:
                raise ValueError('unknown fixture operation')
            print(json.dumps({'result': result}), flush=True)
        except Exception:
            print(json.dumps({'error': 'offline_fixture_rejected'}), flush=True)
