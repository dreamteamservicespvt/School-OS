// Self-test B item 1: Take Attendance at phone size (light + dark) as the class teacher of Class 5 A.
// Today's lock (11:00 AM) has passed, so the School Admin moves "Attendance locks at" to 11:30 PM for the run
// and puts it back to the old time at the end (printed).
//   MSYS_NO_PATHCONV=1 node qa/full/selftest-B-attendance-phone.mjs
import { asB, go, mainText, close, sleep, PHONE, DESK, snap, rec, phoneCheck, focusedCovered } from "./selftest-B-h.mjs";
const adm = await asB("admin", DESK);
async function setLock(v) {
  await go(adm, "/attendance-management/settings?tab=late"); await sleep(1500);
  const box = adm.getByLabel(/Attendance locks at/).first();
  const old = await box.inputValue();
  await box.fill(v); await box.press("Tab").catch(() => {});
  await adm.getByRole("button", { name: "Save late rules" }).click(); await sleep(3000);
  console.log("lock", old, "->", v, "|", (await mainText(adm, 4000)).match(/[^\n]*(Saved|saved|locks|Check)[^\n]*/g)?.slice(0, 3).join(" / "));
  return old;
}
const old = await setLock("23:30");
try {
  for (const scheme of ["light", "dark"]) {
    const p = await asB("teacher", PHONE, scheme);
    await go(p, "/attendance-management"); await sleep(2000);
    const head = (await mainText(p, 600)).replace(/\n+/g, " | ");
    console.log(scheme, "HEAD", head.slice(0, 400));
    const c = await phoneCheck(p);
    rec(`attendance ${scheme}: no sideways scroll`, c.scrollWidth <= 390, `scrollWidth ${c.scrollWidth} ${c.wide.join("; ")}`);
    rec(`attendance ${scheme}: tap targets >= 40px`, c.small.length === 0, c.small.join(", "));
    rec(`attendance ${scheme}: text >= 12px`, c.tinyText.length === 0, c.tinyText.join(", "));
    console.log("sticky", JSON.stringify(c.sticky));
    await snap(p, `att-${scheme}-top`); await snap(p, `att-${scheme}-full`, true);
    if (scheme === "light") {
      // Mark two absent and one late, then look at the last student (is the row under the Save bar?).
      const rows = p.getByRole("button", { name: /^A$|Absent/ });
      console.log("A buttons", await rows.count());
      const absentBtns = p.locator("main").getByRole("radio", { name: /^A\b|Absent/ });
      const nA = await absentBtns.count(); console.log("absent radios", nA);
      const target = nA ? absentBtns : rows;
      await target.nth(1).tap(); await sleep(300); await target.nth(4).tap(); await sleep(300);
      const lateBtns = p.locator("main").getByRole(nA ? "radio" : "button", { name: /^L\b|Late/ });
      await lateBtns.nth(6).tap(); await sleep(500);
      const lastL = lateBtns.last(); await lastL.scrollIntoViewIfNeeded(); await sleep(400);
      const lb = await lastL.boundingBox();
      const save = p.getByRole("button", { name: /^Save attendance/ });
      const sb = await save.boundingBox();
      console.log("last row L", JSON.stringify(lb), "save", JSON.stringify(sb));
      rec("attendance: last student's buttons not hidden under the Save bar when scrolled to", lb && sb && (lb.y + lb.height <= sb.y || lb.y >= sb.y + sb.height), "");
      await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await sleep(400);
      await snap(p, `att-${scheme}-bottom`);
      const label = await save.innerText(); console.log("SAVE", label);
      await save.tap(); await sleep(4000);
      const after = (await mainText(p, 900)).replace(/\n+/g, " | ");
      console.log("AFTER", after.slice(0, 500));
      rec("attendance: saved with 2 absent 1 late", /Saved/.test(after + (await save.innerText().catch(() => ""))) && /2 absent/.test(label) && /1 late/.test(label), label);
      await snap(p, `att-${scheme}-saved`);
      // Layman: Back button then forward again: marks still there.
      await p.goBack(); await sleep(1500); await p.goForward(); await sleep(2500);
      const again = (await mainText(p, 900)).replace(/\n+/g, " | ");
      rec("attendance: after Back/Forward the saved marks show", /\b2\b[^|]*\|\s*Absent|Absent/.test(again) && /Saved at/.test(again), again.slice(0, 250));
    }
    if (p.problems.length) console.log("PROBLEMS", p.problems);
    await p.context().close();
  }
} finally {
  await setLock(old || "11:00");
}
await close();
