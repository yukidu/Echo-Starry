"""Central AI2 A04 independently-authored synthetic holdout acceptance.

This is NOT a production search or third-party/human blind test.
Predictions are computed before gold labels are read for scoring.
If quality or no-source safety is not proven, exit nonzero (release BLOCKED).
"""
import contextlib
import hashlib
import io
import json
import pathlib
import runpy
import sys

BASE = pathlib.Path(__file__).resolve().parents[2]
CANDIDATE = BASE / "tests/ai4-snext-a02/candidate.py"
CORPUS = BASE / "tests/ai4-snext-a01/synthetic-120.json"
HOLDOUT = pathlib.Path(__file__).with_name("holdout-50.json")

PINNED_BLOBS = {
    CANDIDATE: "3c83e2c9bf42fb353b220ff59da6c4f0edb7a92f",
    CORPUS: "93bf9fcb0b793a7d9904b85ce5ed699b0a906549",
    HOLDOUT: "022a93514c9e668c335ed68cd1528caa4a0362c5",
}


def verify_exact_source():
    for path, expected in PINNED_BLOBS.items():
        content = path.read_bytes()
        actual = hashlib.sha1(b"blob " + str(len(content)).encode() + b"\0" + content).hexdigest()
        if actual != expected:
            raise ValueError(f"FROZEN_BLOB_MISMATCH: {path.name}")


def evaluate():
    verify_exact_source()
    corpus = json.loads(CORPUS.read_text("utf-8"))
    holdout = json.loads(HOLDOUT.read_text("utf-8"))
    assert corpus["synthetic"] is True and holdout["synthetic"] is True
    assert len(corpus["tracks"]) == 20
    cases = holdout["cases"]
    assert len(cases) == 50
    assert len({case["caseId"] for case in cases}) == 50
    assert sum(c["expectedAction"] == "ANSWER" for c in cases) == 40
    assert sum(c["expectedAction"] == "ABSTAIN" for c in cases) == 10

    # Execute EXACT candidate Python code from the frozen integration branch.
    # Suppress its A01 stdout; this runner scores separate, independently authored questions.
    with contextlib.redirect_stdout(io.StringIO()):
        candidate_module = runpy.run_path(str(CANDIDATE), run_name="ai2_a04_synthetic_ranker")
    rank = candidate_module["topk"]
    scorer = candidate_module["candidate"]

    # Stage predictions without consulting goldTrackIds, even though the
    # holdout answers are present in the frozen file for later adjudication.
    predicted = {case["caseId"]: rank(case["question"], scorer)[:5] for case in cases}
    top1 = top5 = safe_abstentions = 0
    misses = []
    leakage = []
    for case in cases:
        ids = predicted[case["caseId"]]
        if case["expectedAction"] == "ABSTAIN":
            if not ids:
                safe_abstentions += 1
            else:
                leakage.append(case["caseId"])
            continue
        gold = case["goldTrackIds"][0]
        top1 += int(bool(ids) and ids[0] == gold)
        if gold in ids:
            top5 += 1
        else:
            misses.append(case["caseId"])
    result = {
        "run": "AI2_A04_SYNTHETIC_HOLDOUT_NOT_PRODUCT",
        "sourceBlob": PINNED_BLOBS[CANDIDATE],
        "holdoutBlob": PINNED_BLOBS[HOLDOUT],
        "cases": len(cases),
        "answerable": 40,
        "noSource": 10,
        "top1": top1,
        "top5": top5,
        "top5Threshold": 36,
        "safeAbstentions": safe_abstentions,
        "safeAbstentionsRequired": 10,
        "misses": misses,
        "unsafeNoSource": leakage,
        "product": "NOT_TESTED",
        "thirdPartyBlind": "NOT_VERIFIED",
        "liveAuthorization": "NOT_VERIFIED",
    }
    result["gate"] = "PASS_SYNTHETIC_ONLY" if top5 >= 36 and safe_abstentions == 10 else "BLOCKED"
    print("AI2_A04_HOLDOUT_RESULT=" + json.dumps(result, sort_keys=True, ensure_ascii=False))
    return result["gate"] == "PASS_SYNTHETIC_ONLY"


if __name__ == "__main__":
    try:
        sys.exit(0 if evaluate() else 1)
    except (AssertionError, KeyError, OSError, ValueError) as error:
        print("AI2_A04_HOLDOUT_ERROR=" + type(error).__name__ + ": " + str(error), file=sys.stderr)
        sys.exit(2)
