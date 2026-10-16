// Profile: text size Large and Dark mode are kept after a reload and in a new
// sign-in, then set back; the signed-in devices list shows this browser.
//   node qa/platform/profile-flow.mjs [login=qab.admin]
import { close, BASE } from "../lib.mjs";
import { as } from "./util.mjs";
const login = process.argv[2] ?? "qab.admin";
const say = (s, m) => console.log(`${s.padEnd(5)} ${m}`);
const attrs = (p) => p.evaluate(() => ({ size: document.documentElement.getAttribute("data-size"), theme: document.documentElement.getAttribute("data-theme") }));

let p = await as(login);
await p.goto(`${BASE}/profile/appearance`); await p.waitForTimeout(1200);
const before = await attrs(p);
await p.getByRole("radiogroup", { name: "Text size" }).getByRole("radio", { name: /Large/ }).click();
await p.waitForTimeout(1500);
const darkBtn = p.locator("main").getByRole("radio", { name: /^Dark/ }).first();
if (await darkBtn.count()) await darkBtn.click();
await p.waitForTimeout(1500);
await p.reload(); await p.waitForTimeout(1000);
const after = await attrs(p);
say(after.size === "large" && after.theme === "dark" ? "PASS" : "FAIL", `text size and mode kept after reload: before ${JSON.stringify(before)} after ${JSON.stringify(after)}`);
await p.goto(`${BASE}/profile#devices`); await p.waitForTimeout(1000);
const devices = (await p.locator("main").innerText()).replace(/\s+/g, " ").match(/Signed-in devices.{0,300}/)?.[0];
say(/This device|this device|Chrome|Linux/i.test(devices ?? "") ? "PASS" : "CHECK", `devices: ${devices}`);
await close();

p = await as(login);
await p.goto(`${BASE}/dashboard?view=dashboard`); await p.waitForTimeout(800);
const fresh = await attrs(p);
say(fresh.size === "large" && fresh.theme === "dark" ? "PASS" : "FAIL", `kept in a new sign-in: ${JSON.stringify(fresh)}`);
await p.goto(`${BASE}/profile/appearance`); await p.waitForTimeout(1200);
await p.getByRole("radiogroup", { name: "Text size" }).getByRole("radio", { name: /Standard/ }).click();
await p.waitForTimeout(1200);
const light = p.locator("main").getByRole("radio", { name: new RegExp(`^${before.theme === "system" ? "Auto|Device" : "Light"}`) }).first();
if (await light.count()) await light.click();
await p.waitForTimeout(1500);
await p.reload(); await p.waitForTimeout(800);
say("INFO", `set back: ${JSON.stringify(await attrs(p))}`);
await close();
