// Classes & Sections: add / edit / archive one DEMO class through the screen, with validation.
import { asUser, go, mainText, shot, close, layoutIssues, VIEWPORTS } from "../lib.mjs";
import { res, messages, sleep } from "./r.mjs";

const M = "Academic Management", P = "Classes & Sections";
const page = await asUser("cems.admin");
await go(page, "/academic-management");

async function openAdd() {
  await page.getByRole("button", { name: "Add class", exact: true }).click();
  await page.getByLabel("Class name").first().waitFor();
}
async function submit(label = "Add class") {
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: new RegExp(`^${label}`) }).last().click();
  await sleep(1500);
  return (await dlg.isVisible().catch(() => false)) ? await dlg.innerText() : "(dialog closed) " + (await messages(page));
}

// 1. empty name
await openAdd();
let dlg = page.getByRole("dialog");
await dlg.getByLabel("Class name").fill("");
let out = await submit();
res(M, P, "Add class with empty name", "School Admin", "Plain error: class name is needed", out.slice(0, 200), /needed/i.test(out) ? "PASS" : "FAIL");

// 2. too long
await dlg.getByLabel("Class name").fill("X".repeat(61));
out = await submit();
res(M, P, "Add class with 61-character name", "School Admin", "Plain error about length", out.slice(0, 200), /at most 60|60 characters/i.test(out) ? "PASS" : "FAIL");

// 3. duplicate (Grade 5 exists)
await dlg.getByLabel("Class name").fill("grade 5");
out = await submit();
res(M, P, "Add duplicate class 'grade 5'", "School Admin", "Refused: already exists", out.slice(0, 200), /already exists/i.test(out) ? "PASS" : "FAIL");

// 4. bad seats
await dlg.getByLabel("Class name").fill("Demo QA Class");
await dlg.getByLabel("Seats per section").fill("-5");
out = await submit();
res(M, P, "Add class with seats -5", "School Admin", "Refused with plain message", out.slice(0, 200), /whole number|between/i.test(out) ? "PASS" : "FAIL");
await dlg.getByLabel("Seats per section").fill("2.5");
out = await submit();
res(M, P, "Add class with seats 2.5", "School Admin", "Refused with plain message", out.slice(0, 200), /whole number|between/i.test(out) ? "PASS" : "FAIL");
await dlg.getByLabel("Seats per section").fill("99999");
out = await submit();
res(M, P, "Add class with seats 99999", "School Admin", "Refused with plain message", out.slice(0, 200), /between/i.test(out) ? "PASS" : "FAIL");

// 5. valid, unicode name
await dlg.getByLabel("Class name").fill("  Demo QA Class   తెలుగు  ");
await dlg.getByLabel("Seats per section").fill("30");
await dlg.getByLabel("Sections").fill("A, B");
out = await submit();
await sleep(1000);
let text = await mainText(page, 200000);
const added = /Demo QA Class తెలుగు/.test(text);
res(M, P, "Add DEMO class with unicode, extra spaces, sections A,B", "School Admin", "Class added with trimmed name and 2 sections; toast", out.slice(0, 200) + (added ? " | shown in list" : " | NOT in list"), added ? "PASS" : "FAIL");
await shot(page, "classes-added");
await close();
