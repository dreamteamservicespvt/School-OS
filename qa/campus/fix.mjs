// node qa/campus/fix.mjs edits.json — corrects result rows after a hand check:
// [{ "match": { "module": "...", "action": "..." }, "drop": true } | { "match": {...}, "set": { "status": "PASS", ... } }]
// A match value starting with "~" is a substring match.
import { readFileSync, writeFileSync } from "node:fs";
const FILE = "qa/results/campus.jsonl";
const edits = JSON.parse(readFileSync(process.argv[2], "utf8"));
const hit = (row, m) => Object.entries(m).every(([k, v]) => (String(v).startsWith("~") ? String(row[k] ?? "").includes(String(v).slice(1)) : row[k] === v));
let rows = readFileSync(FILE, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
for (const e of edits) {
  const before = rows.length;
  if (e.drop) rows = rows.filter((r) => !hit(r, e.match));
  else rows.forEach((r) => { if (hit(r, e.match)) Object.assign(r, e.set); });
  console.log(e.drop ? `dropped ${before - rows.length}` : `set ${rows.filter((r) => hit(r, e.match)).length}`, JSON.stringify(e.match));
}
writeFileSync(FILE, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
