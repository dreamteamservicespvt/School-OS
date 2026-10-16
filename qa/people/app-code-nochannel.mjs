// New application at the counter in a school with no SMS/WhatsApp: what does "Send one-time code" say?
import { go, close, shot } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const page = await as(process.argv[3] ?? "cems.admissions");
await go(page, `/admission-management/applications/new?enquiry=${process.argv[2]}`);
await page.getByRole("button", { name: "Send one-time code" }).click();
await page.waitForTimeout(3000);
const t = (await page.locator("main").innerText()).split("\n").filter((l) => /code|sent|cannot|could not|SMS|WhatsApp/i.test(l)).join(" | ");
console.log(t);
await shot(page, "application-code-nochannel");
res({ module: "Admission Management", page: "New application", action: "Send consent one-time code when the school has no SMS/WhatsApp connected", role: "Admission Counsellor", expected: "Plain message that the code cannot be sent (no 'Code sent')", actual: t, status: /Code sent/i.test(t) ? "FAIL" : "PASS" });
await close();
