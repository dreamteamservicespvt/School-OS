// Appends result rows to qa/results/platform.jsonl.
//   node qa/platform/rec.mjs '<json row>' ['<json row>' ...]   or   rows on stdin, one JSON per line
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
mkdirSync("qa/results", { recursive: true });
const args = process.argv.slice(2);
const lines = args.length ? args : readFileSync(0, "utf8").split("\n").filter((l) => l.trim());
for (const l of lines) {
  const row = JSON.parse(l);
  for (const k of ["module", "page", "action", "role", "expected", "actual", "status"]) if (!(k in row)) throw new Error(`missing ${k} in ${l}`);
  appendFileSync("qa/results/platform.jsonl", JSON.stringify(row) + "\n");
}
console.log("recorded", lines.length);
