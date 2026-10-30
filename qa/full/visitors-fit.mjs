// Decision 17: at 1440 px the Visitors table fits its card, so "Check out" shows without scrolling sideways.
//   node qa/full/visitors-fit.mjs
import { as } from "./look.mjs";
import { go, close, VIEWPORTS } from "./h.mjs";

let fails = 0;
for (const login of ["reception", "principal"]) {
  for (const vp of ["desk1440", "laptop1280"]) {
    const p = await as(login, VIEWPORTS[vp]);
    await go(p, "/front-office/visitors");
    await p.waitForTimeout(800);
    const r = await p.evaluate(() => {
      const t = document.querySelector('main table[aria-label="Visitor log"], main table');
      if (!t) return null;
      const box = t.parentElement;
      const btn = [...t.querySelectorAll("a")].find((a) => /Check out/.test(a.textContent));
      const b = btn?.getBoundingClientRect(), c = box.getBoundingClientRect();
      return { table: Math.round(t.scrollWidth), box: Math.round(box.clientWidth), checkOut: !!btn, checkOutSeen: btn ? b.right <= c.right + 1 : null };
    });
    const ok = r && r.table <= r.box + 1;
    if (!ok && vp === "desk1440") fails++;
    console.log(`${ok ? "PASS" : vp === "desk1440" ? "FAIL" : "NOTE"} ${login} ${vp}: ${JSON.stringify(r)}`);
    await p.context().close();
  }
}
console.log(fails ? `${fails} failed` : "all passed at 1440");
await close();
