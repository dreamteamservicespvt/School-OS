// Layman A: Export the student list (CSV) and the attendance register; check the file's dates and words.
import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
import { readFileSync } from "node:fs";
const p = await asRole("admin");
await go(p, "/student-management?class=" ); await sleep(800);
await p.locator("main").getByText("Export", { exact: true }).first().click(); await sleep(1200);
const dl = p.locator("main details[open], [role=dialog]").last();
console.log("EXPORT BOX", (await dl.innerText().catch(() => "(no dialog)")).replace(/\n+/g, " | ").slice(0, 900));
await snap(p, "exp-student-box", false);
const csv = dl.locator("label").filter({ hasText: /CSV/ }).first();
if (await csv.count()) await csv.click();
const [d] = await Promise.all([p.waitForEvent("download", { timeout: 30000 }).catch(() => null), dl.getByRole("button", { name: /Export|Download/ }).last().click().catch((e) => console.log("click err", String(e).slice(0, 100)))]);
if (d) { const f = await d.path(); const txt = readFileSync(f, "utf8"); console.log("FILE", d.suggestedFilename(), "lines", txt.split("\n").length); console.log(txt.split("\n").slice(0, 3).join("\n").slice(0, 800)); console.log("ISO dates?", (txt.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? []).slice(0, 3), "null/undefined?", /undefined|null|NaN/.test(txt)); }
else console.log("NO DOWNLOAD");
// teacher register export
const t = await asRole("teacher");
await go(t, "/attendance-management/register"); await sleep(800);
await t.locator("main").getByText("Export", { exact: true }).first().click(); await sleep(1200);
console.log("REG EXPORT UI", (await t.getByRole("dialog").last().innerText().catch(async () => (await mainText(t, 600)))).replace(/\n+/g, " | ").slice(0, 600));
const links = await t.evaluate(() => [...document.querySelectorAll("a[href*='export']")].map((a) => a.getAttribute("href")));
console.log("REG LINKS", links.slice(0, 5));
if (links[0]) { const r = await t.request.get("http://localhost:3000" + (links.find((l) => /csv/.test(l)) ?? links[0])); const body = await r.text(); console.log("REG FILE", r.status(), r.headers()["content-type"], body.slice(0, 400)); }
await close();
