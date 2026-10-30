import { as } from "./look.mjs";
import { go, close } from "./h.mjs";
const p = await as("admin");
await go(p, "/communication/notices/new");
console.log(await p.locator('input[name=parents], input[name=sectionIds]').evaluateAll((a) => a.slice(0, 3).map((x) => x.parentElement.parentElement.outerHTML.replace(/ class="[^"]*"/g, "").replace(/<svg.*?<\/svg>/g, "<svg/>").slice(0, 400))));
console.log(await p.getByRole("checkbox").evaluateAll((a) => a.slice(0, 6).map((x) => x.labels?.[0]?.innerText ?? x.getAttribute("aria-label"))));
console.log("BUTTONS", await p.locator("main button").allInnerTexts());
await close();
