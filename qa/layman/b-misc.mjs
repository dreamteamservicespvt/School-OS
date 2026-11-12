// Layman B: fee head form, late-fee settings form (cancel), import with wrong files, defaulters filters, ledger search.
import { asRole, go, mainText, sleep, snap } from "../full/selftest-A-h.mjs";
import { appendFileSync } from "node:fs";
import path from "node:path";
const OUT = process.env.QA_OUT; const log = (...a) => { const s = a.join(" "); console.log(s); appendFileSync(`${OUT}/misc.log`, s + "\n"); };
const p = await asRole("accountant");
const errs = []; p.on("pageerror", (e) => errs.push(`${p.url()} ${e.message}`));
const dlg = () => p.getByRole("dialog").last();
const dt = async () => (await dlg().innerText().catch(() => "")).replace(/\n+/g, " | ");
const msgs = async (root) => (await (root ?? dlg()).innerText().catch(() => "")).split(/\n/).filter((l) => /must|more than|cannot|least|limit|over|between|only|needed|Type the|Enter|Choose|not|wrong|could/i.test(l) && l.length < 220).join(" || ");
const step = process.argv[2] ?? "all";
if (step === "all" || step === "head") {
  await go(p, "/fee-management/structure"); await sleep(2000);
  await p.getByRole("button", { name: "Add fee head" }).or(p.getByRole("link", { name: "Add fee head" })).first().click({ timeout: 60000 }); await sleep(2500);
  log("HEAD SHEET", (await dt()).slice(0, 1500)); await snap(p, "head-sheet", false);
  const sv = dlg().getByRole("button", { name: /Save|Add|Send|Create/ }).last();
  log("HEAD btn", await sv.innerText().catch(() => "?"));
  await sv.click().catch(() => {}); for (let i = 0; i < 30 && /…/.test(await dt()); i++) await sleep(1000); await sleep(1000);
  log("HEAD empty ->", await msgs()); await snap(p, "head-empty", false);
  await p.keyboard.press("Escape"); await sleep(500);
}
if (step === "all" || step === "late") {
  await go(p, "/fee-management/settings"); await sleep(2000);
  await p.locator("main").getByRole("button", { name: "Change" }).first().click({ timeout: 60000 }); await sleep(2500);
  log("LATE SHEET", (await dt()).slice(0, 1500)); await snap(p, "late-sheet", false);
  await p.keyboard.press("Escape"); await sleep(500);
}
if (step === "all" || step === "import") {
  for (const [u, f] of [["/fee-management/ledger/import", "notes.txt"], ["/fee-management/ledger/import", "bad.csv"], ["/finance-management/expenses/import", "bad.csv"], ["/salary-management/structures/import", "notes.txt"]]) {
    await go(p, u); await sleep(2000);
    const inp = p.locator("main input[type=file]").first();
    await inp.setInputFiles(path.join(OUT, "files", f)).catch((e) => log("setInputFiles failed", e.message.slice(0, 80)));
    await sleep(800);
    const sel = p.locator("main select").first(); if (await sel.count()) await sel.selectOption({ index: 1 }).catch(() => {});
    await p.locator("main").getByRole("button", { name: /Upload and check/ }).click().catch((e) => log("no upload button", e.message.slice(0, 60)));
    for (let i = 0; i < 40 && /…/.test(await mainText(p, 3000)); i++) await sleep(1000); await sleep(2000);
    log(`IMPORT ${u} ${f} -> ${p.url().replace("http://localhost:3000", "")} |`, await msgs(p.locator("main")));
    await snap(p, `import-${u.split("/")[1].split("-")[0]}-${f.replace(".", "_")}`, false);
  }
}
if (step === "all" || step === "def") {
  await go(p, "/fee-management/defaulters"); await sleep(2000);
  const s = p.locator("main").getByPlaceholder(/Search/).first();
  await s.fill("zzzz-no-such"); await sleep(3000);
  log("DEF search none ->", (await mainText(p, 6000)).split("Students with overdue fees")[1]?.slice(0, 300).replace(/\n/g, " / "));
  await s.fill("Vaishnavi"); await sleep(3000);
  log("DEF search Vaishnavi ->", (await mainText(p, 6000)).split("Students with overdue fees")[1]?.slice(0, 300).replace(/\n/g, " / "));
  await snap(p, "def-search");
  await p.locator("main").getByRole("button", { name: /Send reminder to all/ }).click().catch(() => {}); await sleep(2500);
  log("DEF remind-all sheet ->", (await dt()).slice(0, 800)); await snap(p, "def-remind-all", false);
  await p.keyboard.press("Escape");
}
log("ERRS", errs.join(" ; "));
process.exit(0);
