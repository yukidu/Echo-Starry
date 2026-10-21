"""Offline-only synthetic lexical baseline. Standard library; no network, secrets, or product APIs."""
import json
import pathlib
import re
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parent
data = json.loads((ROOT / "synthetic-120.json").read_text(encoding="utf-8"))
assert data["synthetic"] and len(data["cases"]) == 120
assert len({c["caseId"] for c in data["cases"]}) == 120
assert sum(c["expectedAction"] == "ANSWER" for c in data["cases"]) == 100
assert sum(c["expectedAction"] != "ANSWER" for c in data["cases"]) == 20

def grams(s):
    s = re.sub(r"[^\w\u3400-\u9fff]", "", unicodedata.normalize("NFKC", s).lower())
    return {s[i:i+2] for i in range(max(0, len(s)-1))}

def rank(question):
    q = grams(question)
    scored = []
    for t in data["tracks"]:
        if t["scope"] != "public-synthetic":
            continue
        text = " ".join(s["text"] for s in t["segments"])
        # This is intentionally simple: it does not use gold labels or case IDs.
        score = len(q & grams(text)) / max(1, len(q))
        scored.append((score, t["trackId"]))
    return [tid for score, tid in sorted(scored, key=lambda x: (-x[0], x[1])) if score > 0]

top1 = top5 = 0
failures = []
refused = 0
for c in data["cases"]:
    if c["expectedAction"] == "DENY":
        # Synthetic revoked resources are not present in searchable public corpus.
        assert c["resourceId"] not in {t["trackId"] for t in data["tracks"]}
        refused += 1
        continue
    if c["expectedAction"] == "ABSTAIN":
        # A lexical ranker cannot safely infer unanswerability from overlap alone.
        # Record as unverified rather than pretending a successful refusal.
        failures.append((c["caseId"], "ABSTAIN_UNVERIFIED"))
        continue
    ids = rank(c["question"])
    gold = set(c["goldTrackIds"])
    hit1 = bool(ids and ids[0] in gold)
    hit5 = bool(gold.intersection(ids[:5]))
    top1 += int(hit1)
    top5 += int(hit5)
    if not hit5:
        failures.append((c["caseId"], "TOP5_MISS"))
print(f"DATASET cases={len(data['cases'])}, answerable=100, no-source=10, revoked=10")
print(f"TOY_LEXICAL Top1={top1}/100; Top5={top5}/100")
print(f"REVOKED synthetic corpus-exclusion={refused}/10 (NOT a permission/SEND test)")
print("NO_SOURCE refusal=NOT VERIFIED; CITATION/TIMECODE=NOT VERIFIED")
print("FAILURES", failures)
print("PRODUCT QUALITY=NOT TESTED; INDEPENDENT BLIND=NOT VERIFIED")
