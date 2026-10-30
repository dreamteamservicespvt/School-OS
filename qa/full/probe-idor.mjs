// Delivery audit 2026-10-31: a teacher's own attendance-correction request with another class's
// section and student swapped in (ids are the same length, so the request stays well formed).
// Ravi Teja (teacher) teaches 5 A, 5 B, 6 A; Class 6 B is not his. The server must refuse it.
//   MSYS_NO_PATHCONV=1 node qa/full/probe-idor.mjs
import { capture, replay } from "./replay.mjs";
import { close } from "./h.mjs";

const OWN = "544feaae-37ed-4756-aad5-a4f6dcb857f8", OTHER = "741ca239-902d-451c-9118-c8056aede0a1"; // 5 A, 6 B
const OWN_KID = "2ad52370-e606-4417-ade7-7c734ac8400c", OTHER_KID = "e39b879c-11ac-413c-bc82-bed5ff518369"; // Akshara Pillai (5 A), Aditya Verma (6 B)
const caught = await capture("teacher", `/attendance-management/register/correction?section=${OWN}&date=2026-10-30`, async (p) => {
  await p.locator("input[name=people]").first().check();
  await p.locator("select[name=status]").selectOption({ label: "Absent (A)" });
  await p.locator("textarea[name=reason]").fill("Marked present by mistake, she was not in class.");
  await p.getByRole("button", { name: "Send for approval" }).click();
});
const body = caught.body.toString("utf8");
console.log("captured", body.length, "bytes; own section:", body.includes(OWN), "own kid:", body.includes(OWN_KID));
const swap = (b, pairs) => Buffer.from(pairs.reduce((s, [a, z]) => s.split(a).join(z), b), "utf8");
const msg = (r) => (r.text.match(/"message":"([^"]{0,200})/)?.[1] ?? r.text.replace(/\s+/g, " ").slice(0, 200));
for (const [label, pairs] of [["6 B section + 6 B student", [[OWN, OTHER], [OWN_KID, OTHER_KID]]], ["5 A section + 6 B student", [[OWN_KID, OTHER_KID]]], ["6 B section + 5 A student", [[OWN, OTHER]]]]) {
  for (const who of ["teacher", "librarian"]) {
    const r = await replay(caught, who, { body: swap(body, pairs) });
    console.log(`${who}\t${label}\t${r.status}\t${msg(r)}`);
  }
}
await close();
