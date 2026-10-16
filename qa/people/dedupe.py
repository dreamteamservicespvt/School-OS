# Keeps the last result for each (module, page, action, role) and drops rows a later, better run replaced.
#   python3 qa/people/dedupe.py qa/results/people.jsonl
import json
import sys
from collections import Counter

path = sys.argv[1]
rows = [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()]
# Superseded by a row with a different action text (a script read the wrong thing on the first run).
drop = {
    ("Front Office", "Appointments", "Book Demo Appointment Lakshmi at 9:45 AM (confirmation on, no SMS/WhatsApp connected)"),
    ("Front Office", "Check a pass", "Gate checks pass V-0001"),
    ("Front Office", "Appointments", "Mark the appointment arrived"),
}
keep, order = {}, []
for r in rows:
    if (r["module"], r["page"], r["action"]) in drop:
        continue
    k = (r["module"], r["page"], r["action"], r["role"])
    if k not in keep:
        order.append(k)
    keep[k] = r
out = [keep[k] for k in order]
with open(path, "w", encoding="utf-8") as f:
    for r in out:
        f.write(json.dumps(r, ensure_ascii=False) + "\n")
print(len(rows), "->", len(out))
print(Counter(r["status"] for r in out))
