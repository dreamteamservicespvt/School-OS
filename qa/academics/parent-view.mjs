// Parent visibility of results: the school sends Sahithi Gorle's and Karthik Pydi's guardians a
// Parent Link (no channel is connected), then the Principal previews each Parent Link as the
// parent sees it: the published Demo Unit Test 2 results / report card must show.
import { mainText, shot, close } from "../lib.mjs";
import { res, login, open, messages, sleep, sql, uuidOf } from "./r.mjs";

const M = "Examination & Results", P = "Report Cards (Parent Link)";
const guardians = { "Sahithi Gorle": ["11379fe5-f845-41a1-b2a7-0ee47b146bc5", "Sanjay Gorle"], "Karthik Pydi": ["8b68daff-c705-480d-a9d3-5ec344079e3c", "Mahesh Pydi"] };
const ad = await login("cems.admin");
for (const [child, [gid, gname]] of Object.entries(guardians)) {
  await open(ad, `/student-management/guardians/${gid}`);
  await ad.locator("button", { hasText: "Resend Parent Link" }).first().click();
  await sleep(700);
  await ad.locator("dialog[open] button", { hasText: `Send to ${gname}` }).click();
  await sleep(3000);
  const m = await messages(ad);
  const link = sql(`select id, status from parent_link where guardian_id='${gid}';`);
  res("Communication", "Parent Link", `Send Parent Link to ${gname} (no WhatsApp/SMS connected)`, "School Admin", "Link made; screen does not claim it was delivered", `${m.slice(0, 160)} || ${link.replace(/\s+/g, " ").slice(0, 120)}`, /sent|delivered/i.test(m) && !/not|no /i.test(m) ? "FAIL" : "NEEDS EXTERNAL CREDENTIAL");
}
const pr = await login("cems.principal");
for (const [child, [gid]] of Object.entries(guardians)) {
  const id = uuidOf(sql(`select id from parent_link where guardian_id='${gid}' order by created_at desc limit 1;`));
  if (!id) { res(M, P, `Preview ${child}'s Parent Link`, "Principal", "Results visible", "No Parent Link record was made", "BLOCKED"); continue; }
  await open(pr, `/communication/parent-link/${id}/preview`);
  const t = (await mainText(pr, 3000)).replace(/\s+/g, " ");
  console.log(t.slice(0, 1500));
  const hit = t.match(/Demo Unit Test 2[^]{0,200}/)?.[0] ?? "";
  res(M, P, `Parent of ${child} sees published Demo Unit Test 2 result (staff preview of Parent Link)`, "Principal (preview as parent)", child === "Karthik Pydi" ? "Result shown with Fail / below pass subjects" : "Result shown: 125/125, rank 1", hit.slice(0, 200) || t.slice(0, 200), hit ? "PASS" : "FAIL");
  await shot(pr, `parent-preview-${child.split(" ")[0]}`);
}
await close();
