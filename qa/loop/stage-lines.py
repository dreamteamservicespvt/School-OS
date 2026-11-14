# Stage only some added lines of a file (others may have uncommitted edits in the same file, e.g. the
# translation catalogues). Builds HEAD + the added lines that contain one of the given texts.
#   python qa/loop/stage-lines.py <file> <text> [<text> ...]
import difflib
import subprocess
import sys

path, needles = sys.argv[1], sys.argv[2:]
head = subprocess.run(["git", "show", f"HEAD:{path}"], capture_output=True, check=True).stdout.decode("utf-8").split("\n")
work = open(path, encoding="utf-8").read().split("\n")
out = []
added = 0
for op, i1, i2, j1, j2 in difflib.SequenceMatcher(a=head, b=work, autojunk=False).get_opcodes():
    if op == "equal":
        out += head[i1:i2]
    elif op == "insert":
        keep = [l for l in work[j1:j2] if any(n in l for n in needles)]
        out += keep
        added += len(keep)
    elif op == "delete":
        out += head[i1:i2]
    else:  # replace: keep HEAD's lines, add only our new ones after them
        out += head[i1:i2]
        keep = [l for l in work[j1:j2] if any(n in l for n in needles) and l not in head[i1:i2]]
        out += keep
        added += len(keep)
blob = subprocess.run(["git", "hash-object", "-w", "--stdin"], input="\n".join(out).encode("utf-8"), capture_output=True, check=True).stdout.decode().strip()
mode = subprocess.run(["git", "ls-files", "-s", path], capture_output=True, check=True).stdout.decode().split()[0]
subprocess.run(["git", "update-index", "--cacheinfo", f"{mode},{blob},{path}"], check=True)
print(f"{path}: staged {added} line(s)")
