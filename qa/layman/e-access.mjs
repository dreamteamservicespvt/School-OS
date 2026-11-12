// Layman E: each role types addresses of pages it should not open.
process.env.QA_OUT ??= "D:/all/Projects/School-OS/qa-output/layman-e";
const { asRole, go, close, sleep, pageState, note } = await import("../full/selftest-A-h.mjs");
const role = process.argv[2];
const urls = process.argv.slice(3);
const p = await asRole(role);
for (const u of urls) {
  let s;
  for (let i = 0; i < 3; i++) { try { await go(p, u); await sleep(1500); s = await pageState(p); break; } catch { await sleep(1500); } }
  const menu = await p.evaluate(() => [...document.querySelectorAll('nav a[href]')].map((a) => a.getAttribute("href"))).catch(() => []);
  const line = `${role} ${u} -> ${s?.path} ${s?.refused ? "REFUSED" : "OPEN"} h1="${s?.h1}" ${s?.refused ? "" : (s?.text ?? "").slice(0, 160).replace(/\n/g, " | ")}`;
  console.log(line); note(`access-${role}`, line);
}
await close();
