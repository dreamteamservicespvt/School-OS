// Lists exported server actions ("use server" files) that never reach a server-side
// permission check (requireAction / requirePage / requireCurrent / getCurrent), following
// helper calls across files. Name based, so it can miss a case; it is a pointer for review.
// node qa/platform/scan-actions.mjs   (run from the repo root)
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}
const files = walk("src").map((f) => ({ f, src: readFileSync(f, "utf8") }));

// Every top-level function-ish definition: name -> bodies.
const defs = new Map();
for (const { f, src } of files) {
  const re = /^(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|const\s+(\w+)\s*=)/gm;
  const idx = [];
  let m;
  while ((m = re.exec(src))) idx.push({ name: m[1] ?? m[2], at: m.index });
  idx.forEach((e, i) => {
    const body = src.slice(e.at, idx[i + 1]?.at ?? src.length).replace(/^[^\n(=]*/, "");
    const list = defs.get(e.name) ?? [];
    list.push({ f, body });
    defs.set(e.name, list);
  });
}
const direct = /\b(requireAction|requirePage|requireCurrent|getCurrent|requirePermission)\s*\(/;
const guarded = new Set(["requireAction", "requirePage", "requireCurrent", "getCurrent", "requirePermission"]);
let changed = true;
while (changed) {
  changed = false;
  for (const [name, list] of defs) {
    if (guarded.has(name)) continue;
    if (list.some(({ body }) => direct.test(body) || [...body.matchAll(/\b(\w+)\s*(?:<[^>()]*>)?\(/g)].some((c) => guarded.has(c[1]) && c[1] !== name))) {
      guarded.add(name);
      changed = true;
    }
  }
}
let n = 0;
const sus = [];
for (const { f, src } of files) {
  if (!/^\s*["']use server["']/m.test(src.slice(0, 400))) continue;
  const re = /export\s+(?:async\s+function\s+(\w+)|const\s+(\w+)\s*=)/g;
  const idx = [];
  let m;
  while ((m = re.exec(src))) idx.push({ name: m[1] ?? m[2], at: m.index });
  idx.forEach((e, i) => {
    n++;
    const body = src.slice(e.at, idx[i + 1]?.at ?? src.length).replace(/^[^\n(=]*/, "");
    const calls = [...body.matchAll(/\b(\w+)\s*(?:<[^>()]*>)?\(/g)].map((c) => c[1]);
    if (!direct.test(body) && !calls.some((c) => guarded.has(c) && c !== e.name)) sus.push(`${f} :: ${e.name}`);
  });
}
console.log("exported server actions:", n, " without a reachable check:", sus.length);
console.log(sus.join("\n"));
