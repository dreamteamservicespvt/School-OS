// Front Office appointments (cems.reception): Send reminder with no SMS/WhatsApp, then Mark arrived -> visitor pass.
import { go, close, shot } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const M = "Front Office", R = "Receptionist", NAME = process.env.NAME ?? "Demo Appointment Lakshmi";
const rec = await as("cems.reception");
const txt = async (sel) => ((await rec.locator(sel).allInnerTexts().catch(() => [])).join(" ")).replace(/\s+/g, " ");
const menu = async () => { await rec.getByRole("button", { name: `Actions for ${NAME}` }).first().click(); await rec.waitForTimeout(500); };

await go(rec, "/front-office/appointments");
await rec.waitForTimeout(1000);
await menu();
console.log("MENU", await txt("[role=menu]"));
await rec.getByRole("menuitem", { name: "Send reminder" }).click();
await rec.waitForTimeout(3000);
let t = await txt("main [role=alert], [role=status]");
res({ module: M, page: "Appointments", action: "Send reminder with no SMS/WhatsApp connected", role: R, expected: "Says plainly the reminder was not sent", actual: t.slice(0, 300), status: /not sent/i.test(t) && !/Reminder sent/.test(t) ? "PASS" : "FAIL" });

await menu();
await rec.getByRole("menuitem", { name: "Mark arrived" }).click();
await rec.waitForTimeout(2000);
const sheet = rec.locator("dialog[open]").last();
console.log("SHEET", (await sheet.innerText().catch(() => "")).slice(0, 600));
await sheet.locator("button[type=submit]").last().click().catch(() => {});
await rec.waitForTimeout(3500);
t = `${await txt("dialog[open]")} || ${await txt("[role=status], [role=alert]")}`;
await shot(rec, "appointment-arrived");
res({ module: M, page: "Appointments", action: "Mark the appointment arrived (visitor sheet filled from the booking)", role: R, expected: "Visitor pass made and the person to meet told", actual: `${rec.url().replace(/.*:\d+/, "")} ${t.slice(0, 300)}`, status: /pass V-|Visitor pass/i.test(t + rec.url()) ? "PASS" : "FAIL" });
console.log(rec.problems);
await close();
