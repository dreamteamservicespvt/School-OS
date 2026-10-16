// Signs in to the Super Admin console (password, then the code from the server log)
// and saves the session to qa-output/console-state.json for later scripts.
import { newPage, go, mainText, close, OUT, PASSWORD, BASE } from "./lib.mjs";
import { readFileSync } from "node:fs";
const phone = process.argv[2] ?? "9849023456";
const page = await newPage();
await go(page, "/console/sign-in");
await page.getByLabel(/mobile number or email/i).fill(phone);
await page.getByLabel(/^password/i).fill(PASSWORD);
await page.getByRole("button", { name: /continue/i }).click();
await page.waitForLoadState("networkidle");
await page.getByText(/one-time code|enter the code|we sent/i).last().waitFor({ timeout: 15000 }).catch(()=>{}); await page.waitForTimeout(1500); console.log(await mainText(page, 800));
await page.waitForTimeout(800);
const log = readFileSync(process.env.QA_SERVER_LOG, "utf8").split("\n").filter((l) => l.includes(phone)).pop() ?? "";
const code = log.match(/\b(\d{6})\b/)?.[1];
console.log("CODE LINE", log.slice(0, 300));
await page.getByLabel(/code/i).first().fill(code);
const trust = page.getByLabel(/trust|remember/i); if (await trust.count()) await trust.first().check().catch(() => {});
await page.getByRole("button", { name: /sign in|verify|continue/i }).first().click();
await page.waitForLoadState("networkidle");
console.log("AFTER", page.url()); console.log(await mainText(page, 1500)); console.log(page.problems);
await page.context().storageState({ path: `${OUT}/console-state.json` });
await close();
