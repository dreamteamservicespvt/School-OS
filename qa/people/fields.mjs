// node qa/people/fields.mjs <login> <url> [button text to click first]
// Prints the form fields (name, type, label, required) and buttons on a screen.
import { asUser, go, close, VIEWPORTS, mainText } from "../lib.mjs";

const [login, url, click] = process.argv.slice(2);
const page = await asUser(login, VIEWPORTS.laptop1280);
await go(page, url);
if (click) { await page.getByRole("button", { name: click }).or(page.getByRole("link", { name: click })).first().click(); await page.waitForTimeout(1500); }
const f = await page.evaluate(() => [...document.querySelectorAll("input, select, textarea, button")].filter((el) => el.offsetParent !== null || el.type === "hidden").map((el) => {
  const lab = (el.id && document.querySelector(`label[for="${el.id}"]`)?.innerText) || el.closest("label")?.innerText || el.getAttribute("aria-label") || "";
  const opts = el.tagName === "SELECT" ? [...el.options].slice(0, 8).map((o) => `${o.value}=${o.text}`).join(",") : "";
  return `${el.tagName.toLowerCase()} name=${el.name} type=${el.type} ${el.required ? "REQ" : ""} label="${lab.replace(/\s+/g, " ").slice(0, 50)}" ${el.tagName === "BUTTON" ? `text="${el.innerText.trim().slice(0, 40)}"` : `value="${String(el.value).slice(0, 40)}"`} ${opts}`;
}));
console.log(f.join("\n"));
if (process.env.TEXT) console.log(await mainText(page, 3000));
await close();
