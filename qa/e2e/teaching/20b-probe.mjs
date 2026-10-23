import { as, visit, VIEWPORTS } from "./h.mjs";
import { close } from "../../lib.mjs";
const t = await as("teacher", VIEWPORTS.phone390);
await visit(t, `/homework-learning/submissions?hw=dd2720d9-0ad1-474d-aba3-322cf1c40a6f`, 1500);
console.log(await t.locator("input[type=checkbox]").evaluateAll((els) => els.slice(0, 6).map((e) => `${e.getAttribute("aria-label")} vis=${!!e.offsetParent} form=${e.getAttribute("form")}`)));
console.log(await t.locator("label:has(input[type=checkbox])").count());
await close();
