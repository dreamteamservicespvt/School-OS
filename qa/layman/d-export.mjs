import { asRole, close } from "./d-h.mjs";
const [role, ...urls] = process.argv.slice(2);
const p = await asRole(role);
for (const u of urls) {
  const r = await p.request.get("http://localhost:3000" + u, { maxRedirects: 0 });
  const b = await r.text();
  console.log(`[${role}] ${u} -> ${r.status()} ${r.headers()["content-type"]} lines=${b.split("\n").length}\n` + b.split("\n").slice(0, 8).join("\n").slice(0, 600));
}
await close();
