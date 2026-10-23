// Workflow 8 steps 9 and 12 on a phone: the class teacher asks for suggested remarks (AI, "Suggestion"), keeps one,
// writes one, saves; the attendance on the report card vs the register; the report card PDF downloads.
import { as, visit, text, report, shot, VIEWPORTS, sql, sleep, messages, OUT } from "./h.mjs";
import { close, BASE } from "../../lib.mjs";
import { writeFileSync } from "node:fs";
import path from "node:path";

const t = await as("teacher", VIEWPORTS.phone390);
await visit(t, "/examination-results/report-cards", 1500);
await t.getByRole("tab", { name: "Remarks" }).or(t.getByRole("link", { name: "Remarks" })).or(t.getByRole("radio", { name: "Remarks" })).first().click(); await sleep(1500);
console.log("remarks:", (await text(t, 1200)));
const sug = t.getByRole("button", { name: "Suggest remarks" });
console.log("Suggest remarks button:", await sug.count());
if (await sug.count()) {
  await sug.click(); await sleep(6000);
  const first = t.locator("li").filter({ hasText: "Kabir Sharma" }).first();
  console.log("Kabir with suggestion:", (await first.innerText()).replace(/\s+/g, " ").slice(0, 600));
  console.log("Tanvi:", (await t.locator("li").filter({ hasText: "Tanvi Latejoin" }).first().innerText()).replace(/\s+/g, " ").slice(0, 400));
  console.log("Ananya:", (await t.locator("li").filter({ hasText: "Ananya Verma" }).first().innerText()).replace(/\s+/g, " ").slice(0, 400));
  await shot(t, "remarks-suggest-phone", false);
  await first.getByRole("button", { name: "Use this" }).click().catch((e) => console.log("no Use this", e.message.slice(0, 60)));
}
const meg = t.locator("li").filter({ hasText: "Meghana Nair" }).first();
await meg.getByLabel("Class teacher remark").fill("Excellent effort in Maths; keep practising word problems.");
await sleep(500);
await t.getByRole("button", { name: /^Save/ }).last().click(); await sleep(3000);
console.log("save ->", await messages(t));
await report(t, "remarks");
// Attendance on the report card for Kabir vs the register
console.log("Kabir attendance line:", (await t.locator("li").filter({ hasText: "Kabir Sharma" }).first().innerText()).match(/Attendance[^\n]*/)?.[0]);
// PDF
await visit(t, "/examination-results/report-cards", 1500);
const link = t.getByRole("link", { name: /View PDF/ }).first();
const href = await link.getAttribute("href");
console.log("pdf href:", href);
const cookies = (await t.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
const r = await fetch(`${BASE}${href}`, { headers: { Cookie: cookies } });
const buf = Buffer.from(await r.arrayBuffer());
console.log("pdf:", r.status, r.headers.get("content-type"), buf.length, "bytes");
const file = path.join(OUT, "report-card-akshara.pdf");
writeFileSync(file, buf);
console.log("saved", file);
await close();
