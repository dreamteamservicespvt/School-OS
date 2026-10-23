// On a small phone, can a teacher see the mark, the number keys and Next at the same time (One at a time)?
import { as, visit, VIEWPORTS, sleep, shot } from "./h.mjs";
import { close } from "../../lib.mjs";
const URL = "/examination-results/marks/31218111-601c-49d2-b3b9-c8cbdf28bd7c/58f4061b-667b-40fd-ae40-e7e07bdfc185"; // 5 B, open
for (const vp of ["phone320", "phone390"]) {
  const t = await as("teacher", VIEWPORTS[vp]);
  await visit(t, URL, 2000);
  const next = t.getByRole("button", { name: /^Next/ }).last();
  await next.scrollIntoViewIfNeeded(); await sleep(500);
  const geo = await t.evaluate(() => {
    const r = (el) => el ? (({ top, bottom }) => ({ top: Math.round(top), bottom: Math.round(bottom) }))(el.getBoundingClientRect()) : null;
    const fixed = [...document.querySelectorAll("body *")].filter((e) => getComputedStyle(e).position === "fixed" && e.getBoundingClientRect().height > 30 && e.getBoundingClientRect().top > 200).map((e) => r(e));
    const keys = document.querySelector('[aria-label="Number keys"]');
    const box = [...document.querySelectorAll("p,span,div")].find((e) => /^Marks \/ \d+$/.test(e.textContent?.trim() ?? ""));
    const nextBtn = [...document.querySelectorAll("button")].filter((b) => /^Next/.test(b.textContent.trim())).pop();
    return { vh: innerHeight, markLabel: r(box), keys: r(keys), next: r(nextBtn), fixedBars: fixed };
  });
  console.log(vp, JSON.stringify(geo));
  await shot(t, `keypad-${vp}-next-in-view`, false);
  await t.context().close();
}
await close();
