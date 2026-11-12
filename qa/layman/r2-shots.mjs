import { asRole, go, sleep, close } from "./d-h.mjs";
const out = "D:/all/Projects/School-OS/qa-output/layman-r2";
for (const [w, h] of [[390, 844], [1440, 900]]) {
  for (const scheme of ["light", "dark"]) {
    const p = await asRole("librarian", { width: w, height: h });
    await p.emulateMedia({ colorScheme: scheme });
    await go(p, "/library-management/books"); await sleep(800);
    const href = (await p.locator("main a").evaluateAll((as) => as.map((a) => a.getAttribute("href")).filter((x) => /\/books\/[0-9a-f-]{36}$/.test(x ?? ""))))[0];
    await go(p, href); await sleep(1000);
    await p.screenshot({ path: `${out}/book-${w}-${scheme}.png` });
    await p.context().close();
  }
}
const a = await asRole("admin", { width: 1440, height: 900 });
await go(a, "/communication"); await sleep(1200);
await a.screenshot({ path: `${out}/comm-tabs-1440.png`, clip: { x: 0, y: 0, width: 1440, height: 320 } });
await close();
console.log("shots done");
