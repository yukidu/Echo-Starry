"""End-to-end offline tests: real temporary SQLite files and fake R2 byte files."""
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from offline_restore import Blocked, OfflineHarness, APP, connect, digest, sealed, signature, wire


class TestRestoreGate(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ai7_a03_FAKE_ONLY_')
        self.addCleanup(self.temp.cleanup)
        self.h = OfflineHarness(Path(self.temp.name))

    def blocked(self, code, mutate=None, request_id='request-001', after_preview=None):
        if mutate:
            mutate()
        with self.assertRaises(Blocked) as captured:
            self.h.simulate(request_id=request_id, after_preview=after_preview)
        self.assertEqual(captured.exception.code, code)

    def test_valid_full_delta_actual_preview_sqlite(self):
        result = self.h.simulate()
        self.assertEqual(result['decision'], 'SIMULATION_ONLY')
        self.assertFalse(result['production_authorized'])
        self.assertFalse(result['actual_restore'])
        self.assertFalse(result['actual_delete'])
        self.assertFalse(result['cutover_performed'])
        with connect(result['shadow_file']) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM preview_tracks').fetchone()[0], 2)
            self.assertEqual(db.execute('SELECT body,version FROM preview_tracks WHERE id=?', ('echo:T1',)).fetchone(), ('FAKE_AUDIO_V2', 2))

    def test_full_root_missing(self):
        self.blocked('CHAIN_MISSING', lambda: self.h.fake_r2.joinpath('full-10').unlink() or self._delete_index('full-10'))

    def _delete_index(self, bid):
        with connect(self.h.backup_db) as db:
            db.execute('DELETE FROM backups WHERE backup_id=?', (bid,))

    def test_delta_object_missing(self):
        self.blocked('FAKE_R2_MISSING', lambda: (self.h.fake_r2 / 'delta-11').unlink())

    def test_full_object_missing(self):
        self.blocked('FAKE_R2_MISSING', lambda: (self.h.fake_r2 / 'full-10').unlink())

    def test_delta_object_corrupted(self):
        self.blocked('FAKE_R2_HASH_MISMATCH', lambda: (self.h.fake_r2 / 'delta-11').write_bytes(b'CORRUPTED_FAKE_AUDIO'))

    def test_full_object_corrupted(self):
        self.blocked('FAKE_R2_HASH_MISMATCH', lambda: (self.h.fake_r2 / 'full-10').write_bytes(b'CORRUPTED_FAKE_AUDIO'))

    def test_parent_manifest_hash_mismatch(self):
        def mutate():
            m = self.h.get_manifest('delta-11')
            m['parent_hash'] = 'bad_hash'
            self.h.replace_manifest('delta-11', m)
            self.h.head = self.h.make_head()
            self.h.approvals = self.h.make_approvals('request-001')
        self.blocked('CHAIN_PARENT_HASH', mutate)

    def test_parent_cycle(self):
        def mutate():
            m = self.h.get_manifest('delta-11')
            m['parent'] = 'delta-11'
            m['parent_hash'] = 'cycle_hash'
            self.h.replace_manifest('delta-11', m)
        self.blocked('CHAIN_PARENT_HASH', mutate)

    def test_full_bad_parent(self):
        def mutate():
            m = self.h.get_manifest('full-10')
            m['parent'] = 'delta-11'
            self.h.replace_manifest('full-10', m)
            d = self.h.get_manifest('delta-11')
            d['parent_hash'] = digest(wire(m))
            self.h.replace_manifest('delta-11', d)
        self.blocked('CHAIN_PARENT', mutate)

    def test_nonmonotonic_backup_seq(self):
        def mutate():
            m = self.h.get_manifest('full-10')
            m['seq'] = 12
            self.h.replace_manifest('full-10', m)
            d = self.h.get_manifest('delta-11')
            d['parent_hash'] = digest(wire(m))
            self.h.replace_manifest('delta-11', d)
        self.blocked('CHAIN_ROLLBACK', mutate)

    def test_cross_app_manifest_rejected(self):
        def mutate():
            m = self.h.get_manifest('delta-11')
            m['app_id'] = 'download'
            self.h.replace_manifest('delta-11', m)
        self.blocked('CROSS_APP', mutate)

    def test_cross_app_record_rejected(self):
        def mutate():
            data = {'upserts': [{'id': 'starry-id:private', 'body': 'FAKE_MEMBER', 'version': 2}], 'deletes': []}
            m = self.h.get_manifest('delta-11')
            (self.h.fake_r2 / 'delta-11').write_bytes(wire(data))
            m['payload_hash'] = digest(wire(data))
            self.h.replace_manifest('delta-11', m)
            self.h.head = self.h.make_head()
            self.h.approvals = self.h.make_approvals('request-001')
        self.blocked('CROSS_APP', mutate)

    def test_after_backup_tombstone_denies(self):
        self.blocked('TOMBSTONE_AFTER_BACKUP', lambda: self.h.tombstone('echo:T1'))

    def test_after_backup_revocation_denies(self):
        self.blocked('REVOCATION_AFTER_BACKUP', lambda: self.h.revoke_track('echo:T1'))

    def test_tombstone_during_preview_denies(self):
        self.blocked('TOMBSTONE_AFTER_BACKUP', after_preview=lambda h: h.tombstone('echo:T1'))

    def test_revocation_during_preview_denies(self):
        self.blocked('REVOCATION_AFTER_BACKUP', after_preview=lambda h: h.revoke_track('echo:T1'))

    def test_epoch_rollback_denies(self):
        self.blocked('EPOCH_ROLLBACK', lambda: self.h.set_safety(restore_epoch=4))

    def test_head_invalid_signature(self):
        self.blocked('HEAD_SIGNATURE', lambda: self.h.head.update(signature='tampered'))

    def test_floor_invalid_signature(self):
        self.blocked('FLOOR_SIGNATURE', lambda: self.h.floor.update(signature='tampered'))

    def test_head_stale(self):
        def mutate():
            self.h.head['body']['expires_at'] = 100
            self.h.head['signature'] = signature('head', self.h.head['body'])
        self.blocked('WITNESS_STALE', mutate)

    def test_floor_ahead_of_head(self):
        def mutate():
            self.h.floor['body']['min_seq'] = 20
            self.h.floor['signature'] = signature('floor', self.h.floor['body'])
        self.blocked('FLOOR_ROLLBACK', mutate)

    def test_approval_one_human_absent(self):
        self.blocked('TWO_HUMANS', lambda: self.h.approvals.pop())

    def test_approval_same_human_alias_denied(self):
        self.blocked('TWO_HUMANS', lambda: setattr(self.h, 'approvals', self.h.make_approvals('request-001', ('admin-a', 'admin-a-alias'))))

    def test_second_human_revoked(self):
        self.blocked('APPROVAL_REVOKED', lambda: self.h.revoke_admin('admin-b'))

    def test_approval_signature_mismatch(self):
        self.blocked('APPROVAL_SIGNATURE', lambda: self.h.approvals[0].update(signature='tampered'))

    def test_approval_wrong_request(self):
        self.blocked('APPROVAL_REQUEST_MISMATCH', lambda: setattr(self.h, 'approvals', self.h.make_approvals('wrong-request')))

    def test_one_time_claim_persisted_in_sqlite(self):
        self.h.simulate()
        self.blocked('CLAIM_REPLAY')
        with connect(self.h.authority_db) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM claims').fetchone()[0], 1)

    def test_replay_after_crash_like_midflight(self):
        self.blocked('REVOCATION_AFTER_BACKUP', after_preview=lambda h: h.revoke_track('echo:T1'))
        self.blocked('REVOCATION_AFTER_BACKUP')  # fail-closed before attempted replay
        with connect(self.h.authority_db) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM claims').fetchone()[0], 1)

    def test_writer_fork_blocked(self):
        self.blocked('CUTOVER_UNSAFE', lambda: self.h.set_safety(writer_count=2))

    def test_pending_durable_object_blocked(self):
        self.blocked('CUTOVER_UNSAFE', lambda: self.h.set_safety(pending_do=1))

    def test_pending_workflow_blocked(self):
        self.blocked('CUTOVER_UNSAFE', lambda: self.h.set_safety(pending_workflow=1))

    def test_oauth_incompatible_blocked(self):
        self.blocked('CUTOVER_UNSAFE', lambda: self.h.set_safety(oauth_compatible=0))

    def test_cookie_incompatible_blocked(self):
        self.blocked('CUTOVER_UNSAFE', lambda: self.h.set_safety(cookie_compatible=0))

    def test_authority_unavailable_denies(self):
        self.blocked('AUTHORITY_UNKNOWN', lambda: self.h.set_safety(authority_available=0))

    def test_approval_revoked_during_preview_denies(self):
        self.blocked('APPROVAL_REVOKED', after_preview=lambda h: h.revoke_admin('admin-b'))

    def test_second_full_from_wrong_app_never_reached(self):
        def mutate():
            m = self.h.get_manifest('full-10')
            m['app_id'] = 'id'
            self.h.replace_manifest('full-10', m)
        self.blocked('CHAIN_PARENT_HASH', mutate)

    def test_missing_backup_index_denies(self):
        self.blocked('CHAIN_MISSING', lambda: self._delete_index('full-10'))

    def test_valid_sha_but_invalid_json_denies(self):
        def mutate():
            raw = b'{broken json fake payload'
            (self.h.fake_r2 / 'delta-11').write_bytes(raw)
            m = self.h.get_manifest('delta-11')
            m['payload_hash'] = digest(raw)
            self.h.replace_manifest('delta-11', m)
            self.h.head = self.h.make_head()
            self.h.approvals = self.h.make_approvals('request-001')
        self.blocked('FAKE_R2_INVALID_JSON', mutate)

    def test_fake_delta_resource_revision_rollback_denies(self):
        def mutate():
            raw = wire({'upserts': [{'id': 'echo:T1', 'body': 'FAKE_OLD_VERSION', 'version': 1}], 'deletes': []})
            (self.h.fake_r2 / 'delta-11').write_bytes(raw)
            m = self.h.get_manifest('delta-11')
            m['payload_hash'] = digest(raw)
            self.h.replace_manifest('delta-11', m)
            self.h.head = self.h.make_head()
            self.h.approvals = self.h.make_approvals('request-001')
        self.blocked('RESOURCE_REVISION_ROLLBACK', mutate)

    def test_stale_but_correctly_signed_head_denies(self):
        def mutate():
            self.h.head['body']['backup_id'] = 'full-10'
            self.h.head['body']['seq'] = 10
            self.h.head['body']['manifest_hash'] = digest(wire(self.h.get_manifest('full-10')))
            self.h.head['signature'] = signature('head', self.h.head['body'])
            self.h.approvals = self.h.make_approvals('request-001')
        self.blocked('HEAD_NOT_LATEST', mutate)

    def test_floor_custodian_same_as_head_denies(self):
        def mutate():
            self.h.floor['body']['custodian'] = 'offline-head-a'
            self.h.floor['signature'] = signature('floor', self.h.floor['body'])
        self.blocked('WITNESS_NOT_INDEPENDENT', mutate)

    def test_floor_expired_denies(self):
        def mutate():
            self.h.floor['body']['expires_at'] = 100
            self.h.floor['signature'] = signature('floor', self.h.floor['body'])
        self.blocked('WITNESS_STALE', mutate)

    def test_missing_floor_denies(self):
        self.blocked('FLOOR_SIGNATURE', lambda: setattr(self.h, 'floor', None))

    def test_wrong_approval_scope_denies(self):
        self.blocked('APPROVAL_REQUEST_MISMATCH',
                     lambda: setattr(self.h, 'approvals', self.h.make_approvals('request-001', scope='echo.backup.commit')))

    def test_expired_approval_denies(self):
        def mutate():
            self.h.approvals[1]['body']['expires_at'] = 100
            self.h.approvals[1]['signature'] = signature('admin-b', self.h.approvals[1]['body'])
        self.blocked('APPROVAL_EXPIRED', mutate)

    def test_epoch_changes_between_preview_and_simulated_cutover(self):
        self.blocked('EPOCH_ROLLBACK', after_preview=lambda h: h.set_safety(restore_epoch=4))
        self.assertFalse((self.h.root / 'synthetic-restore-preview.sqlite').exists())

    def test_writer_fork_during_preview_denies_and_erases_local_preview(self):
        self.blocked('CUTOVER_UNSAFE', after_preview=lambda h: h.set_safety(writer_count=2))
        self.assertFalse((self.h.root / 'synthetic-restore-preview.sqlite').exists())

    def test_revocation_during_preview_erases_local_preview(self):
        self.blocked('REVOCATION_AFTER_BACKUP', after_preview=lambda h: h.revoke_track('echo:T2'))
        self.assertFalse((self.h.root / 'synthetic-restore-preview.sqlite').exists())

    def test_short_lived_witnesses_future_dated_denied(self):
        def mutate():
            self.h.head['body']['issued_at'] = 2_000_000_000
            self.h.head['signature'] = signature('head', self.h.head['body'])
            self.h.approvals = self.h.make_approvals('request-001')
        self.blocked('WITNESS_STALE', mutate)

    def test_no_nonfake_data_or_remote_clients(self):
        import offline_restore
        self.assertFalse(hasattr(offline_restore, 'CloudflareClient'))
        self.assertFalse(hasattr(offline_restore, 'production_restore'))
        self.assertTrue(all(p.is_file() for p in self.h.fake_r2.iterdir()))
        self.assertTrue(self.h.root.resolve().is_relative_to(Path(tempfile.gettempdir()).resolve()))


if __name__ == '__main__':
    unittest.main(verbosity=2)
