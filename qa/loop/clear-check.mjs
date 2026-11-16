// A form's red message goes once the box is fixed, without pressing Save again (layman loop 2).
//   MSYS_NO_PATHCONV=1 node qa/loop/clear-check.mjs
import path from "node:path";
import { newPage, sleep, close } from "../full/h.mjs";
import { OUTA } from "../layman/nc-h.mjs";

const p = await newPage({ width: 1440, height: 900 }, { storageState: path.join(OUTA, "state-admin.json") });
await p.goto("http://localhost:3000/settings/school-profile", { timeout: 90000 });
await p.waitForLoadState("networkidle").catch(() => {});
const phone = p.getByLabel("Phone", { exact: false }).first();
const was = await phone.inputValue();
await phone.fill("");
await phone.press("Tab");
const form = phone.locator("xpath=ancestor::form");
await form.getByRole("button", { name: /^Save/ }).first().click();
await sleep(1200);
const msg = () => form.locator('[id$="-error"], [role=alert]').allInnerTexts();
console.log("after Save with phone empty:", (await msg()).join(" / ").slice(0, 160), "| focused on phone:", await phone.evaluate((e) => e === document.activeElement));
await phone.fill(was || "9876543210");
await sleep(400);
console.log("after typing the phone back:", JSON.stringify((await msg()).join(" / ").slice(0, 160)));
await close();
