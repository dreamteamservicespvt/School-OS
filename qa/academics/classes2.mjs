// Classes & Sections: edit, sections, archive rules for the DEMO class; Grade 5 A cannot be archived.
import { mainText, shot, close, layoutIssues, VIEWPORTS } from "../lib.mjs";
import { res, login, open, messages, sleep } from "./r.mjs";

const M = "Academic Management", P = "Classes & Sections", R = "School Admin";
const page = await login("cems.admin");
await open(page, "/academic-management");
const DEMO = "Demo QA Class తెలుగు";

async function dialogSubmit(button) {
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: button }).click();
  await sleep(1800);
  const still = await dlg.isVisible().catch(() => false);
  return still ? (await dlg.innerText()).replace(/\s+/g, " ") : "(closed) " + (await messages(page));
}

// Edit: rename to an existing name
await page.getByRole("button", { name: `Edit ${DEMO}`, exact: true }).click();
let dlg = page.getByRole("dialog");
await dlg.getByLabel("Class name").fill("Grade 6");
let out = await dialogSubmit("Save class");
res(M, P, "Rename DEMO class to existing 'Grade 6'", R, "Refused: names must be different", out.slice(0, 200), /already exists/.test(out) ? "PASS" : "FAIL");
await dlg.getByLabel("Class name").fill("Demo QA Class");
out = await dialogSubmit("Save class");
res(M, P, "Rename DEMO class", R, "Saved with toast", out.slice(0, 200), /saved/i.test(out) ? "PASS" : "FAIL");
await open(page, "/academic-management");

// Add section with a class teacher who already has a class
await page.getByRole("button", { name: "Add a section to Demo QA Class", exact: true }).click();
dlg = page.getByRole("dialog");
const opts = await dlg.getByLabel("Class teacher").locator("option").allInnerTexts();
const busy = opts.find((o) => /class teacher of/.test(o));
res(M, P, "Class teacher picker shows existing duties", R, "Teachers already class teacher are labelled", busy ?? "no labels", busy ? "PASS" : "FAIL");
await dlg.getByLabel("Section name").fill("");
await dlg.getByLabel("Seats").fill("0");
out = await dialogSubmit("Add section");
res(M, P, "Add section with 0 seats", R, "Refused", out.slice(0, 160), /between 1 and 500/.test(out) ? "PASS" : "FAIL");
await dlg.getByLabel("Seats").fill("20");
await dlg.getByLabel("Room").fill("R-DEMO");
out = await dialogSubmit("Add section");
res(M, P, "Add section with empty name (next letter)", R, "Section C added automatically", out.slice(0, 160), /Demo QA Class C added/.test(out) ? "PASS" : "FAIL");

// Duplicate section name differing in case
await open(page, "/academic-management");
await page.getByRole("button", { name: "Add a section to Demo QA Class", exact: true }).click();
dlg = page.getByRole("dialog");
await dlg.getByLabel("Section name").fill("a");
out = await dialogSubmit("Add section");
res(M, P, "Add duplicate section 'a' (A exists)", R, "Refused: already exists", out.slice(0, 160), /already exists/.test(out) ? "PASS" : "FAIL", /already exists/.test(out) ? undefined : "ACAD-xx");
if (!/already exists/.test(out)) await page.keyboard.press("Escape");

// Archive Grade 5 A (has students) is refused
await open(page, "/academic-management");
await page.getByRole("button", { name: "Archive", exact: true }).first();
const g5 = page.locator("li", { has: page.getByRole("heading", { name: "Grade 5", exact: true }) });
const archiveBtns = g5.getByRole("button", { name: "Archive", exact: true });
await archiveBtns.nth(1).click();
dlg = page.getByRole("dialog");
const body = (await dlg.innerText()).replace(/\s+/g, " ");
await dlg.getByRole("button", { name: /^Archive Grade 5 A/ }).click();
await sleep(1500);
out = (await dlg.isVisible().catch(() => false)) ? (await dlg.innerText()).replace(/\s+/g, " ") : "(closed) " + (await messages(page));
res(M, P, "Archive Grade 5 A (19 students)", R, "Warned before and refused", `${body.slice(0, 120)} => ${out.slice(0, 160)}`, /Move or promote/.test(out) ? "PASS" : "FAIL");
await page.keyboard.press("Escape");

// Archive the DEMO class (no students): works, with undo toast
await open(page, "/academic-management");
const demo = page.locator("li", { has: page.getByRole("heading", { name: "Demo QA Class", exact: true }) });
await demo.getByRole("button", { name: "Archive", exact: true }).first().click();
dlg = page.getByRole("dialog");
await dlg.getByRole("button", { name: /^Archive Demo QA Class$/ }).click();
await sleep(2000);
const toast = await messages(page);
const t = await mainText(page, 200000);
res(M, P, "Archive DEMO class with 3 sections, no students", R, "Archived, leaves the list, toast with Undo", `${toast.slice(0, 160)} | still listed=${/Demo QA Class\n/.test(t)}`, /archived/i.test(toast) && !/Demo QA Class\n/.test(t) ? "PASS" : "FAIL");
await shot(page, "classes-archived-demo");

// Phone width
await page.setViewportSize(VIEWPORTS.phone375);
await open(page, "/academic-management");
const li = await layoutIssues(page);
await shot(page, "classes-375");
res(M, P, "Classes & Sections at 375px", R, "No sideways scroll, controls named", li.join("; ") || "no issues", li.length ? "FAIL" : "PASS");
console.log("problems", page.problems);
await close();
