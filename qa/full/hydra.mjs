// Finds a hydration mismatch: text in the server HTML that differs from the page after React renders it.
//   node qa/full/hydra.mjs <login> <path>
import { as } from "./look.mjs";
import { go, close, BASE } from "./h.mjs";
const [login, url] = process.argv.slice(2);
const p = await as(login, { width: 1280, height: 800 });
const raw = await (await p.context().request.get(`${BASE}${url}`)).text();
await go(p, url); await p.waitForTimeout(1500);
const after = await p.evaluate(() => document.querySelector("main")?.innerHTML ?? "");
const tidy = (h) => h.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "\n").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').split("\n").map((s) => s.trim()).filter(Boolean);
const m = raw.match(/<main[\s\S]*<\/main>/)?.[0] ?? "";
const a = tidy(m), b = tidy(after);
const sa = new Set(a), sb = new Set(b);
console.log("server only:", a.filter((x) => !sb.has(x)).slice(0, 15));
console.log("client only:", b.filter((x) => !sa.has(x)).slice(0, 15));
await close();
