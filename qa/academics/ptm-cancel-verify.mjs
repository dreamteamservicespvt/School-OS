// ACADEMICS-21 on the dev build (QA_URL=http://localhost:3103): the Principal cancels the Demo PTM
// (2 parents booked) through the screen while no WhatsApp or SMS is connected.
import { close } from "../lib.mjs";
import { res, login, open, messages, sleep, sql, uuidOf } from "./r.mjs";

const ptmId = uuidOf(sql("select id from ptm where archived_at is null and date='2026-10-30';"));
const pr = await login("cems.principal");
await open(pr, `/events-calendar/ptm?day=${ptmId}&do=cancel`);
await sleep(3000);
const sheet = pr.locator("dialog[open]").last();
await sheet.locator('[name="reason"]').fill("Demo: QA test PTM, not a real meeting");
await sheet.locator("button", { hasText: "Cancel the PTM" }).click();
await sleep(6000);
const m = await messages(pr);
const left = sql(`select archived_at is not null as archived from ptm where id='${ptmId}';`);
res("Events & Calendar", "PTM", `Cancel the PTM that has bookings, no WhatsApp/SMS (fix 93169a8, ${process.env.QA_URL})`, "Principal", "Cancelled; says in plain words why parents were not told", `${m.slice(0, 200)} || archived: ${/\bt\b/.test(left)}`, /PTM cancelled/.test(m) && /\bt\b/.test(left) ? "PASS" : "FAIL", "ACADEMICS-21");
await close();
