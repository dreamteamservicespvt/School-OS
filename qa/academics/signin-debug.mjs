// Shows what the sign-in screen says after a sign-in attempt (debug helper).
import { newPage, BASE, PASSWORD, close, mainText } from "../lib.mjs";
const who = process.argv[2];
const page = await newPage();
await page.goto(`${BASE}/sign-in`);
await page.getByLabel(/username|mobile|login/i).first().fill(who);
await page.getByLabel(/password/i).first().fill(PASSWORD);
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForTimeout(8000);
console.log(page.url());
console.log(await mainText(page, 1500));
await close();
