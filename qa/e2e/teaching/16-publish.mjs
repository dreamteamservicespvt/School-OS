// The workaround a school is left with for the late joiner: the Principal sends the paper back, the teacher
// marks Tanvi ML, submits; then the Principal publishes Class Test October QA for Class 5 A with a message to parents.
import { as, visit, text, report, shot, VIEWPORTS, sql, sleep, messages, SUNRISE } from "./h.mjs";
import { close } from "../../lib.mjs";

const EXAM = "648fbf69-345c-4543-aafe-1e9d75419866", SEC = "b07ca58e-2716-4729-ab56-3cdf783e5598";
const MARKS = `/examination-results/marks/31218111-601c-49d2-b3b9-c8cbdf28bd7c/${SEC}`;
const p = await as("principal", VIEWPORTS.laptop1280);
if (!process.env.SKIP_REOPEN) {
  await visit(p, MARKS, 1500);
  await p.getByRole("button", { name: "Send back to teacher" }).click(); await sleep(800);
  let dlg = p.getByRole("dialog");
  await dlg.getByLabel("Reason").fill("Tanvi joined on 18 Oct after the test; mark her ML so the class can be published.");
  await dlg.getByRole("button", { name: "Send back" }).click(); await sleep(3000);
  console.log("send back ->", await messages(p));
  const t = await as("teacher", VIEWPORTS.phone390);
  await visit(t, MARKS, 1500);
  await t.getByRole("button", { name: "Grid" }).first().click().catch(() => {}); await sleep(800);
  const c = t.locator("input[aria-label='Marks for Tanvi Latejoin, out of 20']");
  await c.fill("ML"); await c.press("Tab"); await sleep(3000);
  await t.getByRole("button", { name: "Submit marks" }).click(); await sleep(1500);
  dlg = t.getByRole("dialog");
  console.log("confirm:", (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 300));
  await dlg.getByRole("button", { name: /^Submit \d+ marks/ }).click(); await sleep(3500);
  console.log("resubmit ->", await messages(t));
}
await visit(p, `/examination-results/results?section=${SEC}&exam=${EXAM}`, 1500);
console.log("results:", (await text(p, 600)));
await p.getByRole("button", { name: "Review and publish" }).first().click(); await sleep(1200);
let dlg = p.getByRole("dialog");
console.log("publish dialog:", (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 900));
await shot(p, "publish-dialog", false);
await dlg.getByRole("button", { name: "Publish now" }).click(); await sleep(1200);
dlg = p.getByRole("dialog");
console.log("confirm:", (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 500));
// double click the confirm
await dlg.getByRole("button", { name: /^Publish and tell|^Publish now/ }).dblclick(); await sleep(5000);
console.log("after publish:", await messages(p));
console.log((await text(p, 900)));
await report(p, "after publish");
console.log("publications:", sql(`select id, status, published_at, message_parents, messages_sent, section_ids::text from result_publication where exam_id='${EXAM}'`));
console.log("messages:", sql(`select m.rule_key, m.status, m.recipient_count, m.created_at from message m where m.school_id='${SUNRISE}' and m.rule_key ilike '%result%' order by m.created_at desc limit 3`));
await close();
