// Calls one server action directly, the way the browser does, with a form (prevState null).
//   node qa/people/call-action.mjs <login> <actions file suffix> <export name> '<json fields>'
import { readFileSync } from "node:fs";
import { close, BASE } from "../lib.mjs";
import { as } from "./session.mjs";

const [login, file, name, json] = process.argv.slice(2);
const manifest = JSON.parse(readFileSync(process.env.MANIFEST ?? "/home/claude/school-os/.next/server/server-reference-manifest.json", "utf8")).node;
const id = Object.entries(manifest).find(([, v]) => v.filename?.endsWith(file) && v.exportedName === name)?.[0];
if (!id) throw new Error(`no action ${name} in ${file}`);
const page = await as(login);
// The root part "0" must come last: the server reads the form's fields as they arrive.
const form = new FormData();
for (const [k, v] of Object.entries(JSON.parse(json || "{}"))) form.append(`_1_${k}`, String(v));
form.append("0", JSON.stringify(["$undefined", "$K1"]));
const r = await page.request.post(`${BASE}/dashboard`, { headers: { "Next-Action": id, Accept: "text/x-component" }, multipart: form });
console.log("HTTP", r.status(), (await r.text()).replace(/\s+/g, " ").slice(0, 600));
await close();
