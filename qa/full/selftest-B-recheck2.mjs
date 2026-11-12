// Self-test B recheck (17:00): self-test A's fixes, Fee Adjust "remove" approval, and a smoke of every menu page.
//   MSYS_NO_PATHCONV=1 node qa/full/selftest-B-recheck2.mjs <part>
import { asB, go, mainText, close, sleep, DESK, snap, rec } from "./selftest-B-h.mjs";
import { menu, pageState } from "./h.mjs";
const only = process.argv[2];
const flat = async (p, n = 3000) => (await mainText(p, n)).replace(/\n+/g, " | ");
const run = async (name, fn) => { if (only && only !== name) return; try { await fn(); } catch (e) { rec(`${name}: script error`, false, String(e.message).split("\n")[0]); } };
const fields = (loc) => loc.locator("input, select, textarea").evaluateAll((els) => els.filter((e) => e.type !== "hidden").map((e) => `${e.tagName.toLowerCase()}#${e.id}[${e.name}](${e.type})=${e.value} "${(e.labels?.[0]?.innerText ?? e.getAttribute("aria-label") ?? "").trim().slice(0, 40)}"`));
const S = new Date().toISOString().slice(11, 16).replace(":", "");

await run("call", async () => {
  const p = await asB("reception", DESK);
  const dlg = () => p.getByRole("dialog").last();
  await go(p, "/front-office/enquiries?do=call"); await sleep(2000);
  await dlg().locator("#cl-phone").fill("9876501299"); await sleep(800);
  await dlg().locator("#cl-name").fill(`QA-B Caller ${S}`);
  await dlg().locator("#cl-purpose").selectOption("Fee");
  await dlg().locator("textarea[name=note]").fill("Asked the fee for Class 4 (QA-B recheck)");
  const sw = dlg().getByLabel(/Set a follow-up/).first();
  await sw.check().catch(async () => sw.click());
  await sleep(600);
  const f = await fields(dlg());
  const when = f.filter((x) => /follow|date|time/i.test(x));
  console.log("FOLLOW-UP FIELDS", when.join(" ; "));
  await snap(p, "re-A1-call-followup");
  await dlg().getByRole("button", { name: /^Save/ }).last().click(); await sleep(5000);
  const still = await dlg().isVisible().catch(() => false);
  const msg = still ? (await dlg().innerText()).replace(/\n+/g, " | ").slice(0, 300) : "";
  await go(p, "/front-office/enquiries?view=calls"); await sleep(2000);
  const t = await mainText(p, 15000);
  const n = (t.match(new RegExp(`QA-B Caller ${S}`, "g")) ?? []).length;
  rec("A1: Log a call with the default follow-up saves", !still && n === 1, `${n} rows; default ${when.filter((x) => /time|date/i.test(x)).map((x) => x.split("=")[1]).join(" ")} ${msg}`);
  await snap(p, "re-A1-calls");
  await p.context().close();
});

await run("event", async () => {
  const p = await asB("principal", DESK);
  const dlg = () => p.getByRole("dialog").last();
  const dt = async () => (await dlg().innerText().catch(() => "(closed)")).replace(/\n+/g, " | ");
  await go(p, "/events-calendar/events?do=create"); await sleep(2500);
  const name = `QA-B Recheck Fair ${S}`;
  await dlg().getByLabel(/^Name/).fill(name);
  await dlg().getByLabel(/^Date/).fill("04-12-2026");
  await dlg().getByLabel(/^From/).fill("11:00");
  await dlg().getByLabel(/^To( |$)/).fill("10:00");
  await dlg().getByRole("button", { name: /Create event|Save/ }).last().click(); await sleep(3000);
  const err = (await dt()).match(/The end time[^|]*/)?.[0];
  rec("A4: end before start is refused", !!err, err);
  const to = dlg().getByLabel(/^To( |$)/);
  await to.click(); await p.keyboard.press("Control+A"); await p.keyboard.type("1:00 PM", { delay: 40 }); await p.keyboard.press("Tab"); await sleep(600);
  const shown = await to.inputValue();
  await dlg().getByRole("button", { name: /Create event|Save/ }).last().click(); await sleep(6000);
  const after = await dt();
  await snap(p, "re-A4-event-after");
  await go(p, "/events-calendar/events"); await sleep(2500);
  const t = await mainText(p, 30000);
  const line = t.split("\n").map((l, i, a) => (l.includes(name) ? `${l} ${a[i + 1] ?? ""} ${a[i + 2] ?? ""}` : null)).filter(Boolean)[0] ?? "(not in list)";
  rec("A4: fixed end time is kept and the event saves with it", /1:00 PM|13:00/.test(line) || (/1:00 PM|13:00/.test(shown) && !after.includes("The end time") && after === "(closed)"), `To box "${shown}"; list: ${line.slice(0, 160)}; sheet: ${after.slice(0, 120)}`);
  await p.context().close();
});

await run("salary", async () => {
  const p = await asB("principal", DESK);
  await go(p, "/salary-management/generate"); await sleep(3000);
  const t = await mainText(p, 20000);
  const card = (t.match(/Salary structures[^\n]*\n?[^\n]*/) ?? [""])[0].replace(/\n/g, " ");
  const flag = (t.match(/[^\n]*(no salary structure)[^\n]*/gi) ?? []).join(" / ");
  const missing = Number((card.match(/(\d+) missing/) ?? [])[1] ?? NaN);
  const flagN = Number((flag.match(/(\d+) staff (has|have) no salary structure/) ?? [])[1] ?? NaN);
  rec("A13: pre-send check counts every staff member without a structure", Number.isFinite(missing) && flagN === missing, `card: ${card.slice(0, 160)} | flag: ${flag.slice(0, 300)}`);
  await snap(p, "re-A13-salary", true);
  await p.context().close();
});

await run("adjust", async () => {
  const p = await asB("accountant", DESK);
  const sid = "9576a2b3-40d6-4a3f-8939-4c9a127215fd"; // Sahithi Yadav (paid 5,000 earlier today)
  await go(p, `/fee-management/ledger/${sid}?do=adjust`); await sleep(2500);
  const dlg = p.getByRole("dialog").last();
  console.log("ADJUST", (await dlg.innerText()).replace(/\n+/g, " | ").slice(0, 600));
  console.log("FIELDS", (await fields(dlg)).join(" ; "));
  const row = dlg.locator("select").first();
  const opts = await row.locator("option").evaluateAll((os) => os.map((o) => `${o.value}=${o.text}`));
  console.log("ROWS", opts.join(" ; "));
  const pick = opts.find((o) => /Annual charges/.test(o)) ?? opts.find((o) => /Tuition fee · Quarter 4/.test(o));
  if (pick) await row.selectOption(pick.split("=")[0]);
  await sleep(500);
  const rm = dlg.getByLabel(/Remove/i).first();
  if (await rm.isVisible().catch(() => false)) await rm.check().catch(() => rm.click());
  else await dlg.getByRole("radio", { name: /Remove/i }).first().check().catch(() => {});
  await sleep(500);
  const reason = dlg.getByLabel(/Reason/).first();
  if (await reason.isVisible().catch(() => false)) await reason.fill("QA-B recheck: remove the annual charges row (do not approve)");
  console.log("FIELDS2", (await fields(dlg)).join(" ; "));
  await snap(p, "re-adjust-filled");
  await dlg.getByRole("button", { name: /Save|Send|Remove|Adjust/ }).last().click(); await sleep(5000);
  const after = (await flat(p, 3000)) + " || " + (await p.getByRole("dialog").last().innerText().catch(() => "")).replace(/\n+/g, " | ");
  rec("Adjust remove above the limit says Sent for approval", /Sent for approval|sent for approval/i.test(after), after.match(/[^|]*approval[^|]*/i)?.[0] ?? after.slice(0, 200));
  await go(p, `/fee-management/ledger/${sid}?tab=fees`); await sleep(2500);
  const t = await mainText(p, 8000);
  rec("Adjust remove: the row shows Waiting for approval", /Waiting for approval/.test(t), (t.match(/[^\n]*\n?[^\n]*Waiting for approval/) ?? ["(none)"])[0].replace(/\n/g, " "));
  await snap(p, "re-adjust-ledger", true);
  await p.context().close();
});

await run("smoke", async () => {
  for (const login of ["principal", "accountant"]) {
    const p = await asB(login, DESK);
    const links = (await menu(p)).filter((l) => l.href.startsWith("/") && !l.href.startsWith("/sign"));
    const seen = new Set(); let okN = 0; const bad = [];
    for (const l of links) {
      if (seen.has(l.href)) continue; seen.add(l.href);
      await go(p, l.href); await sleep(600);
      const s = await pageState(p);
      if (s.broken || p.problems.some((x) => /HTTP 5/.test(x))) bad.push(`${l.href}${s.broken ? " (error screen)" : ""}`); else okN++;
      p.problems.length = 0;
    }
    rec(`smoke ${login}: every menu page opens`, bad.length === 0, `${okN} of ${seen.size} open; broken: ${bad.join(", ") || "none"}`);
    await p.context().close();
  }
});
await close();
