// Publish the datesheet (workflow 8 step 4-5): calendar, admit cards ready, parents told. Then print admit cards.
import { as, visit, text, report, shot, VIEWPORTS, sql, sleep, messages, SUNRISE } from "./h.mjs";
import { close } from "../../lib.mjs";

const EXAM = process.env.EXAM ?? "648fbf69-345c-4543-aafe-1e9d75419866";
const p = await as("principal", VIEWPORTS[process.env.VP ?? "laptop1280"]);
await visit(p, `/examination-results/datesheet/${EXAM}`, 1500);
await p.getByRole("button", { name: /Publish datesheet/ }).first().click(); await sleep(1500);
const dlg = p.getByRole("dialog");
if (await dlg.count()) {
  console.log("publish dialog:", (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 900));
  await shot(p, "ds-publish-dialog", false);
  await dlg.getByRole("button", { name: /^Publish/ }).last().click(); await sleep(4000);
}
console.log("after publish:", await messages(p));
console.log((await text(p, 1500)));
console.log("exam:", sql(`select status, published_at from exam where id='${EXAM}'`));
console.log("calendar:", sql(`select title, type, start_date from calendar_entry where school_id='${SUNRISE}' and title ilike '%Class Test October%'`));
console.log("messages:", sql(`select m.title, m.status, m.recipient_count, m.rule_key, m.scheduled_at from message m where m.school_id='${SUNRISE}' and m.source_id='${EXAM}'`));
// Admit cards
await visit(p, "/examination-results/admit-cards", 1500);
console.log("\nadmit cards:", (await text(p, 1500)));
await report(p, "admit cards");
await close();
