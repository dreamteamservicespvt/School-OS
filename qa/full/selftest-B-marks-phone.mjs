// Self-test B item 1: Marks Entry at phone size (light + dark), class teacher, Half Yearly Maths 6 A (grid).
//   MSYS_NO_PATHCONV=1 node qa/full/selftest-B-marks-phone.mjs
import { asB, go, mainText, close, sleep, PHONE, snap, rec, phoneCheck, focusedCovered } from "./selftest-B-h.mjs";
const ONLY = process.argv[2];
const URL_ = "/examination-results/marks/dceaeaa4-bd1d-445d-9f50-56e5614ddc19/3f6b76ae-e96a-4b9d-917b-c977c3b649fc";
for (const scheme of ONLY ? [ONLY] : ["light", "dark"]) {
  const p = await asB("teacher", PHONE, scheme);
  await go(p, URL_); await sleep(2000);
  const c = await phoneCheck(p);
  rec(`marks ${scheme}: no sideways scroll`, c.scrollWidth <= 390, `scrollWidth ${c.scrollWidth} ${c.wide.join("; ")}`);
  rec(`marks ${scheme}: tap targets >= 40px`, c.small.length === 0, c.small.join(", "));
  rec(`marks ${scheme}: text >= 12px`, c.tinyText.length === 0, c.tinyText.join(", "));
  console.log("sticky", JSON.stringify(c.sticky));
  const btns = await p.locator("main button").evaluateAll((bs) => bs.filter((b) => b.getBoundingClientRect().width).map((b) => (b.innerText || b.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 40)));
  console.log("BUTTONS", [...new Set(btns)].join(" | "));
  await snap(p, `marks-${scheme}-top`); await snap(p, `marks-${scheme}-full`, true);
  if (scheme === "light") {
    // One-at-a-time with the keypad (what a phone opens with).
    const key = (k) => (k === "Clear" ? p.getByRole("button", { name: /Clear/ }) : p.getByRole("button", { name: k, exact: true })).first();
    const tapKeys = async (...ks) => { for (const k of ks) { await key(k).tap(); await sleep(150); } };
    const theory = p.getByRole("button", { name: /^Theory \/ 80/ }).first();
    const internal = p.getByRole("button", { name: /^Internal \/ 20/ }).first();
    await theory.scrollIntoViewIfNeeded(); await theory.tap(); await tapKeys("Clear", "6", "5");
    await snap(p, `marks-${scheme}-prefilled`); await internal.tap(); await tapKeys("1", "8"); await snap(p, `marks-${scheme}-append`); await tapKeys("Clear", "1", "8");
    await snap(p, `marks-${scheme}-student1`);
    const nextB = p.getByRole("button", { name: /^Next/ }).first();
    await nextB.scrollIntoViewIfNeeded(); await sleep(300);
    const nb = await nextB.boundingBox(); const sv = await p.getByRole("button", { name: /Save now/ }).boundingBox();
    rec("marks: Next/keypad not under the sticky Save bar", nb && sv && (nb.y + nb.height <= sv.y || nb.y >= sv.y + sv.height), `next ${JSON.stringify(nb)} save ${JSON.stringify(sv)}`);
    await nextB.tap(); await sleep(400);
    await theory.tap(); await tapKeys("Clear", "AB"); await nextB.tap(); await sleep(400);
    await theory.tap(); await tapKeys("Clear", "9", "5"); await sleep(500);
    const t = await mainText(p, 8000);
    const bad = t.match(/[^\n]*(more than|above|out of 80|cannot|at most|max)[^\n]*/gi)?.slice(0, 4);
    await snap(p, `marks-${scheme}-over-max`);
    rec("marks: 95 out of 80 is refused or flagged at once", !!bad?.some((l) => /95|more than|above|cannot|at most/i.test(l)) || !/95/.test(t), JSON.stringify(bad));
    await tapKeys("Clear", "7", "2");
    await p.getByRole("button", { name: /Save now/ }).tap(); await sleep(3500);
    const after = (await mainText(p, 3000)).replace(/\n+/g, " | ");
    console.log("AFTER", after.match(/Entered \| [^|]*|Saved[^|]*|saved[^|]*/g));
    await snap(p, `marks-${scheme}-saved`);
    await go(p, URL_); await sleep(2000);
    await p.getByText("Grid", { exact: true }).first().tap(); await sleep(1500);
    const vals = await p.getByLabel(/^Theory for .*, out of 80/).evaluateAll((xs) => xs.slice(0, 3).map((x) => x.value));
    const int1 = await p.getByLabel(/^Internal for .*, out of 20/).first().inputValue();
    rec("marks: entries kept after reload (roll 1 65+18, roll 2 72)", vals[0] === "65" && vals[1] === "72" && int1 === "18", `${vals.join(",")} int1=${int1}`);
    const cg = await phoneCheck(p);
    rec("marks grid on phone: no sideways page scroll", cg.scrollWidth <= 390, `scrollWidth ${cg.scrollWidth} ${cg.wide.join("; ")}`);
    const last = p.getByLabel(/^Internal for .*, out of 20/).last();
    await last.tap(); await sleep(700);
    const cov = await focusedCovered(p);
    rec("marks grid: last student's box not under a sticky bar", cov?.inView && !cov?.coveredBy, JSON.stringify(cov));
    await snap(p, `marks-${scheme}-grid`);
  }
  if (p.problems.length) console.log("PROBLEMS", p.problems);
  await p.context().close();
}
await close();
