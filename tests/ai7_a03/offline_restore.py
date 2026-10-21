"""AI7 A03: offline SQLite + fake R2 byte-file backup restore gate.

TEST ONLY. No Cloudflare clients, endpoints, production credentials or real restore.
Every successful outcome is a local isolated preview, NEVER production authorization.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import re
import sqlite3
from contextlib import contextmanager, closing
from pathlib import Path

APP = 'echo'
FAKE_SIGNER_KEYS = {
    'head': b'FAKE_TEST_ONLY_HEAD_KEY_NEVER_USE_FOR_PRODUCTION',
    'floor': b'FAKE_TEST_ONLY_FLOOR_KEY_NEVER_USE_FOR_PRODUCTION',
    'admin-a': b'FAKE_TEST_ONLY_ADMIN_A_KEY_NEVER_USE_FOR_PRODUCTION',
    'admin-b': b'FAKE_TEST_ONLY_ADMIN_B_KEY_NEVER_USE_FOR_PRODUCTION',
    'admin-a-alias': b'FAKE_TEST_ONLY_ADMIN_A_ALIAS_KEY',
}
FIXED_NOW = 1_800_000_000
VALID_UNTIL = FIXED_NOW + 3600


@contextmanager
def connect(path, **kwargs):
    # sqlite3.Connection context manager does not close the descriptor itself.
    with closing(sqlite3.connect(path, **kwargs)) as db:
        with db:
            yield db


def wire(obj):
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode('utf-8')


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def signature(role, body):
    return hmac.new(FAKE_SIGNER_KEYS[role], wire(body), 'sha256').hexdigest()


def sealed(role, body):
    return {'body': body, 'signature': signature(role, body)}


class Blocked(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def require(condition, code):
    if not condition:
        raise Blocked(code)


def verify_seal(role, document, code):
    require(isinstance(document, dict) and 'body' in document and 'signature' in document, code)
    require(role in FAKE_SIGNER_KEYS and isinstance(document['signature'], str), code)
    require(hmac.compare_digest(signature(role, document['body']), document['signature']), code)
    return document['body']


class OfflineHarness:
    """Only owns a caller-created temporary folder. sqlite files are real local files."""

    def __init__(self, root: Path):
        self.root = Path(root)
        self.fake_r2 = self.root / 'fake_r2'
        self.fake_r2.mkdir(parents=True, exist_ok=True)
        self.backup_db = self.root / 'backup-index.sqlite'
        self.authority_db = self.root / 'independent-authority.sqlite'
        with connect(self.backup_db) as db:
            db.executescript('''
            CREATE TABLE backups (
              backup_id TEXT PRIMARY KEY, manifest BLOB NOT NULL
            );
            ''')
        with connect(self.authority_db) as db:
            db.executescript('''
            CREATE TABLE safety (
              app_id TEXT PRIMARY KEY, restore_epoch INTEGER NOT NULL,
              revocation_seq INTEGER NOT NULL, deletion_seq INTEGER NOT NULL,
              writer_count INTEGER NOT NULL, pending_do INTEGER NOT NULL,
              pending_workflow INTEGER NOT NULL, oauth_compatible INTEGER NOT NULL,
              cookie_compatible INTEGER NOT NULL, authority_available INTEGER NOT NULL
            );
            INSERT INTO safety VALUES ('echo', 3, 0, 0, 1, 0, 0, 1, 1, 1);
            CREATE TABLE administrators (
              admin_id TEXT PRIMARY KEY, human_id TEXT NOT NULL,
              active INTEGER NOT NULL, role_revision INTEGER NOT NULL
            );
            INSERT INTO administrators VALUES('admin-a','human-001',1,1);
            INSERT INTO administrators VALUES('admin-b','human-002',1,1);
            INSERT INTO administrators VALUES('admin-a-alias','human-001',1,1);
            CREATE TABLE tombstones(track_id TEXT PRIMARY KEY, seq INTEGER NOT NULL);
            CREATE TABLE revocations(track_id TEXT PRIMARY KEY, seq INTEGER NOT NULL);
            CREATE TABLE claims(request_id TEXT PRIMARY KEY, target_id TEXT NOT NULL, claimed_at INTEGER NOT NULL);
            ''')
        self.put_backup('full-10', 'FULL', None, 10,
                        {'records': [{'id': 'echo:T1', 'body': 'FAKE_AUDIO_V1', 'version': 1},
                                     {'id': 'echo:T2', 'body': 'FAKE_AUDIO_2', 'version': 1}]}, 0, 0)
        self.put_backup('delta-11', 'DELTA', 'full-10', 11,
                        {'upserts': [{'id': 'echo:T1', 'body': 'FAKE_AUDIO_V2', 'version': 2}], 'deletes': []}, 0, 0)
        self.target = 'delta-11'
        self.head = self.make_head()
        self.floor = self.make_floor()
        self.approvals = self.make_approvals('request-001')

    def get_safety(self):
        with connect(self.authority_db) as db:
            db.row_factory = sqlite3.Row
            return dict(db.execute('SELECT * FROM safety WHERE app_id=?', (APP,)).fetchone())

    def set_safety(self, **fields):
        allowed = {'restore_epoch', 'revocation_seq', 'deletion_seq', 'writer_count',
                   'pending_do', 'pending_workflow', 'oauth_compatible',
                   'cookie_compatible', 'authority_available'}
        require(bool(fields) and set(fields) <= allowed, 'INVALID_FAKE_TEST_SETUP')
        with connect(self.authority_db) as db:
            for key, value in fields.items():
                db.execute(f'UPDATE safety SET {key}=? WHERE app_id=?', (value, APP))

    def revoke_admin(self, admin_id):
        with connect(self.authority_db) as db:
            db.execute('UPDATE administrators SET active=0, role_revision=role_revision+1 WHERE admin_id=?', (admin_id,))

    def tombstone(self, track_id, seq=1):
        with connect(self.authority_db) as db:
            db.execute('INSERT OR REPLACE INTO tombstones VALUES (?,?)', (track_id, seq))
            db.execute('UPDATE safety SET deletion_seq=MAX(deletion_seq,?) WHERE app_id=?', (seq, APP))

    def revoke_track(self, track_id, seq=1):
        with connect(self.authority_db) as db:
            db.execute('INSERT OR REPLACE INTO revocations VALUES (?,?)', (track_id, seq))
            db.execute('UPDATE safety SET revocation_seq=MAX(revocation_seq,?) WHERE app_id=?', (seq, APP))

    def get_manifest(self, backup_id):
        with connect(self.backup_db) as db:
            result = db.execute('SELECT manifest FROM backups WHERE backup_id=?', (backup_id,)).fetchone()
        require(result is not None, 'CHAIN_MISSING')
        try:
            manifest = json.loads(result[0])
        except (json.JSONDecodeError, TypeError):
            raise Blocked('CHAIN_CORRUPT') from None
        return manifest

    def replace_manifest(self, backup_id, manifest):
        """Synthetic attacker mutation to verify chain and authority gates."""
        with connect(self.backup_db) as db:
            db.execute('UPDATE backups SET manifest=? WHERE backup_id=?', (wire(manifest), backup_id))

    def put_backup(self, backup_id, kind, parent, seq, payload, revoke_seq, delete_seq, app=APP):
        require(re.fullmatch(r'[A-Za-z0-9_-]{1,64}', backup_id) is not None, 'INVALID_ID')
        data = wire(payload)
        # This is a *local* fake R2 bucket. Never a Cloudflare R2 binding.
        (self.fake_r2 / backup_id).write_bytes(data)
        parent_hash = digest(wire(self.get_manifest(parent))) if parent else None
        manifest = {
            'backup_id': backup_id, 'kind': kind, 'parent': parent, 'parent_hash': parent_hash,
            'app_id': app, 'seq': seq, 'payload_hash': digest(data),
            'revocation_seq': revoke_seq, 'deletion_seq': delete_seq, 'restore_epoch': 3,
        }
        with connect(self.backup_db) as db:
            db.execute('INSERT INTO backups VALUES (?,?)', (backup_id, wire(manifest)))
        return manifest

    def make_head(self):
        m = self.get_manifest(self.target)
        return sealed('head', {
            'role': 'head', 'custodian': 'offline-head-a', 'app_id': APP, 'backup_id': self.target,
            'manifest_hash': digest(wire(m)), 'seq': m['seq'], 'restore_epoch': m['restore_epoch'],
            'issued_at': FIXED_NOW - 30, 'expires_at': VALID_UNTIL,
        })

    def make_floor(self):
        return sealed('floor', {
            'role': 'floor', 'custodian': 'offline-floor-b', 'app_id': APP,
            'min_seq': self.get_manifest(self.target)['seq'], 'restore_epoch': 3,
            'issued_at': FIXED_NOW - 30, 'expires_at': VALID_UNTIL,
        })

    def make_approvals(self, request_id, admins=('admin-a', 'admin-b'), scope='echo.backup.preview'):
        s = self.get_safety()
        m = self.get_manifest(self.target)
        request = {'request_id': request_id, 'backup_id': self.target, 'app_id': APP,
                   'manifest_hash': digest(wire(m)), 'restore_epoch': s['restore_epoch'],
                   'scope': scope, 'head_hash': digest(wire(self.head))}
        result = []
        for admin_id in admins:
            with connect(self.authority_db) as db:
                row = db.execute('SELECT human_id,role_revision FROM administrators WHERE admin_id=?', (admin_id,)).fetchone()
            require(row is not None, 'INVALID_FAKE_TEST_SETUP')
            body = {**request, 'admin_id': admin_id, 'human_id': row[0], 'role_revision': row[1],
                    'issued_at': FIXED_NOW - 30, 'expires_at': VALID_UNTIL}
            result.append(sealed(admin_id, body))
        return result

    def _read_chain(self):
        seen = set()
        chain = []
        backup_id = self.target
        newer_seq = float('inf')
        while backup_id is not None:
            require(re.fullmatch(r'[A-Za-z0-9_-]{1,64}', backup_id) is not None, 'INVALID_ID')
            require(backup_id not in seen, 'CHAIN_CYCLE')
            seen.add(backup_id)
            m = self.get_manifest(backup_id)
            require(m['backup_id'] == backup_id and m['app_id'] == APP, 'CROSS_APP')
            require(isinstance(m['seq'], int) and m['seq'] < newer_seq, 'CHAIN_ROLLBACK')
            require(m['restore_epoch'] == self.get_safety()['restore_epoch'], 'EPOCH_ROLLBACK')
            newer_seq = m['seq']
            path = self.fake_r2 / backup_id
            require(path.is_file(), 'FAKE_R2_MISSING')
            data = path.read_bytes()
            require(hmac.compare_digest(digest(data), m['payload_hash']), 'FAKE_R2_HASH_MISMATCH')
            try:
                payload = json.loads(data)
            except json.JSONDecodeError:
                raise Blocked('FAKE_R2_INVALID_JSON') from None
            require(isinstance(payload, dict), 'FAKE_R2_INVALID_JSON')
            chain.append((m, payload))
            if m['kind'] == 'FULL':
                require(m['parent'] is None and m['parent_hash'] is None, 'CHAIN_PARENT')
                break
            require(m['kind'] == 'DELTA' and isinstance(m['parent'], str), 'CHAIN_PARENT')
            parent = self.get_manifest(m['parent'])
            require(m['parent_hash'] == digest(wire(parent)), 'CHAIN_PARENT_HASH')
            backup_id = m['parent']
        else:
            raise Blocked('FULL_ROOT_MISSING')
        chain.reverse()
        require(len(chain) >= 1 and chain[0][0]['kind'] == 'FULL', 'FULL_ROOT_MISSING')
        return chain

    def _check_witnesses(self, now):
        head = verify_seal('head', self.head, 'HEAD_SIGNATURE')
        floor = verify_seal('floor', self.floor, 'FLOOR_SIGNATURE')
        for obj, role in ((head, 'head'), (floor, 'floor')):
            require(obj['role'] == role and obj['app_id'] == APP, 'WITNESS_SCOPE')
            require(obj['issued_at'] <= now < obj['expires_at'], 'WITNESS_STALE')
        require(head['custodian'] != floor['custodian'], 'WITNESS_NOT_INDEPENDENT')
        require(head['backup_id'] == self.target and head['manifest_hash'] == digest(wire(self.get_manifest(self.target))), 'HEAD_NOT_LATEST')
        require(head['seq'] >= floor['min_seq'], 'FLOOR_ROLLBACK')
        require(head['seq'] == self.get_manifest(self.target)['seq'], 'HEAD_NOT_LATEST')
        current_epoch = self.get_safety()['restore_epoch']
        require(head['restore_epoch'] == current_epoch and floor['restore_epoch'] == current_epoch, 'EPOCH_ROLLBACK')
        return head

    def _check_approvals(self, request_id, now):
        require(len(self.approvals) == 2, 'TWO_HUMANS')
        expected = {'request_id': request_id, 'backup_id': self.target, 'app_id': APP,
                    'manifest_hash': digest(wire(self.get_manifest(self.target))),
                    'restore_epoch': self.get_safety()['restore_epoch'],
                    'scope': 'echo.backup.preview', 'head_hash': digest(wire(self.head))}
        humans, admins = set(), set()
        for approved in self.approvals:
            admin_id = approved.get('body', {}).get('admin_id')
            require(admin_id in FAKE_SIGNER_KEYS and admin_id.startswith('admin-'), 'TWO_HUMANS')
            body = verify_seal(admin_id, approved, 'APPROVAL_SIGNATURE')
            require(all(body.get(k) == v for k, v in expected.items()), 'APPROVAL_REQUEST_MISMATCH')
            require(body['issued_at'] <= now < body['expires_at'], 'APPROVAL_EXPIRED')
            with connect(self.authority_db) as db:
                found = db.execute('SELECT human_id,active,role_revision FROM administrators WHERE admin_id=?', (admin_id,)).fetchone()
            require(found is not None and found[1] == 1 and body['role_revision'] == found[2] and body['human_id'] == found[0], 'APPROVAL_REVOKED')
            humans.add(body['human_id'])
            admins.add(admin_id)
        require(len(admins) == 2 and len(humans) == 2, 'TWO_HUMANS')

    def _check_current(self, chain):
        s = self.get_safety()
        require(s['authority_available'] == 1, 'AUTHORITY_UNKNOWN')
        require(s['writer_count'] == 1 and s['pending_do'] == 0 and s['pending_workflow'] == 0, 'CUTOVER_UNSAFE')
        require(s['oauth_compatible'] == 1 and s['cookie_compatible'] == 1, 'CUTOVER_UNSAFE')
        newest = chain[-1][0]
        require(newest['restore_epoch'] == s['restore_epoch'], 'EPOCH_ROLLBACK')
        require(newest['revocation_seq'] >= s['revocation_seq'], 'REVOCATION_AFTER_BACKUP')
        require(newest['deletion_seq'] >= s['deletion_seq'], 'TOMBSTONE_AFTER_BACKUP')
        with connect(self.authority_db) as db:
            require(db.execute('SELECT COUNT(*) FROM tombstones WHERE seq > ?', (newest['deletion_seq'],)).fetchone()[0] == 0, 'TOMBSTONE_AFTER_BACKUP')
            require(db.execute('SELECT COUNT(*) FROM revocations WHERE seq > ?', (newest['revocation_seq'],)).fetchone()[0] == 0, 'REVOCATION_AFTER_BACKUP')
        return s

    def _make_shadow_preview(self, chain):
        """Actual sqlite writes ONLY to an isolated synthetic preview DB."""
        contents = {}
        previous_versions = {}
        for index, (manifest, payload) in enumerate(chain):
            if index == 0:
                require(manifest['kind'] == 'FULL' and isinstance(payload.get('records'), list), 'INVALID_PAYLOAD')
                edits = payload['records']
                deletes = []
            else:
                require(manifest['kind'] == 'DELTA' and isinstance(payload.get('upserts'), list) and isinstance(payload.get('deletes'), list), 'INVALID_PAYLOAD')
                edits, deletes = payload['upserts'], payload['deletes']
            require(len({r['id'] for r in edits}) == len(edits), 'DUPLICATE_TRACK')
            for track in deletes:
                require(isinstance(track, str) and track.startswith('echo:'), 'CROSS_APP')
                contents.pop(track, None)
            for record in edits:
                require(isinstance(record, dict) and isinstance(record['id'], str) and record['id'].startswith('echo:'), 'CROSS_APP')
                require(isinstance(record['body'], str) and record['body'].startswith('FAKE_'), 'INVALID_PAYLOAD')
                require(isinstance(record['version'], int) and record['version'] > previous_versions.get(record['id'], 0), 'RESOURCE_REVISION_ROLLBACK')
                previous_versions[record['id']] = record['version']
                contents[record['id']] = record
        shadow = self.root / 'synthetic-restore-preview.sqlite'
        if shadow.exists():
            shadow.unlink()  # disposable *local synthetic* file, never production DELETE
        with connect(shadow) as db:
            db.execute('CREATE TABLE preview_tracks(id TEXT PRIMARY KEY, body TEXT NOT NULL, version INTEGER NOT NULL)')
            db.executemany('INSERT INTO preview_tracks VALUES (?,?,?)',
                           [(item['id'], item['body'], item['version']) for item in contents.values()])
        return shadow

    def simulate(self, request_id='request-001', now=FIXED_NOW, after_preview=None):
        """No worker client, no real cutover: returns fake isolated preview only."""
        require(re.fullmatch(r'[A-Za-z0-9_-]{1,64}', request_id) is not None, 'INVALID_REQUEST')
        chain = self._read_chain()
        self._check_current(chain)
        self._check_witnesses(now)
        self._check_approvals(request_id, now)
        with connect(self.authority_db, isolation_level=None) as db:
            db.execute('BEGIN IMMEDIATE')
            try:
                db.execute('INSERT INTO claims(request_id,target_id,claimed_at) VALUES (?,?,?)',
                           (request_id, self.target, now))
            except sqlite3.IntegrityError:
                db.rollback()
                raise Blocked('CLAIM_REPLAY') from None
            db.commit()
        shadow = self._make_shadow_preview(chain)
        try:
            if after_preview:
                after_preview(self)
            # Last-moment authority recheck; never make a production cutover.
            self._check_current(chain)
            self._check_witnesses(now)
            self._check_approvals(request_id, now)
            with connect(shadow) as db:
                entries = db.execute('SELECT id,body,version FROM preview_tracks ORDER BY id').fetchall()
        except Exception:
            # Only disposable *local* fake SQLite preview cleanup on DENY.
            # No production DELETE, cleanup API or external storage call exists.
            shadow.unlink(missing_ok=True)
            raise
        return {'decision': 'SIMULATION_ONLY', 'production_authorized': False,
                'actual_restore': False, 'actual_delete': False, 'cutover_performed': False,
                'tracks': entries, 'shadow_file': str(shadow)}
