// Layman A: Add class (empty, duplicate, long, Telugu, double click), add section, edit, archive.
import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const p = await asRole("admin");
const S = Date.now().toString().slice(-4);
const log = (k, v) => console.log(`== ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
const dlg = () => p.getByRole("dialog").last();
const dt = async () => (await dlg().innerText().catch(() => "")).replace(/\n+/g, " | ");
const fields = async () => dlg().evaluate((d) => [...d.querySelectorAll("input,select,textarea")].filter((e) => e.type !== "hidden").map((e) => `${e.tagName}:${e.name}:${e.type}:${(e.id && document.querySelector(`label[for="${e.id}"]`)?.innerText) || e.getAttribute("aria-label") || ""}`));
await go(p, "/academic-management"); await sleep(800);
await p.getByRole("button", { name: "Add class", exact: true }).click(); await sleep(1000);
log("add class dialog", (await dt()).slice(0, 800)); log("fields", await fields());
const btns = await dlg().evaluate((d) => [...d.querySelectorAll("button")].map((b) => b.innerText.trim()).filter(Boolean)); log("buttons", btns);
const submit = () => dlg().getByRole("button", { name: /^(Add class|Save|Adding|Saving)/ }).last();
await submit().click(); await sleep(1500);
log("empty", (await dt()).slice(0, 600));
const name = dlg().locator("input[name=name]");
await name.fill("Class 1"); await submit().click(); await sleep(2500);
log("duplicate Class 1", (await dt()).slice(0, 600));
await snap(p, "class-dup", false);
if (await dlg().isVisible().catch(() => false)) {
  await name.fill("LA-" + "తరగతి ".repeat(30)); await submit().click(); await sleep(2500);
  log("long telugu", (await dt()).slice(0, 400));
}
if (await dlg().isVisible().catch(() => false)) {
  await name.fill(`LA-తరగతి ${S}`); await submit().dblclick(); await sleep(4000);
  log("after add open?", await dlg().isVisible().catch(() => false)); log("after add dlg", (await dt()).slice(0, 300));
}
await go(p, "/academic-management"); await sleep(1000);
const t = await mainText(p, 30000);
log("LA class count", (t.match(new RegExp(`LA-తరగతి ${S}`, "g")) ?? []).length);
log("LA class block", t.slice(t.indexOf(`LA-తరగతి ${S}`) - 5, t.indexOf(`LA-తరగతి ${S}`) + 300).replace(/\n/g, " | "));
await snap(p, "class-added");
console.log("PROBLEMS", p.problems);
await close();
