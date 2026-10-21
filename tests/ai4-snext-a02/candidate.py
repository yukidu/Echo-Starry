"""AI4 A02: offline candidate ranking on frozen synthetic fixture only.

Not a production search implementation or an independent blind benchmark.
No network, secrets, paid AI, user data, or gold-label use in ranking.
"""
import json
import pathlib
import re
import unicodedata
from difflib import SequenceMatcher

ROOT = pathlib.Path(__file__).resolve().parent
FIXTURE = ROOT.parent / "ai4-snext-a01" / "synthetic-120.json"
data = json.loads(FIXTURE.read_text(encoding="utf-8"))
assert data["synthetic"] and len(data["cases"]) == 120

# Small generic common-character map; a full licensed OpenCC mapping should
# replace this in a separately reviewed implementation. No case/track IDs.
SIMPLE = "报缴费复录载话码员备课开补问周检验电档体记习删额满获邮师讲办变关发统续"
TRAD =   "報繳費複錄載話碼員備課開補問週檢驗電檔體記習刪額滿獲郵師講辦變關發統續"
CONVERT = dict(zip(SIMPLE, TRAD))

def normalize(text):
    return "".join(CONVERT.get(ch, ch) for ch in unicodedata.normalize("NFKC", text).lower())

def clean(text):
    return re.sub(r"[^\w\u3400-\u9fff]", "", normalize(text))

def grams(text):
    return {text[i:i+2] for i in range(max(0, len(text)-1))}

# Reproduce the exact unmodified A01 lexical baseline without converting Chinese
# or omitting transcript segments. The submitted A02 had double-escaped regex
# character classes and indexed only the first segment; its before-score 0/0
# was not comparable to A01's independent 54/66.
def legacy_clean(s):
    return re.sub(r"[^\w\u3400-\u9fff]", "", unicodedata.normalize("NFKC", s).lower())

def baseline(query, track):
    q = grams(legacy_clean(query))
    transcript = " ".join(segment["text"] for segment in track["segments"])
    t = grams(legacy_clean(transcript))
    return len(q & t) / max(1, len(q))

def candidate(query, track):
    q = clean(query)
    t = clean(track["segments"][0]["text"])
    bigrams = len(grams(q) & grams(t)) / max(1, len(grams(q)))
    character_recall = len(set(q) & set(t)) / max(1, len(set(q)))
    query_windows = [q[i:i+n] for n in (2,3,4) for i in range(len(q)-n+1)]
    text_windows = [t[i:i+n] for n in (2,3,4) for i in range(len(t)-n+1)]
    fuzzy = max((SequenceMatcher(None, a, b).ratio()
                 for a in query_windows for b in text_windows), default=0)
    speaker_hint = 0.13 if normalize(track["speaker"]) in q else 0
    return 0.65 * bigrams + 0.22 * character_recall + 0.13 * fuzzy + speaker_hint

def topk(question, scorer):
    ranked = sorted(
        ((scorer(question, t), t["trackId"]) for t in data["tracks"]
         if t["scope"] == "public-synthetic"),
        key=lambda row: (-row[0], row[1])
    )
    return [tid for score, tid in ranked if score > 0]

counts = {name: {"n": 0, "old1": 0, "old5": 0, "new1": 0, "new5": 0}
          for name in ("traditional", "simplified", "colloquial", "typo", "context")}
misses = []
no_source = 0
revoked_excluded = 0
public_ids = {t["trackId"] for t in data["tracks"]}
for c in data["cases"]:
    if c["expectedAction"] == "ABSTAIN":
        no_source += 1  # No-source abstention policy is NOT implemented.
        continue
    if c["expectedAction"] == "DENY":
        revoked_excluded += int(c["resourceId"] not in public_ids)
        continue
    bucket = counts[c["category"]]
    bucket["n"] += 1
    old, new = topk(c["question"], baseline), topk(c["question"], candidate)
    gold = c["goldTrackIds"][0]
    for label, ids in (("old", old), ("new", new)):
        bucket[label+"1"] += int(bool(ids) and ids[0] == gold)
        bucket[label+"5"] += int(gold in ids[:5])
    if gold not in new[:5]:
        misses.append(c["caseId"])

print("RUN=AI4 A02 isolated candidate; frozen A01 fixture; not product or independent blind")
print("CATEGORY | N | BEFORE_TOP1 | BEFORE_TOP5 | AFTER_TOP1 | AFTER_TOP5")
for category, b in counts.items():
    print(f"{category} | {b['n']} | {b['old1']} | {b['old5']} | {b['new1']} | {b['new5']}")
totals = {k: sum(b[k] for b in counts.values()) for k in ("n","old1","old5","new1","new5")}
print(f"TOTAL | {totals['n']} | {totals['old1']} | {totals['old5']} | {totals['new1']} | {totals['new5']}")
print(f"AFTER_TOP5_TARGET_90={'PASS' if totals['new5'] >= 90 else 'FAIL'}")
print(f"AFTER_TOP5_MISSES={','.join(misses)}")
print(f"NO_SOURCE={no_source} ABSTENTION_NOT_IMPLEMENTED_NOT_VERIFIED")
print(f"REVOKED_EXCLUDED={revoked_excluded}/10 CORPUS_ONLY_NOT_AUTHORIZATION")
print("WRONG_CITATION=NOT_VERIFIED; PERMISSION_SEND=NOT_VERIFIED")
print("PRODUCT_SEARCH=NOT_TESTED; THIRD_PARTY_BLIND=NOT_VERIFIED")
assert totals["n"] == 100 and no_source == 10 and revoked_excluded == 10
