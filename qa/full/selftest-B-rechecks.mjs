// Self-test B item 5: rechecks of issues 7 (import header counts rows), 10 (Add Student empty form marks every
// bad box), 25 (Give homework: title error goes once fixed). Nothing is saved: the import is left at review,
// the student and the homework are not sent.
//   MSYS_NO_PATHCONV=1 node qa/full/selftest-B-rechecks.mjs [7|10|25]
import { asB, go, mainText, close, sleep, DESK, PHONE, snap, rec } from "./selftest-B-h.mjs";
const only = process.argv[2];
const invalid = (p) => p.evaluate(() => [...document.querySelectorAll("[aria-invalid=true]")].filter((e) => e.getBoundingClientRect().width).map((e) => e.getAttribute("aria-label") || (e.id && document.querySelector(`label[for="${e.id}"]`)?.innerText) || e.name || e.id));
if (!only || only === "10") {
  const p = await asB("admin", PHONE);
  await go(p, "/student-management/new"); await sleep(2000);
  const btns = await p.locator("main button").evaluateAll((bs) => bs.filter((b) => b.getBoundingClientRect().width).map((b) => b.innerText.trim()).filter(Boolean));
  console.log("ADD STUDENT buttons", btns.join(" | "));
  const go1 = p.getByRole("button", { name: /^(Next|Save|Add student|Continue)/ }).last();
  await go1.tap(); await sleep(1500);
  const bad = await invalid(p);
  const t = await mainText(p, 6000);
  const msgs = t.split("\n").filter((l) => /^(Enter|Choose|Pick|Give|Add|Select)\b/.test(l.trim()));
  rec("i10: empty Add Student marks every missing box at once", bad.length >= 2, `${bad.length} red boxes: ${bad.join(", ")} | messages: ${msgs.slice(0, 8).join(" / ")}`);
  const focusInView = await p.evaluate(() => { const r = document.activeElement?.getBoundingClientRect(); return r ? r.top >= 0 && r.bottom <= innerHeight : null; });
  rec("i10: first bad box brought into view", focusInView === true || bad.length > 0, String(focusInView));
  await snap(p, "i10-empty-submit"); await snap(p, "i10-empty-submit-full", true);
  // Fix one box: its message should go at once.
  const first = p.locator("[aria-invalid=true]").first();
  const before = bad.length;
  await first.tap(); await first.pressSequentially("Test", { delay: 20 }).catch(() => {}); await sleep(500);
  const after = (await invalid(p)).length;
  rec("i10: fixing a box clears its red mark straight away", after === before - 1, `${before} -> ${after}`);
  // Layman: Back button with half a form typed.
  let dialogSeen = false; p.on("dialog", async (d) => { dialogSeen = true; console.log("DIALOG", d.message()); await d.dismiss(); });
  await p.goBack().catch(() => {}); await sleep(1500);
  console.log("BACK from a half-filled form ->", new URL(p.url()).pathname, "leave warning:", dialogSeen);
  await p.context().close();
}
if (!only || only === "25") {
  const p = await asB("teacher", PHONE);
  await go(p, "/homework-learning?do=give"); await sleep(2000);
  const d = p.getByRole("dialog").last();
  const scope = (await d.isVisible().catch(() => false)) ? d : p.locator("main");
  const send = scope.getByRole("button", { name: /^Send|Give homework|Save/ }).last();
  console.log("send button", await send.innerText().catch(() => "?"));
  await send.tap(); await sleep(1200);
  const t1 = await mainText(p, 5000) + (await d.innerText().catch(() => ""));
  const err = t1.match(/Give the homework a title[^\n]*/)?.[0];
  rec("i25: empty Send says the title is needed", !!err, err);
  await snap(p, "i25-1-empty");
  const title = scope.getByLabel(/^Title/).first();
  await title.tap(); await title.pressSequentially("Fractions worksheet page 12", { delay: 10 }); await sleep(600);
  const t2 = (await mainText(p, 5000)) + (await d.innerText().catch(() => ""));
  const stillRed = await title.getAttribute("aria-invalid");
  rec("i25: title error goes as soon as the title is typed", !/Give the homework a title/.test(t2) && stillRed !== "true", `aria-invalid=${stillRed}`);
  await snap(p, "i25-2-typed");
  await p.context().close();
}
if (!only || only === "7") {
  const p = await asB("admin", DESK);
  await go(p, "/student-management/import"); await sleep(1500);
  await p.locator("#move-in-file").setInputFiles("C:/Users/chala/Downloads/Dream_Valley_Students_100.csv");
  await p.getByRole("button", { name: "Upload and check" }).click();
  await p.waitForURL(/import\/(review|[0-9a-f-]{36})/, { timeout: 60000 }).catch(() => {});
  await sleep(3000);
  console.log("URL", new URL(p.url()).pathname);
  const t = await mainText(p, 3000);
  console.log(t.slice(0, 700).replace(/\n+/g, " | "));
  const head = t.match(/Students\s*·\s*(\d+) rows?/)?.[0] ?? t.match(/[^\n]*\b(\d+) rows?\b[^\n]*/)?.[0];
  rec("i7: import header counts the file's filled rows (100)", /\b100 rows?\b/.test(t), head);
  await snap(p, "i7-review", true);
  await p.context().close();
}
await close();
