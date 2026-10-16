// node qa/platform/timing.mjs <login> <url> [url...] — server render time of each URL (3 tries).
import { close, BASE } from "../lib.mjs";
import { as } from "./util.mjs";
const [login, ...urls] = process.argv.slice(2);
const p = await as(login);
for (const u of urls) {
  const times = [];
  for (let i = 0; i < Number(process.env.TRIES ?? 3); i++) {
    const s = Date.now();
    let line;
    try {
      const r = await p.context().request.get(BASE + u, { maxRedirects: 0, timeout: 120000 });
      const b = await r.text();
      line = `${r.status()} ${Date.now() - s}ms ${Math.round(b.length / 1024)}KB`;
    } catch (e) { line = `ERR ${Date.now() - s}ms`; }
    times.push(line);
  }
  console.log(u, "|", times.join(" | "));
}
await close();
