# Ties each remaining non-PASS row to its defect, or marks it BLOCKED with the reason.
# Statuses are not raised to PASS here: only a browser or server-call run does that.
#   python3 -I qa/people/annotate.py qa/results/people.jsonl
import json
import sys

path = sys.argv[1]
rows = [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()]
BASE_NOTE = " [Base build: every Add student save fails with 'Required' (PEOPLE-10), so this check could not be reached on :3000.]"
DEV_NOTE = "Dev server of the fix branch (:3102) gave no answer to the save under memory pressure (killed twice, Chromium pages crashed); not browser-verified. The rule is covered by vitest in commit 827b4c3."

for r in rows:
    if r["status"] == "PASS" or r.get("defect"):
        continue
    p, a = r["page"], r["action"]
    if p == "New application" and "future" in a:
        r["defect"] = "PEOPLE-07"
    elif p == "New application" and "no consent code" in a:
        r["status"], r["defect"] = "NEEDS EXTERNAL CREDENTIAL", "PEOPLE-06"
    elif p == "Add student" and "roll number" in a:
        r["defect"] = "PEOPLE-11"
        r["actual"] += BASE_NOTE
    elif p == "Add student" and "205-character" in a:
        r["defect"] = "PEOPLE-25"
        r["actual"] += BASE_NOTE
    elif p == "Add student":
        r["defect"] = "PEOPLE-10"
        r["actual"] += BASE_NOTE
    elif p.startswith("Add student (with fixes") and "205-character" in a:
        r["defect"] = "PEOPLE-25"
    elif p.startswith("Add student (with fixes"):
        r["status"], r["actual"] = "BLOCKED", DEV_NOTE
    elif p == "Message History" and "Test-mode" in a:
        r["defect"] = "PEOPLE-14"
        r["actual"] = "Base build: no test-mode mark on the list or the message. " + r["actual"][:120]
    elif p == "Parent Link (guardian page)" and "Consent forms" in a:
        r["status"] = "BLOCKED"
        r["actual"] = "Not on page: CEMS has no consent forms published, and the section is hidden when empty. Consent forms belong to another module; not created here."

if not any(r["action"].startswith("Book a PTM slot") for r in rows):
    rows.append({
        "module": "Communication", "page": "Parent Link (guardian page)",
        "action": "Book a PTM slot on Kavya Reddy's Parent Link", "role": "Parent (no login)",
        "expected": "Free times listed; booking saves and does not promise a message that cannot go",
        "actual": "No PTM and no PTM slots exist for CEMS (ptm and ptm_slot: 0 rows); the page shows only Events and PTM with holidays, and no Book button. PTMs are set up in Events (another area), so not created here. Code note, not tested: bookPtmSlot says 'A confirmation message is on its way' even when no channel is set up.",
        "status": "BLOCKED",
    })

with open(path, "w", encoding="utf-8") as f:
    for r in rows:
        f.write(json.dumps(r, ensure_ascii=False) + "\n")
from collections import Counter
print(Counter(r["status"] for r in rows), len(rows))
print([r["action"][:60] for r in rows if r["status"] == "FAIL" and not r.get("defect")])
