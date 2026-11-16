// "Type to find" on a long list: filters the dropdown, keeps the chosen one, and the form still saves.
//   MSYS_NO_PATHCONV=1 node qa/loop/find-check.mjs
import path from "node:path";
import { newPage, sleep, close } from "../full/h.mjs";
import { OUTA } from "../layman/nc-h.mjs";

const p = await newPage({ width: 390, height: 844 }, { storageState: path.join(OUTA, "state-reception.json") });
await p.goto("http://localhost:3000/front-office/postal?do=received", { timeout: 90000 });
await p.waitForLoadState("networkidle").catch(() => {});
const dlg = p.locator("dialog[open]");
const sel = dlg.locator('select[name="for"]');
const count = () => sel.locator("option").count();
console.log("options before:", await count());
await dlg.getByPlaceholder("Type to find").fill("anith");
await sleep(300);
const opts = await sel.locator("option").allInnerTexts();
console.log("after 'anith':", opts.length, opts.join(" | ").slice(0, 200));
await sel.selectOption({ index: opts.length - 1 });
const picked = await sel.inputValue();
await dlg.getByPlaceholder("Type to find").fill("zzzz");
await sleep(300);
console.log("after 'zzzz': kept chosen =", (await sel.inputValue()) === picked, "| note:", (await dlg.getByText("No match").count()) > 0);
await dlg.getByPlaceholder("Type to find").fill("");
console.log("cleared: options", await count(), "chosen kept =", (await sel.inputValue()) === picked);
await dlg.getByPlaceholder(/For example/).fill("Find-box check sender");
await dlg.getByRole("button", { name: "Save" }).click();
await sleep(4000);
console.log("after Save: sheet open =", await p.locator("dialog[open]").count(), "| row shown =", (await p.getByText("Find-box check sender").count()) > 0);
await close();
