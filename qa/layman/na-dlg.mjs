// node qa/layman/na-dlg.mjs <role> <url> <button name regex>  -> dumps dialog fields
import { asRole, asRoleAt, close, txt, snap, log, PHONE, go, sleep } from "./na-h.mjs";
const [role, url, btn] = process.argv.slice(2);
const phone = process.env.W === "390";
const p = phone ? await asRoleAt(role, PHONE) : await asRole(role);
await go(p, url);
await p.getByRole(process.env.KIND ?? "button", { name: new RegExp(btn, "i") }).first().click();
await sleep(2500); console.log("URL", p.url());
const d = p.locator('[role="dialog"]:visible, dialog[open]').last();
const has = await d.count();
const root = has ? d : p.locator("main");
console.log(await root.innerText().catch(() => ""));
const fields = await root.evaluate((el) => [...el.querySelectorAll("input,select,textarea,button")].map((e) => `${e.tagName}${e.type ? "[" + e.type + "]" : ""} name=${e.name} id=${e.id} aria=${e.getAttribute("aria-label") ?? ""} ph=${e.getAttribute("placeholder") ?? ""} req=${e.required} max=${e.maxLength ?? ""} ${e.tagName === "SELECT" ? "opts=" + [...e.options].map((o) => o.text).slice(0, 25).join("|") : ""} ${e.tagName === "BUTTON" ? "txt=" + e.innerText.trim().slice(0, 40) : ""}`));
console.log(fields.join("\n"));
await snap(p, `dlg-${role}-${phone ? 390 : 1440}-${btn.replace(/\W+/g, "_")}`);
await close();
