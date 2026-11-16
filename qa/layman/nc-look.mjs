// Look at one page as a role: text + form fields. node nc-look.mjs role url [width] [clickButtonName]
import { asRole, go, sleep, close, snap, one, timed, watch } from "./nc-h.mjs";
const [role, url, w, btn] = process.argv.slice(2);
const p = watch(await asRole(role));
if (w) await p.setViewportSize({ width: Number(w), height: 900 });
const r = await timed(p, url);
if (btn) { await p.getByRole("button", { name: btn }).first().click(); await sleep(1500); }
console.log(r.ms, "ms", p.url());
console.log(one(btn ? await p.locator("body").innerText() : r.text, 7000));
const f = await p.evaluate(() => [...document.querySelectorAll("input,select,textarea,button")].filter(e=>e.offsetParent).map(e => `${e.tagName}#${e.id}[${e.name||""}]${e.type?":"+e.type:""}"${(e.labels?.[0]?.innerText||e.innerText||e.placeholder||"").slice(0,40).replace(/\n/g," ")}"`));
console.log("FIELDS", f.join(" ; ").slice(0, 4000));
await snap(p, `look-${role}-${url.replace(/\W+/g, "_")}${btn ? "-" + btn.replace(/\W+/g, "") : ""}`);
console.log("PROBLEMS", p.problems);
await close();
