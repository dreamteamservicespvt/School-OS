// Journey E1, part 7: send the offer letter, confirm admission (with section), then open the new student.
//   node qa/full/j1g-confirm.mjs "<child name>"
import { as } from "./look.mjs";
import { go, mainText, shot, close } from "./h.mjs";
const [child] = process.argv.slice(2);
const p = await as("principal");
const card = () => p.locator("main li, main article, main section > div").filter({ hasText: child }).filter({ has: p.getByRole("button") }).last();
for (const btn of ["Send offer letter", "Confirm admission"]) {
  await go(p, "/admission-management/decision?tab=approved");
  const c = card();
  if (!(await c.getByRole("button", { name: btn, exact: true }).count())) { console.log("NO BUTTON", btn); continue; }
  await c.getByRole("button", { name: btn, exact: true }).click();
  await p.waitForTimeout(1500);
  const d = p.getByRole("dialog").last();
  if (await d.count()) {
    console.log(`DIALOG ${btn}:`, (await d.innerText()).replace(/\n+/g, " | ").slice(0, 900));
    const f = await d.evaluate((root) => [...root.querySelectorAll("input:not([type=hidden]), select, textarea, [role=combobox]")].map((e) => `${e.tagName}:${e.type ?? ""}#${e.id}[${e.name ?? ""}]${e.tagName === "SELECT" ? " {" + [...e.options].map((o) => o.text).join("|") + "}" : ""}`));
    console.log("  FIELDS", f.join(" ; "));
    // pick a section if a select is there
    const sel = d.locator("select").first();
    if (await sel.count()) { const opts = await sel.locator("option").allInnerTexts(); const pick = opts.find((o) => /\bA\b|Section A/.test(o)) ?? opts[1]; if (pick) await sel.selectOption({ label: pick }); console.log("  PICKED", pick); }
    const ok = d.getByRole("button", { name: new RegExp(btn.split(" ")[0], "i") }).last();
    for (let i = 0; i < 2; i++) await ok.click({ timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(4000);
    console.log("  AFTER DIALOG", (await p.getByRole("dialog").last().innerText().catch(() => "(closed)")).replace(/\n+/g, " | ").slice(0, 400));
  }
  console.log(`AFTER ${btn}:`, (await mainText(p, 2500)).replace(/\n+/g, " | ").match(new RegExp(`.{0,200}${child}.{0,300}`))?.[0] ?? "(child not on page)");
  if (p.problems.length) console.log("PROBLEMS", p.problems.splice(0));
}
await go(p, `/student-management?q=${encodeURIComponent(child)}`);
console.log("STUDENTS:", (await mainText(p, 3000)).replace(/\n+/g, " | ").match(new RegExp(`.{0,100}${child}.{0,200}`))?.[0]);
await shot(p, "j1g-student", false);
await close();
