// Night C (2026-11-13) helpers: same as d-h (code matched to this user's phone), output in qa-output/2026-11-13-night-C.
import path from "node:path";
process.env.QA_OUT = path.resolve("qa-output/2026-11-13-night-C");
const D = await import("./d-h.mjs");
export const { go, mainText, sleep, close, snap, OUTA, newPage, ok, finish, note, asRole } = D;
export const one = (t, n = 400) => String(t).replace(/\s*\n+\s*/g, " | ").slice(0, n);
/** Opens url, returns {ms, text, status}. */
export async function timed(p, url) {
  const t0 = Date.now();
  const r = await go(p, url).catch((e) => ({ status: () => "ERR " + e.message.slice(0, 80) }));
  const ms = Date.now() - t0;
  const text = await mainText(p, 6000).catch(() => "");
  return { ms, text, status: r?.status?.() };
}
export function watch(p) { p.problems = []; p.on("pageerror", (e) => p.problems.push(e.message.split("\n")[0].slice(0, 160))); p.on("console", (m) => { if (m.type() === "error") p.problems.push("console: " + m.text().slice(0, 160)); }); return p; }
