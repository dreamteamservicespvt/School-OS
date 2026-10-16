// node qa/people/look.mjs <login> <url> [fields] — prints a screen's text (and form fields) using a saved session.
import { go, close, mainText, layoutIssues, shot } from "../lib.mjs";
import { as } from "./session.mjs";

const [login, url, mode] = process.argv.slice(2);
const page = await as(login);
const r = await go(page, url);
console.log("STATUS", r?.status(), page.url());
console.log(await mainText(page, Number(process.env.MAX ?? 5000)));
if (mode === "fields") {
  const f = await page.evaluate(() => [...document.querySelectorAll("main input, main select, main textarea, main button, [role=dialog] input, [role=dialog] select, [role=dialog] button")].filter((el) => el.type !== "hidden" || true).map((el) => {
    const lab = (el.id && document.querySelector(`label[for="${el.id}"]`)?.innerText) || el.closest("label")?.innerText || el.getAttribute("aria-label") || "";
    const opts = el.tagName === "SELECT" ? [...el.options].slice(0, 12).map((o) => `${o.value.slice(0, 8)}=${o.text}`).join(",") : "";
    return `${el.tagName.toLowerCase()} name=${el.name} type=${el.type} ${el.required ? "REQ" : ""} label="${lab.replace(/\s+/g, " ").slice(0, 50)}" ${el.tagName === "BUTTON" ? `text="${el.innerText.trim().slice(0, 40)}"` : `value="${String(el.value).slice(0, 40)}"`} ${opts}`;
  }));
  console.log(f.join("\n"));
}
console.log("LAYOUT", await layoutIssues(page), "PROBLEMS", page.problems);
await shot(page, `look_${(login + url).replace(/[^a-z0-9]+/gi, "_").slice(0, 80)}`);
await close();
