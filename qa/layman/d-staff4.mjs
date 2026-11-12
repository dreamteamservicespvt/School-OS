import { asRole, go, mainText, sleep, close, snap, OUTA } from "./d-h.mjs";
import path from "node:path";
const p = await asRole("hr");
const log = async (tag, n = 1500) => console.log(`\n--- ${tag} [${new URL(p.url()).pathname}${new URL(p.url()).search}]\n` + (await mainText(p, 4000)).replace(/\n+/g, " | ").slice(0, n));
for (const q of ["Ramesh 1345", "Ramesh", "రమేష్", "LD-"]) {
  await go(p, "/staff-hr-management?q=" + encodeURIComponent(q)); await sleep(1200);
  const t = await mainText(p, 20000);
  console.log(`search "${q}":`, /No staff match/.test(t) ? "NO MATCH" : (t.match(/LD-[^\n]*/g) ?? []).join(","), "| on roll line:", t.match(/\d+ staff on roll/)?.[0]);
}
// try the search box like a person
await go(p, "/staff-hr-management"); await sleep(1500);
const box = p.getByRole("searchbox").first();
console.log("search box:", await box.count());
await go(p, "/staff-hr-management?q=LD-"); await sleep(1200);
const link = p.locator('main a[aria-label^="Open LD-"]').first();
const href = await link.getAttribute("href");
console.log("profile href", href);
await go(p, href); await sleep(1500);
await log("profile", 2500);
await snap(p, "staff4-profile");
console.log("buttons:", (await p.locator("main button:visible, main a:visible").allInnerTexts()).map((s) => s.trim()).filter(Boolean).join(" / ").slice(0, 800));
// ID card
const dl = async (url, name) => {
  const r = await p.request.get("http://localhost:3000" + url);
  const b = await r.body();
  const f = path.join(OUTA, name);
  (await import("node:fs")).writeFileSync(f, b);
  console.log("download", url, r.status(), r.headers()["content-type"], b.length, f);
};
for (const fm of ["xlsx","csv","pdf"]) await dl(`/staff-hr-management/export?format=${fm}`, `staff-export.${fm}`);
const id = href.split("/").pop();
await dl(`/staff-hr-management/id-cards?ids=${id}`, "staff-idcard.pdf");
await dl(`/staff-hr-management/id-cards`, "staff-idcards-all.pdf");
await close();
