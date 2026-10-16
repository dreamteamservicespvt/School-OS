// Library fine taken from salary: the Librarian issues copy 00006 to Demo Pavan Seela (CEMS-ST-009),
// marks it lost with a ₹250 charge, and sends the fine to salary.
//   node qa/money/18-libfine.mjs issue|lost|salary
import { as, visit, sql, SCHOOL_A, result, mainText, shot } from "./m.mjs";
import { close } from "../lib.mjs";

const step = process.argv[2];
const page = await as("cems.librarian");
const toast = async () => (await page.locator("[role=status], [role=alert]").allInnerTexts()).join(" ").replace(/\s+/g, " ").slice(0, 250);
const copy = () => sql(`select c.id, c.book_id, c.status from book_copy c where c.school_id='${SCHOOL_A}' and c.accession_no='00006'`)[0];
const fine = () => sql(`select f.id, f.amount_paise, f.status, f.salary_at from library_fine f join staff s on s.id=f.staff_id where f.school_id='${SCHOOL_A}' and s.staff_code='CEMS-ST-009' order by f.created_at desc limit 1`)[0];

if (step === "issue") {
  await visit(page, "/library-management?card=CEMS-ST-009");
  await page.locator("#scan-copy").fill("00006");
  await page.locator("#scan-copy").press("Enter");
  await page.waitForTimeout(4000);
  console.log((await mainText(page, 1500)).slice(0, 1500));
  await page.getByRole("button", { name: /^Issue/ }).first().click();
  await page.waitForTimeout(4000);
  result({ module: "Library Management", page: "Issue & Return", action: "Issue copy 00006 to Demo Pavan Seela (staff) for the salary fine test", role: "librarian", expected: "Issued", actual: `${await toast()} | copy=${copy()[2]}`, status: copy()[2] === "ISSUED" ? "PASS" : "FAIL" });
}
if (step === "lost") {
  const c = copy();
  await visit(page, `/library-management/books/${c[1]}?lost=${c[0]}`);
  const d = page.getByRole("dialog").last();
  console.log((await d.innerText()).replace(/\s+/g, " ").slice(0, 500));
  await d.locator("input[name=charge]").fill("250");
  await d.getByRole("button", { name: /^Mark lost/ }).click();
  await page.waitForTimeout(4000);
  result({ module: "Library Management", page: "Books", action: "Mark copy 00006 lost; ₹250 charge on Demo Pavan Seela", role: "librarian", expected: "Fine due from the staff member", actual: `${await toast()} | fine=${JSON.stringify(fine())}`, status: fine()?.[2] === "DUE" ? "PASS" : "FAIL" });
}
if (step === "salary") {
  const f = fine();
  await visit(page, `/library-management/fines?salary=${f[0]}`);
  const d = page.getByRole("dialog").last();
  await shot(page, "fine-to-salary");
  await d.getByRole("button", { name: "Take from salary" }).click();
  await page.waitForTimeout(4000);
  const g = fine();
  result({ module: "Library Management", page: "Fines & Stock Check", action: "Take Demo Pavan Seela's ₹250 fine from salary", role: "librarian", expected: "Marked to come off the next salary", actual: `${await toast()} | ${JSON.stringify(g)}`, status: g[3] ? "PASS" : "FAIL" });
}
await close();
