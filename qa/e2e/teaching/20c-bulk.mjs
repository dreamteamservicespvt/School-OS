// Can the teacher mark several students Complete at once on a phone, a tablet and a laptop?
import { as, visit, VIEWPORTS, sleep, shot, text, messages, sql } from "./h.mjs";
import { close } from "../../lib.mjs";
const HW = "dd2720d9-0ad1-474d-aba3-322cf1c40a6f";
for (const vp of ["phone390", "tablet768", "laptop1280"]) {
  const t = await as("teacher", VIEWPORTS[vp]);
  await visit(t, `/homework-learning/submissions?hw=${HW}`, 1500);
  const boxes = await t.locator("input[type=checkbox][form=subs-bulk]:visible").count();
  const mc = await t.locator(":is(a,button):has-text('Mark Complete'):visible").count();
  const sel = await t.locator(":is(a,button):has-text('Select'):visible").count();
  console.log(vp, "visible row checkboxes:", boxes, "visible Mark Complete:", mc, "visible Select buttons:", sel);
  if (vp === "laptop1280" && boxes) {
    for (const n of ["Akshara Pillai", "Ayaan Iyer", "Dhruv Bhat"]) await t.locator(`input[type=checkbox][aria-label="Select ${n}"]:visible`).first().check();
    await sleep(500);
    await t.locator(":is(a,button):has-text('Mark Complete'):visible").first().click(); await sleep(1500);
    const d = t.getByRole("dialog");
    console.log("bulk preview:", (await d.innerText().catch(() => "none")).replace(/\s+/g, " ").slice(0, 600));
    await shot(t, "hw-bulk-preview", false);
    await d.getByRole("button", { name: /^Mark \d+ Complete/ }).click(); await sleep(3000);
    console.log("bulk ->", await messages(t));
    console.log("db:", sql(`select st.full_name, s.status, s.check_result from submission s join student st on st.id=s.student_id where s.homework_id='${HW}' and st.full_name in ('Akshara Pillai','Ayaan Iyer','Dhruv Bhat')`));
    const undo = t.locator(":is(a,button):has-text('Undo'):visible");
    console.log("undo visible:", await undo.count());
    if (await undo.count()) { await undo.first().click(); await sleep(3000); console.log("undo ->", await messages(t)); }
    console.log("db after undo:", sql(`select st.full_name, s.status, s.check_result from submission s join student st on st.id=s.student_id where s.homework_id='${HW}' and st.full_name in ('Akshara Pillai','Ayaan Iyer','Dhruv Bhat')`));
  }
  await shot(t, `hw-subs-${vp}`, false);
  await t.context().close();
}
await close();
