// B6 part 1: School Admin sends Parent Links to Class 5 A families without one; the links land in the server log (no provider).
import { readFileSync } from "node:fs";
import { as } from "./look.mjs";
import { go, mainText, close, logSize } from "./h.mjs";
const a = await as("admin");
await go(a, "/communication/parent-link/send");
const opts = await a.locator("#f-who option").allInnerTexts();
const pick = opts.find((o) => /^Class 5 \(all/.test(o));
console.log("PICK", pick);
await a.locator("#f-who").selectOption({ label: pick });
const from = logSize();
await a.getByRole("button", { name: "Check and send" }).click();
await a.waitForTimeout(4000);
const go2 = a.getByRole("button", { name: /^Send to \d+ guardian/ });
if (await go2.count()) { await go2.click(); await go2.click({ timeout: 800 }).catch(() => {}); }
const d = a.getByRole("dialog").last();
if (await d.count()) {
  console.log("DIALOG", (await d.innerText()).replace(/\n+/g, " | ").slice(0, 700));
  const b = d.getByRole("button", { name: /Send/ }).last(); await b.click(); await b.click({ timeout: 800 }).catch(() => {});
}
await a.waitForTimeout(8000);
console.log("AFTER", (await mainText(a, 600)).replace(/\n+/g, " | "));
const log = readFileSync(process.env.QA_SERVER_LOG, "utf8").slice(from);
console.log("LOG LINES", log.split("\n").filter((l) => /\/p\/|Parent Link|9289875414/i.test(l)).slice(0, 8).join("\n"));
await close();
