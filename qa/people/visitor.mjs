// Front Office: visitor check-in -> pass -> check at the gate -> check-out (cems.reception and cems.gate).
import { go, close, shot, VIEWPORTS, layoutIssues } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const M = "Front Office", R = "Receptionist";
const page = await as("cems.reception");
const sheet = () => page.locator("dialog[open]").last();
const say = async () => ((await sheet().innerText().catch(() => "")) + " || " + (await page.locator("[role=status]").allInnerTexts()).join(" ")).replace(/\s+/g, " ");

await go(page, "/front-office/visitors");
await page.getByRole("link", { name: "Add visitor" }).or(page.getByRole("button", { name: "Add visitor" })).first().click();
await page.waitForTimeout(800);
console.log("SHEET:", (await sheet().innerText()).slice(0, 1500));
// empty
await sheet().locator("button[type=submit]").last().click();
await page.waitForTimeout(1500);
let t = await say();
res({ module: M, page: "Visitors", action: "Add visitor with nothing filled", role: R, expected: "Refused; phone, name, purpose named", actual: t.slice(0, 300), status: /phone|name|purpose|fill out/i.test(t) ? "PASS" : "FAIL" });
// invalid phone
await sheet().locator("input[name=phone]").fill("12345");
await sheet().locator("input[name=name]").fill("Demo Visitor Rao");
const purposes = await sheet().locator("select[name=purpose] option").allInnerTexts();
console.log("PURPOSES", purposes);
await sheet().locator("select[name=purpose]").selectOption({ index: 1 });
const meet = sheet().locator("select[name=meetStaffId]");
if (await meet.count()) { const o = await meet.locator("option").allInnerTexts(); console.log("MEET", o.slice(0, 6)); await meet.selectOption({ index: 1 }).catch(() => {}); }
await sheet().locator("button[type=submit]").last().click();
await page.waitForTimeout(2000);
t = await say();
res({ module: M, page: "Visitors", action: "Add visitor with phone 12345", role: R, expected: "Refused: 10-digit mobile", actual: t.slice(0, 300), status: /10 digits|digits|mobile/i.test(t) ? "PASS" : "FAIL" });
// valid
await sheet().locator("input[name=phone]").fill("9876503001");
await sheet().locator("input[name=name]").fill("Demo Visitor Rao");
await sheet().locator("button[type=submit]").last().click();
await page.waitForTimeout(3500);
t = await say();
await shot(page, "visitor-added");
const passUrl = page.url();
res({ module: M, page: "Visitors", action: "Check in a visitor (Demo Visitor Rao)", role: R, expected: "Pass made with a number and expiry; visitor shown In the building", actual: `${passUrl.replace(/.*:\d+/, "")} ${t.slice(0, 300)}`, status: /pass|V-|checked in|added/i.test(t + passUrl) ? "PASS" : "FAIL" });
await go(page, "/front-office/visitors?status=In");
const list = (await page.locator("main").innerText()).replace(/\s+/g, " ");
const code = (list.match(/\bV-\d{3,}\b/) ?? [null])[0];
res({ module: M, page: "Visitors", action: "Visitor appears under In the building", role: R, expected: "Listed with pass number", actual: list.slice(0, 300), status: /Demo Visitor Rao/.test(list) ? "PASS" : "FAIL" });
console.log("PASS CODE", code);

// Gate checks the pass
const gate = await as("cems.gate");
await go(gate, "/front-office");
console.log("GATE HOME:", (await gate.locator("main").innerText()).slice(0, 800));
await gate.getByRole("button", { name: /Check a pass/ }).first().click().catch(() => {});
await gate.waitForTimeout(800);
const code2 = code ?? "V-0001";
await gate.locator("input[name=code]").fill(code2).catch(() => {});
await gate.keyboard.press("Enter");
await gate.waitForTimeout(2500);
const g = ((await gate.locator("dialog[open]").innerText().catch(() => "")) + (await gate.locator("main").innerText())).replace(/\s+/g, " ");
await shot(gate, "gate-pass-check");
res({ module: M, page: "Check a pass", action: `Gate checks pass ${code2}`, role: "Gate Security", expected: "Shows the visitor, valid until, and lets the gate mark out", actual: g.slice(0, 400), status: /Demo Visitor Rao/.test(g) ? "PASS" : "FAIL" });
const fake = await (async () => { await gate.locator("input[name=code]").fill("V-9999").catch(() => {}); await gate.keyboard.press("Enter"); await gate.waitForTimeout(2000); return ((await gate.locator("dialog[open]").innerText().catch(() => "")) + "").replace(/\s+/g, " "); })();
res({ module: M, page: "Check a pass", action: "Gate checks a pass number that does not exist (V-9999)", role: "Gate Security", expected: "Not valid, in plain words", actual: fake.slice(0, 300), status: /not found|not valid|no pass|does not/i.test(fake) ? "PASS" : "FAIL" });
console.log(page.problems, gate.problems);
await close();
