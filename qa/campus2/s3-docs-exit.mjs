// Staff & HR: upload a document (no file refused, wrong type, a good one expiring in 20 days); staff list search;
// Staff Exit for the QA Demo staff member; staff attendance page opens.
import { asUser, go, mainText, close, record, said, sleep } from "./util.mjs";
import { writeFileSync } from "node:fs";
const M = "Staff & HR Management";
const rec = (pg, role, action, expected, actual, status, defect) => record({ module: M, page: pg, action, role, expected, actual, status, ...(defect ? { defect } : {}) });
const ONLY = process.env.ONLY?.split(",");
const step = async (name, fn) => { if (ONLY && !ONLY.some((o) => name.includes(o))) return; try { await fn(); } catch (e) { console.log("ERR", name, e.message.split("\n")[0]); } };
const PNG = "/home/claude/qa-out/campus2/qa-demo-doc.png", TXT = "/home/claude/qa-out/campus2/qa-demo-doc.txt";
writeFileSync(PNG, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
writeFileSync(TXT, "QA Demo text file, not a document");
const h = await asUser("cems.hr");
const staffName = process.env.STAFF ?? "QA Demo Staff 8853";
async function openUpload() {
  await go(h, "/staff-hr-management/documents"); await h.locator("main").getByRole("button", { name: "Upload document" }).click(); await sleep(800);
  return (await h.locator("dialog[open]").count()) ? h.locator("dialog[open]") : h.locator("main");
}
async function submitIn(root) { const b = root.locator("button[type=submit]").last(); const t = (await b.innerText()).trim(); await b.click(); await sleep(3000); return { t, s: await said(h), open: await h.locator("dialog[open]").count() }; }
await step("docs", async () => {
  let root = await openUpload();
  const st = root.locator("[name=staffId]"); await st.selectOption({ label: (await st.locator("option", { hasText: staffName }).first().innerText()).trim() });
  await root.locator("[name=kind]").fill("Certificate");
  await root.locator("[name=file]").evaluate((e) => e.removeAttribute("required"));
  let r = await submitIn(root);
  rec("Documents & ID Cards", "HR", "Upload a document with no file chosen (browser check removed)", "Refused: choose the file", r.s, /file/i.test(r.s) ? "PASS" : "FAIL");
  root = await openUpload(); await root.locator("[name=staffId]").selectOption({ label: (await root.locator("[name=staffId] option", { hasText: staffName }).first().innerText()).trim() });
  await root.locator("[name=kind]").fill("Certificate");
  await root.locator("[name=file]").evaluate((e) => e.removeAttribute("accept")); await root.locator("[name=file]").setInputFiles(TXT);
  r = await submitIn(root);
  rec("Documents & ID Cards", "HR", "Upload a .txt file as a document", "Refused: JPG, PNG or PDF only", r.s, /PDF|JPG|PNG|type/i.test(r.s) && !/uploaded|saved/i.test(r.s) ? "PASS" : "FAIL");
  root = await openUpload(); await root.locator("[name=staffId]").selectOption({ label: (await root.locator("[name=staffId] option", { hasText: staffName }).first().innerText()).trim() });
  await root.locator("[name=kind]").fill("Contract");
  await root.locator("[name=file]").setInputFiles(PNG);
  await root.locator("[name=expiresOn]").fill(new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10));
  r = await submitIn(root);
  rec("Documents & ID Cards", "HR", `Upload a contract for ${staffName} expiring in 20 days`, "Saved; shows as Expiring soon", r.s, /upload|saved|added/i.test(r.s) ? "PASS" : "FAIL");
  await go(h, "/staff-hr-management/documents"); const t = await mainText(h, 3000);
  rec("Documents & ID Cards", "HR", "Documents list after the upload", "Contract listed as Expiring soon", t.slice(t.indexOf("Expiring"), t.indexOf("Expiring") + 60).replace(/\n/g, " ") + " … " + (t.includes(staffName) ? "listed" : "not listed"), t.includes(staffName) && /Expiring soon/i.test(t) ? "PASS" : "FAIL");
});
await step("list", async () => {
  await go(h, "/staff-hr-management?q=" + encodeURIComponent(staffName)); const t = await mainText(h, 3000);
  rec("Staff List", "HR", `Search the Staff List for "${staffName}"`, "Found with staff ID and designation", t.includes(staffName) ? "found" : t.slice(0, 200), t.includes(staffName) ? "PASS" : "FAIL");
});
await step("exit", async () => {
  await go(h, "/staff-hr-management/exit/new"); await sleep(600);
  console.log((await mainText(h, 1500)).slice(0, 800));
  const root = (await h.locator("dialog[open]").count()) ? h.locator("dialog[open]") : h.locator("main");
  let r = await submitIn(root);
  rec("Staff Exit", "HR", "Start an exit with nothing chosen", "Refused in plain words", r.s || "(browser required-field check)", /choose|staff|needed|date/i.test(r.s) || (await root.locator(":invalid").count()) > 0 ? "PASS" : "FAIL");
  const st = root.locator("[name=staffId]"); await st.selectOption({ label: (await st.locator("option", { hasText: staffName }).first().innerText()).trim() });
  const ty = root.locator("[name=type]"); if (await ty.count()) { const o = await ty.locator("option").allInnerTexts(); await ty.selectOption({ label: o.find((x) => /Resign/i.test(x)) ?? o[1] }).catch(() => {}); } else await root.locator("button", { hasText: /^Resignation$/ }).click().catch(() => {});
  await root.locator("[name=receivedOn]").fill(new Date().toISOString().slice(0, 10)).catch(() => {});
  await root.locator("[name=lastWorkingDay]").fill(new Date(Date.now() - 864e5 * 30).toISOString().slice(0, 10));
  await root.locator("[name=reason]").fill("QA Demo moving to another city");
  r = await submitIn(root);
  rec("Staff Exit", "HR", "Record a resignation with the last working day 30 days in the past", "Refused, or asks to confirm a past date", r.s, /past|before|today|after/i.test(r.s) ? "PASS" : "FAIL", /past|before|today|after/i.test(r.s) ? undefined : "CAMPUS2-07");
  if (!/past|before|today|after/i.test(r.s)) return;
  const kept = await st.inputValue();
  rec("Staff Exit", "HR", "Staff member box after the date refusal", "The chosen staff member stays chosen", kept ? "kept" : "reset to Choose (dates and reason kept)", kept ? "PASS" : "FAIL", kept ? undefined : "CAMPUS2-02");
  if (!kept) await st.selectOption({ label: (await st.locator("option", { hasText: staffName }).first().innerText()).trim() });
  await root.locator("[name=lastWorkingDay]").fill(new Date(Date.now() + 864e5 * 30).toISOString().slice(0, 10));
  r = await submitIn(root);
  rec("Staff Exit", "HR", `Record ${staffName}'s resignation, last working day in 30 days`, "Saved; handover and clearance lists shown", r.s + " / " + (await mainText(h, 1500)).slice(0, 300).replace(/\n/g, " / "), /recorded|saved|started|resign/i.test(r.s) ? "PASS" : "FAIL");
});
await step("attendance", async () => {
  h.problems.length = 0; await go(h, "/attendance-management/staff"); const t = await mainText(h, 1500);
  rec("Staff attendance (Attendance Management)", "HR", "Open staff attendance", "Opens (HR has Own reach in Attendance; staff attendance may be refused)", t.slice(0, 200).replace(/\n/g, " / ") + " " + h.problems.join("; "), h.problems.length === 0 ? "PASS" : "FAIL");
});
await h.context().close(); await close();
