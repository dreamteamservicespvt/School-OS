// Parent Link in a school whose WhatsApp/SMS are in Test mode (Sunrise Public School, sandbox):
// send a guardian's first link from Student Management, and what the screens then say about delivery.
import { go, close, shot } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const G = process.argv[2];
const page = await as("admin");
await go(page, `/student-management/guardians/${G}`);
await page.getByRole("button", { name: /Resend Parent Link/ }).first().click();
await page.waitForTimeout(800);
await page.locator("dialog[open]").getByRole("button", { name: /^Send to/ }).click();
await page.waitForTimeout(4000);
const toast = (await page.locator("[role=status]").allInnerTexts()).join(" ").replace(/\s+/g, " ");
const main = (await page.locator("main").innerText()).replace(/\s+/g, " ");
await shot(page, "pl-sps-sent");
res({ module: "Communication", page: "Parent & guardian (Student Management)", action: "Send a guardian's first Parent Link in Test mode (Sunrise, sandbox WhatsApp)", role: "School Admin", expected: "Link made; the screen says queued / test mode, not delivered", actual: `${toast} || ${(main.match(/Parent Link.{0,120}/) ?? [""])[0]}`, status: /sent|queued|on its way/i.test(toast) ? "PASS" : "FAIL" });
await go(page, "/communication/history");
const h = (await page.locator("main").innerText()).replace(/\s+/g, " ");
res({ module: "Communication", page: "Message History", action: "Message History marks Test-mode (sandbox) messages", role: "School Admin", expected: "Test messages are labelled as test (nothing really sent)", actual: h.slice(0, 400), status: /test mode|test message|\btest\b/i.test(h) ? "PASS" : "FAIL" });
await close();
