"""N1A-S1 Round 2: offline Python adapter for the EXACT #469 SecurityProofV1 fields.

Ref: GitHub PR #469 head 629ba52462192645f93817c0bb1976a9cb025f18.
This is intentionally NOT a copy/import of AI2 code, nor a real verifier/signer.
It documents and tests current cross-branch semantic compatibility only.
"""
import re
import time
from n1a_s1_b07_fake import digest

UINT64_MAX = 18446744073709551615
SAFE_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,160}$")
CANONICAL_UINT64 = re.compile(r"^(0|[1-9][0-9]{0,19})$")
FIELDS = frozenset((
    "schemaVersion","issuer","audience","subjectId","appId","action",
    "resourceId","requestId","nonce","membershipRevision","permissionRevision",
    "correctionRevision","sourceRevision","securitySeq","restoreEpoch",
    "revocationWatermark","deletionWatermark","issuedAtMs","expiresAtMs",
    "approvalGrantId","fakeAttestation"
))
def wire_uint64(value):
    # Never roundtrip a proof version through JS Number or Python float.
    if type(value) is not int or value < 0 or value > UINT64_MAX:
        raise ValueError("version_outside_uint64")
    return str(value)

def parse_uint64(value):
    if not isinstance(value, str) or not CANONICAL_UINT64.fullmatch(value):
        raise ValueError("noncanonical_version")
    parsed = int(value)
    if parsed > UINT64_MAX:
        raise ValueError("version_above_uint64")
    return parsed

def safe_id(value):
    return isinstance(value, str) and bool(SAFE_ID.fullmatch(value))

class FakeB07SecurityBridge:
    """Two-stage FAKE evidence reader; never authorizes a production request."""

    def __init__(self, ids, witness, ledger):
        self.ids, self.witness, self.ledger = ids, witness, ledger
        self.membership_revision = {}
        self.permission_revision = {}
        self.correction_revision = {}
        self.revocation_watermark = 0
        self.deletion_watermark = 0
        self.blocked_subjects = set()
        self.deleted_resources = set()
        self.revoked_resources = set()
        self.attestation_registry = set()
        self.read_count = {"member": 0, "anchor": 0, "resource": 0}

    def issue_fake_proof(self, grant, request_id, *, now_ms=None):
        """Proof solely issued by the TEST fixture, not the UI or official ID."""
        now_ms = int(time.time() * 1000) if now_ms is None else now_ms
        attestation = digest("FAKE-ONLY-proof",grant.id,request_id,now_ms)
        self.attestation_registry.add(attestation)
        return {
            "schemaVersion": "N1A-S1-FAKE-v1",
            "issuer": "fake-star-id-plus-witness",
            "audience": "n1a-offline-only",
            "subjectId": grant.user,
            "appId": grant.app,
            "action": "ai.attempt",
            "resourceId": grant.track,
            "requestId": request_id,
            "nonce": "fake-one-use-nonce",
            "membershipRevision": self.membership_revision.get(grant.user, "4"),
            "permissionRevision": self.permission_revision.get(grant.track, "8"),
            "correctionRevision": self.correction_revision.get(grant.track, "3"),
            "sourceRevision": grant.source,
            "securitySeq": wire_uint64(grant.seq),
            "restoreEpoch": wire_uint64(grant.epoch),
            "revocationWatermark": wire_uint64(self.revocation_watermark),
            "deletionWatermark": wire_uint64(self.deletion_watermark),
            "issuedAtMs": now_ms-1000,
            "expiresAtMs": now_ms+5000,
            "approvalGrantId": grant.id,
            "fakeAttestation": attestation
        }

    def assess(self, proof, grant, request_id, *, now_ms=None,
               stage="before_commit"):
        """Follow AI2 #469 precheck/before_commit semantics, fail closed.

        Result is a fixture tuple (allow, reason). Even allow=True is NEVER a
        production authorization or a signer. Fresh member/witness/resource
        checks happen for EACH stage, not a reused cache.
        """
        def deny(reason):
            return False, reason
        if stage not in ("precheck", "before_commit"):
            return deny("unknown_stage")
        if not isinstance(proof,dict) or set(proof)!=FIELDS or            proof.get("schemaVersion")!="N1A-S1-FAKE-v1" or            proof.get("issuer")!="fake-star-id-plus-witness" or            proof.get("audience")!="n1a-offline-only":
            return deny("wrong_schema_or_audience")
        if not all(safe_id(proof[k]) for k in
                   ("subjectId","appId","resourceId","requestId","nonce")) or            not safe_id(request_id):
            return deny("invalid_identity")
        if proof["action"]!="ai.attempt" or            proof["subjectId"]!=grant.user or proof["appId"]!=grant.app or            proof["resourceId"]!=grant.track or proof["requestId"]!=request_id:
            return deny("proof_rebound_to_other_action")
        if not safe_id(proof["approvalGrantId"]) or proof["approvalGrantId"]!=grant.id:
            return deny("ai_grant_missing_or_mismatch")
        if not safe_id(proof["sourceRevision"]):
            return deny("invalid_or_noncanonical_version")
        try:
            for name in ("membershipRevision","permissionRevision",
                         "correctionRevision","securitySeq","restoreEpoch",
                         "revocationWatermark","deletionWatermark"):
                parse_uint64(proof[name])
        except ValueError:
            return deny("invalid_or_noncanonical_version")
        if type(proof["issuedAtMs"]) is not int or            type(proof["expiresAtMs"]) is not int:
            return deny("expired_or_future_proof")
        now_ms = int(time.time()*1000) if now_ms is None else now_ms
        if type(now_ms) is not int or proof["issuedAtMs"]>now_ms or            proof["expiresAtMs"]<=now_ms or            proof["expiresAtMs"]<=proof["issuedAtMs"] or            proof["expiresAtMs"]-proof["issuedAtMs"]>30000:
            return deny("expired_or_future_proof")
        if proof["fakeAttestation"] not in self.attestation_registry:
            return deny("unverified_fake_attestation")
        self.read_count["member"]+=1
        if not self.ids.can(grant.user,grant.app) or            proof["membershipRevision"]!=self.membership_revision.get(grant.user,"4"):
            return deny("membership_revoked_or_revision_changed")
        self.read_count["anchor"]+=1
        if self.witness.down:
            return deny("external_witness_missing")
        if proof["securitySeq"]!=wire_uint64(self.witness.seq) or            proof["restoreEpoch"]!=wire_uint64(self.witness.epoch) or            proof["revocationWatermark"]!=wire_uint64(self.revocation_watermark) or            proof["deletionWatermark"]!=wire_uint64(self.deletion_watermark) or            grant.id in self.witness.revoked or grant.user in self.blocked_subjects or            grant.track in self.deleted_resources or grant.track in self.revoked_resources:
            return deny("external_witness_changed_or_rolled_back")
        self.read_count["resource"]+=1
        if self.ledger.sources.get((grant.app,grant.track))!=grant.source or            proof["sourceRevision"]!=grant.source or            proof["permissionRevision"]!=self.permission_revision.get(grant.track,"8") or            proof["correctionRevision"]!=self.correction_revision.get(grant.track,"3"):
            return deny("resource_changed_since_approval")
        if not self.witness.valid(grant):
            return deny("external_witness_invalid_grant")
        return True, "fake_evidence_consistent"

    def fake_reserve(self,proof,grant,request_id,*,now_ms=None,run_id="run",day=None):
        ok,reason=self.assess(proof,grant,request_id,now_ms=now_ms,stage="precheck")
        if not ok: return "proof_denied:"+reason
        return self.ledger.reserve(grant,http_key=request_id,run=run_id,day=day)

    def fake_claim(self,proof,grant,request_id,run_id,segment,*,now_ms=None):
        ok,reason=self.assess(proof,grant,request_id,now_ms=now_ms,stage="before_commit")
        if not ok: return "proof_denied:"+reason
        return self.ledger.claim(grant,run_id,segment)
