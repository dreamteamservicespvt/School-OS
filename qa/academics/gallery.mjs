// Gallery: Demo QA Album (Grade 5 parents): Teacher cannot publish; publishing an empty album;
// the album page and an upload of one photo through the screen; tagging Sahithi; archive.
import { writeFileSync } from "node:fs";
import { mainText, shot, close } from "../lib.mjs";
import { res, login, open, messages, sleep, sql, uuidOf } from "./r.mjs";
import { callFormAction } from "./action.mjs";

const M = "Events & Calendar", P = "Gallery";
const F = "src/app/(school)/events-calendar/actions.ts";
const msg = (r) => r.text.match(/"message":"[^"]*"/)?.[0] ?? r.text.replace(/\s+/g, " ").slice(-200);
const albumId = uuidOf(sql("select id from album where name='Demo QA Album';"));
const pr = await login("cems.principal");
const te = await login("cems.teacher");
let r = await callFormAction(te, F, "publishAlbumAction", { albumId });
res(M, P, "Teacher publishes the album (crafted call)", "Teacher", "Refused", msg(r), /cannot publish/.test(r.text) ? "PASS" : "FAIL");
r = await callFormAction(pr, F, "publishAlbumAction", { albumId });
res(M, P, "Publish an album with no photos", "Principal", "Refused or warned: no photos", msg(r), /"ok":false/.test(r.text) ? "PASS" : "FAIL");
await open(pr, `/events-calendar/gallery/${albumId}`);
let t = (await mainText(pr, 2500)).replace(/\s+/g, " ");
console.log(t.slice(0, 700));
res(M, P, "Open the album", "Principal", "Album page with upload", t.slice(0, 160), /Demo QA Album/.test(t) ? "PASS" : "FAIL");
// upload one photo through the file input, if there is one
const input = pr.locator('input[type="file"]').first();
if (await input.count()) {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  writeFileSync("/home/claude/qa-out/academics/demo-album-photo.png", png);
  await input.setInputFiles("/home/claude/qa-out/academics/demo-album-photo.png");
  await sleep(1500);
  const send = pr.locator("dialog[open] button, main button", { hasText: /^Upload|^Add \d|^Save/ }).first();
  if (await send.count()) await send.click();
  await sleep(5000);
  const m = await messages(pr);
  const n = sql(`select count(*) from media_item where album_id='${albumId}';`);
  res(M, P, "Upload one photo to the album", "Principal", "Photo added; untagged photos stay staff only", `${m.slice(0, 160)} || media rows: ${n.replace(/\s+/g, " ").match(/\d+/)?.[0]}`, /\b1\b/.test(n.split("\n")[2] ?? "") ? "PASS" : "FAIL");
}
await shot(pr, "album");
r = await callFormAction(pr, F, "archiveAlbumAction", { albumId });
res(M, P, "Archive the Demo album", "Principal", "Archived with undo", msg(r), /archived/.test(r.text) ? "PASS" : "FAIL");
await close();
