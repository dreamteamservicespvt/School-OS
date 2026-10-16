// node qa/simulations/_dialog.mjs <login> <url> <button name regex> — lists the controls of the dialog the button opens (exploration aid).
import { as, visit, done, close } from "./sim-lib.mjs";
const [login, url, btn] = process.argv.slice(2);
const p = await as(login);
await visit(p, url);
if (btn) { await p.getByRole("button", { name: new RegExp(btn) }).or(p.getByRole("link", { name: new RegExp(btn) })).first().click(); await p.waitForTimeout(1500); }
const root = btn ? "dialog[open], [role=dialog]" : "main";
console.log(await p.evaluate((sel) => { const r = [...document.querySelectorAll(sel)].pop() ?? document.body; return [...r.querySelectorAll("input, select, textarea, button, [role=radio], [role=checkbox]")].map((e) => `${e.tagName} ${e.type ?? e.getAttribute("role") ?? ""} id=${e.id} name=${e.name ?? ""} val=${(e.value ?? "").slice(0, 30)} label=${(e.labels?.[0]?.innerText ?? e.getAttribute("aria-label") ?? e.innerText ?? "").slice(0, 50).replace(/\n/g, " ")}${e.tagName === "SELECT" ? " opts=" + [...e.options].slice(0, 12).map((o) => o.text).join("|") : ""}`).join("\n"); }, root));
await done(p); await close();
