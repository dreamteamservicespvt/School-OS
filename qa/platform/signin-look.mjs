// What the sign-in screen shows after a wrong password with a made-up login, by keyboard.
import { close, BASE, shot } from "../lib.mjs";
import { page } from "./util.mjs";
const p = await page();
await p.goto(`${BASE}/sign-in`);
await p.getByLabel(/username|mobile|login/i).first().focus();
await p.keyboard.type("demo.nobody.qa5");
await p.keyboard.press("Tab");
const f = await p.evaluate(() => document.activeElement?.outerHTML.slice(0, 200));
console.log("after Tab from login:", f);
await p.keyboard.press("Tab");
console.log("after 2nd Tab:", await p.evaluate(() => document.activeElement?.outerHTML.slice(0, 200)));
await p.getByLabel(/password/i).first().fill("Wrong#Pass1");
await p.keyboard.press("Enter");
await p.waitForTimeout(3000);
console.log(p.url(), (await p.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 600));
console.log(await p.evaluate(() => [...document.querySelectorAll("[role=alert],[aria-live]")].map((e) => e.outerHTML.slice(0, 200))));
await shot(p, "signin-wrong", false);
await close();
