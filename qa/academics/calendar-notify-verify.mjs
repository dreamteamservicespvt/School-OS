// ACADEMICS-21 on the dev build: add a holiday with "Tell parents" while no WhatsApp or SMS is
// connected (crafted call through the dev manifest), then remove it.
//   QA_URL=http://localhost:3103 QA_MANIFEST=.next/dev/server/server-reference-manifest.json node qa/academics/calendar-notify-verify.mjs
import { close } from "../lib.mjs";
import { res, login, open, sql, uuidOf } from "./r.mjs";
import { callFormAction } from "./action.mjs";

const F = "src/app/(school)/events-calendar/actions.ts";
const msg = (r) => r.text.match(/"message":"[^"]*"/)?.[0] ?? r.text.replace(/\s+/g, " ").slice(-200);
const pr = await login("cems.principal");
await open(pr, "/events-calendar?do=add");
const r = await callFormAction(pr, F, "addEntryAction", { type: "holiday", title: "Demo QA Founders Day", from: "2026-12-18", applies: "school", notify: "on" });
res("Events & Calendar", "School Calendar", `Add holiday 18-12-2026 and tell parents, no WhatsApp/SMS (fix 93169a8, ${process.env.QA_URL})`, "Principal", "Added; says in plain words why parents were not told", msg(r), /Holiday added/.test(r.text) && /Nobody was told/.test(r.text) ? "PASS" : "FAIL", "ACADEMICS-21");
const id = uuidOf(sql("select id from calendar_entry where title='Demo QA Founders Day' and archived_at is null;"));
if (id) console.log(msg(await callFormAction(pr, F, "removeEntryAction", { entryId: id })));
await close();
