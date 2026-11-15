# Layman loop "less text" pass: merge the new short words each area agent listed in
# qa-output/less-text/<area>.json ([{"en","hi","te"}]) into the en/hi/te catalogues, once, skipping
# words already there. Adds them before the closing "] as const;" (en) and "};" (hi, te).
#   python qa/loop/merge-less-text.py
import glob
import json

def quoted(s):
    return json.dumps(s, ensure_ascii=False)

items = []
for f in sorted(glob.glob("qa-output/less-text/*.json")):
    try:
        data = json.load(open(f, encoding="utf-8"))
    except Exception as e:
        print("SKIP (bad JSON)", f, e)
        continue
    for it in data:
        if isinstance(it, dict) and it.get("en"):
            items.append(it)

en_path, hi_path, te_path = (f"src/lib/i18n/catalogues/{l}.ts" for l in ("en", "hi", "te"))
en = open(en_path, encoding="utf-8").read()
hi = open(hi_path, encoding="utf-8").read()
te = open(te_path, encoding="utf-8").read()
seen = set()
add_en, add_hi, add_te = [], [], []
for it in items:
    k = it["en"]
    if k in seen:
        continue
    seen.add(k)
    q = quoted(k)
    if f"\n  {q}," not in en:
        add_en.append(f"  {q},\n")
    if it.get("hi") and f"\n  {q}:" not in hi:
        add_hi.append(f"  {q}: {quoted(it['hi'])},\n")
    if it.get("te") and f"\n  {q}:" not in te:
        add_te.append(f"  {q}: {quoted(it['te'])},\n")

def put(text, marker, lines, label):
    i = text.rindex(marker)
    head = "  // Layman loop 15 Nov: shorter words (less-text pass).\n" if lines else ""
    return text[:i] + head + "".join(lines) + text[i:]

open(en_path, "w", encoding="utf-8").write(put(en, "] as const;", add_en, "en"))
open(hi_path, "w", encoding="utf-8").write(put(hi, "};", add_hi, "hi"))
open(te_path, "w", encoding="utf-8").write(put(te, "};", add_te, "te"))
print(f"items {len(items)}, unique {len(seen)}; added en {len(add_en)}, hi {len(add_hi)}, te {len(add_te)}")
