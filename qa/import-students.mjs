// Imports the synthetic student file through Student Management > Import, step by step.
import { asUser, mainText, shot, close } from "./lib.mjs";
const file = process.argv[2];
const page = await asUser("cems.admin");
await page.goto(`${process.env.QA_URL ?? "http://localhost:3000"}/student-management/import`);
await page.setInputFiles('input[type="file"]', file);
await page.getByRole("button", { name: /upload and continue/i }).click();
await page.waitForURL((u) => !u.pathname.endsWith("/import"), { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(4000);
console.log("== STEP", page.url()); console.log(await mainText(page, 3500)); await shot(page, "import-1");
const buttons = await page.getByRole("button").allInnerTexts(); console.log("BUTTONS", buttons.filter(Boolean).join(" | "));
await page.getByRole("button", { name: /check|continue|next/i }).last().click();
await page.waitForTimeout(8000);
console.log("== STEP", page.url()); console.log(await mainText(page, 5000)); await shot(page, "import-2");
console.log("BUTTONS", (await page.getByRole("button").allInnerTexts()).filter(Boolean).join(" | "));
if (process.argv[3] === "go") {
  await page.getByRole("button", { name: /^Import \d+ students/ }).click();
  await page.waitForTimeout(20000);
  console.log("== DONE", page.url()); console.log(await mainText(page, 3000)); await shot(page, "import-3");
}
console.log(page.problems);
await close();
