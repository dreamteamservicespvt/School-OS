// Calls every school server action as a login, with placeholder arguments shaped
// from its TypeScript signature, and sorts the replies:
//   refused  - the server said the role does not allow it
//   problem  - a plain-words problem (validation, not found) before or after the check
//   ok?      - no problem came back: read these by hand
//
//   QA_OUT=... node qa/platform/action-sweep.mjs <login> [filter]
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { OUT, close } from "../lib.mjs";
import { as } from "./util.mjs";
import { callAction, words } from "./action-call.mjs";

const [login, filter = ""] = process.argv.slice(2);
const SKIP = /signOut|changePassword|switchSchool|setAppearance|consoleTheme|undoChange|setTwoStep|signOutOthers/;
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}
const ZERO = "00000000-0000-4000-8000-000000000000";
function argsFor(params) {
  if (!params.trim()) return [];
  // split on top-level commas
  const parts = [];
  let depth = 0, cur = "";
  for (const ch of params) {
    if ("<({[".includes(ch)) depth++;
    if (">)}]".includes(ch)) depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => {
    const type = p.split(":").slice(1).join(":").trim();
    if (/FormData/.test(type)) return { __form: { id: ZERO } };
    if (/State|unknown|_prev|^_/.test(type) || /^\s*_/.test(p)) return null;
    if (/boolean/.test(type)) return true;
    if (/number/.test(type)) return 1;
    if (/\[\]|Array/.test(type)) return [ZERO];
    if (/Record|\{/.test(type)) return {};
    return ZERO;
  });
}
const targets = [];
for (const f of walk("src/app/(school)")) {
  const src = readFileSync(f, "utf8");
  if (!/^\s*["']use server["']/m.test(src.slice(0, 400))) continue;
  for (const m of src.matchAll(/export\s+async\s+function\s+(\w+)\s*(?:<[^>]*>)?\(([^)]*)\)/g)) {
    if (SKIP.test(m[1]) || !`${f}::${m[1]}`.includes(filter)) continue;
    targets.push({ file: f, name: m[1], args: argsFor(m[2]) });
  }
}
const page = await as(login);
const out = [];
const tally = {};
for (const t of targets) {
  let r;
  try { r = await callAction(page.context(), t.file, t.name, t.args); } catch (e) { r = { status: "ERR", text: String(e.message) }; }
  const w = words(r.text);
  let kind = "ok?";
  if (r.status === "ERR" || r.status >= 500) kind = "error";
  else if (/does not allow|cannot|Only (the|a|people)|not allowed|no access|isn't yours|is not yours|your role|not for your|Ask your School Admin/i.test(w)) kind = "refused";
  else if (/not found|Choose|needed|must|is not|was not|No |That did not|could not|nothing|Give |Pick|Type|missing|not valid|isn't|Enter/i.test(w)) kind = "problem";
  if (/redirect/.test(r.redirect ?? "") || /sign-in/.test(r.redirect ?? "")) kind = `redirect ${r.redirect}`;
  tally[kind] = (tally[kind] ?? 0) + 1;
  out.push({ file: t.file, name: t.name, status: r.status, kind, words: w.slice(0, 220) });
}
writeFileSync(path.join(OUT, `sweep-${login}.json`), JSON.stringify(out, null, 1));
console.log(login, targets.length, tally);
for (const o of out.filter((o) => o.kind === "ok?" || o.kind === "error")) console.log(o.kind, o.file.replace("src/app/(school)/", ""), o.name, "|", o.words.slice(0, 160));
await close();
