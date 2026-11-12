import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const p = await asRole("admin");
const S = Date.now().toString().slice(-3);
const log = (k, v) => console.log(`== ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
const dlg = () => p.getByRole("dialog").last();
const dt = async () => (await dlg().innerText().catch(() => "")).replace(/\n+/g, " | ");
await go(p, "/academic-management/subjects"); await sleep(800);
await p.getByRole("button", { name: "Add subject", exact: true }).click(); await sleep(1000);
log("dialog", (await dt()).slice(0, 700));
log("fields", await dlg().evaluate((d) => [...d.querySelectorAll("input,select,textarea")].filter((e) => e.type !== "hidden").map((e) => `${e.tagName}:${e.name}:${e.type}:${(e.id && document.querySelector(`label[for="${e.id}"]`)?.innerText) || e.closest("label")?.innerText?.slice(0, 30) || ""}`)));
const submit = () => dlg().getByRole("button", { name: /^(Add subject|Save|Adding|Saving)/ }).last();
await submit().click(); await sleep(1500); log("empty", (await dt()).slice(0, 400));
const nm = dlg().locator("input[name=name]"); const code = dlg().locator("input[name=code]");
await nm.fill("Maths"); if (await code.count()) await code.fill("MAT"); await submit().click(); await sleep(2500);
log("dup code MAT", (await dt()).slice(0, 400));
await nm.fill("mathematics"); if (await code.count()) await code.fill("MTX"); await submit().click(); await sleep(2500);
log("dup name lowercase", (await dt()).slice(0, 400));
await snap(p, "subj-dup", false);
if (await dlg().isVisible().catch(() => false)) {
  await nm.fill(`LA-సంస్కృతం ${S}`); if (await code.count()) await code.fill(`LA${S}`);
  await submit().click(); await sleep(3500);
  log("after add open?", await dlg().isVisible().catch(() => false)); log("box", (await dt()).slice(0, 300));
}
await go(p, "/academic-management/subjects"); await sleep(1000);
log("list", ((await mainText(p, 5000)).match(/LA-[^\n]*\n?[^\n]*/g) ?? []).join(" / "));
await snap(p, "subj-after");
console.log("PROBLEMS", p.problems);
await close();
