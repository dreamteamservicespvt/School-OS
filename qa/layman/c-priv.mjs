// Layman C: can a teacher open papers/report cards that are not theirs? Can the student open other report cards?
import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const a = await asRole("admin");
await go(a, "/examination-results/marks"); await sleep(1000);
const links = await a.locator("main a[href*='/examination-results/marks/']").evaluateAll((as) => as.map((x) => [x.getAttribute("href"), x.innerText.replace(/\s+/g, " ").slice(0, 50)]));
const eng6a = links.find((l) => /English · Class 6 A/.test(l[1]));
const math6b = links.find((l) => /Mathematics · Class 6 B/.test(l[1]));
console.log("eng6a", eng6a, "math6b", math6b);
await go(a, "/examination-results/report-cards"); await sleep(1000);
const rc = await a.locator("main a").evaluateAll((as) => as.filter((x) => /PDF/i.test(x.innerText)).map((x) => x.getAttribute("href")));
await a.context().close();
const t = await asRole("teacher");
for (const [name, u] of [["English 6 A (Padma)", eng6a?.[0]], ["Maths 6 B (Swathi)", math6b?.[0]], ["Report card PDF of Class 1 A", rc[0]]]) {
  if (!u) continue;
  const r = await t.request.get(`http://localhost:3000${u}`);
  await go(t, u); await sleep(1200);
  const s = await mainText(t, 1200);
  console.log("TEACHER", name, "HTTP", r.status(), r.headers()["content-type"], "->", new URL(t.url()).pathname, s.replace(/\n+/g, " | ").slice(0, 250));
  await snap(t, `c-priv-teacher-${name.replace(/\W+/g, "_")}`, false);
}
// Try saving marks on another teacher's paper through the page if it opened
await t.context().close();
const s = await asRole("student");
for (const [name, u] of [["Report card PDF of Class 1 A", rc[0]], ["English 6 A marks", eng6a?.[0]]]) {
  const r = await s.request.get(`http://localhost:3000${u}`);
  console.log("STUDENT", name, "HTTP", r.status(), r.headers()["content-type"], (await r.text()).slice(0, 120).replace(/\s+/g, " "));
}
await close();
