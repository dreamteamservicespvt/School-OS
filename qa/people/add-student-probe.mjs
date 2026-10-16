// Probe one Add Student case: prints native validation, errors and where it went.
import { go, close, shot } from "../lib.mjs";
import { as } from "./session.mjs";

const over = JSON.parse(process.argv[2] ?? "{}");
const page = await as("cems.admin");
await go(page, "/student-management/new");
const v = { fullName: "Demo Varun Teja", dateOfBirth: "2016-05-12", guardianName: "Demo Prasad Teja", guardianPhone: "9876502001", ...over };
for (const [k, val] of Object.entries(v)) if (!k.startsWith("_")) await page.locator(`[name=${k}]`).fill(val, { force: true });
const sec = page.locator("select[name=sectionId]");
const val = await sec.evaluate((el, w) => [...el.options].find((o) => o.text.startsWith(w + " "))?.value, over._section ?? "Grade 5 A");
if (!over._noSection) await sec.selectOption(val);
if (!over._noGender) await page.locator("input[name=gender][value=Male]").check({ force: true });
const invalid = await page.evaluate(() => [...document.querySelectorAll("form input, form select, form textarea")].filter((e) => !e.checkValidity()).map((e) => `${e.name}: ${e.validationMessage}`));
console.log("NATIVE INVALID:", invalid);
page.on("request", (r) => { if (r.method() === "POST") console.log("POSTDATA", (r.postData() ?? "").replace(/\r?\n/g, " ").slice(0, 1500)); });
page.on("response", async (r) => { if (r.request().method() === "POST") console.log("RESP", (await r.text().catch(() => "")).slice(0, 800)); });
await page.locator("form").filter({ has: page.locator("input[name=fullName]") }).locator("button[type=submit]").last().click();
await page.waitForTimeout(3500);
console.log("URL", page.url());
console.log("ARIA-INVALID", await page.evaluate(() => [...document.querySelectorAll("[aria-invalid=true]")].map((e) => e.name + "=" + e.value)));
console.log("SECTION VALUE", await sec.inputValue(), "WANTED", val);
const t = (await page.locator("main").innerText()).split("\n").filter((l) => /needed|must|cannot|not a|choose|at most|digits|already|past|future|number|may already|added|reason/i.test(l));
console.log(t.slice(0, 15).join("\n"));
console.log("TOAST", await page.locator("[role=status]").innerText().catch(() => ""));
await shot(page, "add-student-probe");
await close();
