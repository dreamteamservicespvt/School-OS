// Layman A: Add student with mistakes (empty, wrong phone, future DOB, 31 Feb, long + Telugu name, double click).
import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const p = await asRole("admin");
const S = Date.now().toString().slice(-5);
const f = (n) => p.locator(`main [name=${n}]`);
const errs = async () => [...new Set((await p.locator('main [id$="-error"], main [role="alert"], main .text-destructive').allInnerTexts()).map((x) => x.trim()).filter(Boolean))];
const log = (k, v) => console.log(`== ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
const dob = () => p.locator("main input[id$=-dateOfBirth]");
const adm = () => p.locator("main input[id$=-admissionDate]");
const save = () => p.getByRole("button", { name: "Add student", exact: true });
await go(p, "/student-management/new"); await sleep(800);
log("admission date default", await adm().inputValue());
await save().click(); await sleep(1500);
log("empty submit errors", await errs()); log("url after empty", p.url());
await snap(p, "sn-empty");
// wrong values
await f("fullName").fill("1234 !!");
await f("guardianPhone").fill("12345");
await f("guardianName").fill("A");
await dob().fill("31-02-2018"); await p.keyboard.press("Tab");
await save().click(); await sleep(1500);
log("wrong values errors", await errs());
await snap(p, "sn-wrong");
await dob().fill(""); await dob().pressSequentially("15-08-2030", { delay: 10 }); await p.keyboard.press("Tab");
await save().click(); await sleep(1200);
log("future dob errors", await errs());
// very long + Telugu
const LONG = "LA-" + "రామకృష్ణ ".repeat(30);
await f("fullName").fill(LONG);
await f("sectionId").selectOption({ index: 4 });
await dob().fill(""); await dob().pressSequentially("10-06-2019", { delay: 10 }); await p.keyboard.press("Tab");
await p.locator("main").getByText("Male", { exact: true }).click();
await f("guardianPhone").fill("98480" + S);
await f("guardianName").fill("LA-Parent " + S);
await save().click(); await sleep(2500);
log("long telugu errors", await errs()); log("url", p.url());
await snap(p, "sn-long");
// good Telugu name (normal length) + double click
const NAME = `LA-రాము Student ${S}`;
if (p.url().includes("/new")) {
  await f("fullName").fill(NAME);
  await save().dblclick(); await sleep(6000);
}
log("after save url", p.url());
const t = await mainText(p, 3000);
log("after save text", t.slice(0, 900).replace(/\n/g, " | "));
await snap(p, "sn-saved");
// back button
await p.goBack(); await sleep(2000); log("after back url", p.url()); log("back text", (await mainText(p, 400)).replace(/\n/g, " | "));
// search list for duplicates
await go(p, `/student-management?q=${encodeURIComponent(S)}`); await sleep(1500);
const lt = await mainText(p, 6000);
log("list search by suffix", lt.slice(0, 1500).replace(/\n/g, " | "));
const n = (lt.match(new RegExp(`Student ${S}`, "g")) ?? []).length;
log("rows with name", n);
await snap(p, "sn-list-search");
console.log("PROBLEMS", p.problems);
await close();
