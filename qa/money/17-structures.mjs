// Salary structures for two demo staff through Salary Structures, as the Accountant.
// Demo Pavan Seela: basic ₹15,000 + conveyance ₹1,000 (ESI applies, within the limit); PF on.
// Demo Lavanya Teki: basic ₹30,000 + special ₹6,000 (above the ESI limit); PF on.
import { as, visit, sql, SCHOOL_A, result } from "./m.mjs";
import { close } from "../lib.mjs";

const page = await as("cems.accountant");
const comp = (name) => sql(`select id from salary_component where school_id='${SCHOOL_A}' and name='${name}' and archived_at is null`)[0][0];
const staff = (code) => sql(`select id, full_name from staff where school_id='${SCHOOL_A}' and staff_code='${code}'`)[0];
const struct = (id) => sql(`select version, gross_paise, pf_applies, esi_applies, effective_from from salary_structure where staff_id='${id}' order by version desc limit 1`)[0];
const toast = async () => (await page.locator("[role=status], [role=alert]").allInnerTexts()).join(" ").replace(/\s+/g, " ").slice(0, 250);

for (const [code, lines, expectEsi] of [["CEMS-ST-009", { "Basic pay": 15000, Conveyance: 1000 }, true], [sql(`select staff_code from staff where school_id='${SCHOOL_A}' and full_name='Demo Lavanya Teki'`)[0][0], { "Basic pay": 30000, "Special allowance": 6000 }, false]]) {
  const [id, name] = staff(code);
  if (struct(id)) { console.log("has structure", name); continue; }
  await visit(page, `/salary-management/structures?do=add&staff=${id}`);
  const d = page.getByRole("dialog").last();
  const sel = d.locator("select[name=staffId]");
  if (await sel.count()) await sel.selectOption(id);
  for (const [c, v] of Object.entries(lines)) await d.locator(`input[name=c_${comp(c)}]`).fill(String(v));
  await page.waitForTimeout(800);
  const text = (await d.innerText()).replace(/\s+/g, " ");
  await d.getByRole("button", { name: /^Save/ }).click();
  await page.waitForTimeout(4000);
  const s = struct(id);
  const gross = Object.values(lines).reduce((a, b) => a + b, 0);
  result({ module: "Salary Management", page: "Salary Structures", action: `Add structure for ${name}: ${JSON.stringify(lines)}`, role: "accountant", expected: `Saved; ESI ${expectEsi ? "on" : "off"} (limit ₹21,000)`, actual: `${await toast()} | ${JSON.stringify(s)} | sheet: ${(text.match(/(On, because|Wages are above)[^.]*/) ?? [""])[0]}`, status: s && s[3] === (expectEsi ? "t" : "f") && Number(s[1]) >= gross * 100 ? "PASS" : "FAIL" });
}
await close();
