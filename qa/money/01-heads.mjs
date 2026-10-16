// Fee heads through the Fee Structure screen as the accountant, with validation checks.
import { as, visit, mainText, shot, sql, SCHOOL_A, result } from "./m.mjs";
import { close } from "../lib.mjs";

const M = "Fee Management", P = "Fee Structure";
const page = await as("cems.accountant");
const heads = [
  { name: "Tuition", kind: "tuition" },
  { name: "Exam", kind: "exam" },
  { name: "Activity", kind: "activity" },
  { name: "Transport", kind: "transport" },
];

async function openAdd() {
  await visit(page, "/fee-management/structure?head=new");
  await page.getByRole("dialog").waitFor();
}
async function submitHead(name, kind) {
  await openAdd();
  const d = page.getByRole("dialog");
  await d.getByLabel("Name").fill(name);
  if (kind) {
    const opts = await d.getByLabel("Kind").locator("option").allTextContents();
    const pick = opts.find((o) => o.toLowerCase().includes(kind)) ?? opts[0];
    await d.getByLabel("Kind").selectOption({ label: pick });
  }
  await d.getByRole("button", { name: /Add fee head/ }).click();
  await page.waitForTimeout(1500);
  return { dialogOpen: await page.getByRole("dialog").isVisible().catch(() => false), text: (await mainText(page, 800)) + " | " + (await page.getByRole("dialog").innerText().catch(() => "")).slice(0, 400) };
}

// Validation: empty name.
{
  const r = await submitHead("", null);
  result({ module: M, page: P, action: "Add fee head with empty name", role: "accountant", expected: "Refused with a plain message", actual: r.dialogOpen ? r.text.match(/(Enter|required|name)[^|\n]{0,80}/i)?.[0] ?? "dialog stays open" : "dialog closed", status: r.dialogOpen ? "PASS" : "FAIL" });
}
for (const h of heads) {
  const exists = sql(`select count(*) from fee_head where school_id='${SCHOOL_A}' and name='${h.name}' and archived_at is null`)[0][0];
  if (exists !== "0") { console.log("exists", h.name); continue; }
  const r = await submitHead(h.name, h.kind);
  const n = sql(`select count(*) from fee_head where school_id='${SCHOOL_A}' and name='${h.name}'`)[0][0];
  result({ module: M, page: P, action: `Add fee head ${h.name}`, role: "accountant", expected: "Head saved once", actual: `rows=${n}`, status: n === "1" ? "PASS" : "FAIL" });
}
// Duplicate name.
{
  const r = await submitHead("tuition", "tuition");
  const n = sql(`select count(*) from fee_head where school_id='${SCHOOL_A}' and lower(name)='tuition' and archived_at is null`)[0][0];
  result({ module: M, page: P, action: "Add duplicate fee head 'tuition'", role: "accountant", expected: "Refused: name already used", actual: `rows=${n}; ${r.text.slice(0, 200).replace(/\n/g, " ")}`, status: n === "1" ? "PASS" : "FAIL", defect: n === "1" ? undefined : "duplicate head allowed" });
}
// Very long / unicode
{
  const r = await submitHead("x".repeat(200), null);
  const n = sql(`select count(*) from fee_head where school_id='${SCHOOL_A}' and length(name)>80`)[0][0];
  result({ module: M, page: P, action: "Add fee head with 200-char name", role: "accountant", expected: "Limited to 80 characters", actual: `rows over 80=${n}`, status: n === "0" ? "PASS" : "FAIL" });
}
await shot(page, "heads-after");
console.log(sql(`select name, kind, late_fee_applies from fee_head where school_id='${SCHOOL_A}' order by created_at`));
await close();
