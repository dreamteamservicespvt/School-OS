// Guardians on a student's profile: second guardian, invalid / duplicate phone, change phone, remove the only one.
import { go, close, shot } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const SID = process.argv[2];
const M = "Student Management", P = "Add parent", R = "School Admin";
const page = await as("cems.admin");
const url = `/student-management/guardians/new?student=${SID}`;
async function save(v) {
  await go(page, url);
  await page.locator("select[name=relationship]").selectOption(v.relationship ?? "Mother");
  await page.locator("input[name=name]").fill(v.name ?? "Demo Kavitha Teja");
  await page.locator("input[name=phone]").fill(v.phone);
  if (v.email) await page.locator("input[name=email]").fill(v.email);
  await page.getByRole("button", { name: "Add parent", exact: true }).click();
  await page.waitForTimeout(4000);
  return { url: page.url(), text: (await page.locator("main").innerText()).split("\n").filter((l) => /must|needed|already|does not look|digits|added|linked|record/i.test(l)).slice(0, 6).join(" | ") };
}
let r = await save({ phone: "12345" });
res({ module: M, page: P, action: "Add second guardian with phone 12345", role: R, expected: "Refused: 10 digits", actual: r.text, status: /10 digits/.test(r.text) ? "PASS" : "FAIL" });
r = await save({ phone: "9876502002", email: "not-an-email" });
res({ module: M, page: P, action: "Add second guardian with email not-an-email", role: R, expected: "Refused: email does not look right", actual: r.text, status: /does not look right/.test(r.text) ? "PASS" : "FAIL" });
r = await save({ phone: "9110023975", name: "Demo Duplicate Phone" });
res({ module: M, page: P, action: "Add guardian with a phone another family's parent has (Murali Reddy)", role: R, expected: "Warns: parent on record; offers link or add anyway", actual: r.text, status: /already on record/i.test(r.text) ? "PASS" : "FAIL" });
await shot(page, "guardian-duplicate-phone");
r = await save({ phone: "9876502002" });
res({ module: M, page: P, action: "Add second guardian (Mother, Demo Kavitha Teja, 9876502002)", role: R, expected: "Added and linked; back on the profile", actual: `${r.url.replace(/.*3\d{3}/, "")} ${r.text}`, status: /students\//.test(r.url) ? "PASS" : "FAIL" });
await go(page, `/student-management/students/${SID}`);
const prof = (await page.locator("main").innerText()).replace(/\s+/g, " ");
res({ module: M, page: "Student profile", action: "Profile shows both guardians", role: R, expected: "Father and Mother listed", actual: (prof.match(/Parents.{0,300}/) ?? [""])[0].slice(0, 300), status: /Demo Kavitha Teja/.test(prof) && /Demo Prasad Teja/.test(prof) ? "PASS" : "FAIL" });
console.log(page.problems);
await close();
