// Re-check of "Mark original seen": read the Birth certificate row (the first run read the page intro).
//   node qa/people/original-seen.mjs <application id>
import { go, close } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const page = await as("cems.admissions");
await go(page, `/admission-management/documents?id=${process.argv[2]}`);
const li = page.locator("li").filter({ hasText: "Birth certificate" }).first();
const row = (await li.innerText()).replace(/\s+/g, " ");
const btn = await li.getByRole("button", { name: "Original seen" }).count();
res({ module: "Admission Management", page: "Documents & Verification", action: "Mark original seen at the counter", role: "Admission Counsellor", expected: "Shown as original seen", actual: `${row.slice(0, 200)} (Original seen button left: ${btn})`, status: /original seen at counter/.test(row) && !btn ? "PASS" : "FAIL" });
await close();
