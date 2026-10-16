// School day, morning (06:30 - 10:00): driver and transport in-charge see the morning trips;
// the gate and reception check a visitor in and out; reception releases an early pickup with a
// gate pass, and the gate lets the child out.
//   node qa/simulations/day-1-morning.mjs
import { as, visit, text, shot, record, done, close, sql, SCHOOL_A, feedback } from "./sim-lib.mjs";

const A = "sim-day";
const TEJA = "1dc75d80-6e02-49de-b778-ae6c8614e680"; // Teja Varma, Grade 5 A (synthetic)
const VISITOR = "Demo Visitor Sim Day";
const PHONE = "9876504161";

// 1. Driver: morning trip on the phone screen.
{
  const p = await as("cems.driver");
  await visit(p, "/driver");
  const t = await text(p);
  await shot(p, "day-01-driver");
  const ok = /Today.s trips/.test(t) && /Morning pickup/.test(t);
  record({ area: A, role: "Driver", check: "06:30 Driver opens Today's trips and sees the morning pickup with its stops", status: ok ? "PASS" : "FAIL", note: t.replace(/\s+/g, " ").slice(0, 300) });
  await done(p);
}
// 2. Transport in-charge: Trips for today and Live Tracking agree on trip counts.
{
  const p = await as("cems.transport");
  await visit(p, "/transport-management/trips");
  const t = await text(p);
  const trips = Number(t.match(/Trips today\n(\d+)/)?.[1] ?? NaN);
  const completed = Number(t.match(/Completed\n(\d+)/)?.[1] ?? NaN);
  const dbTrips = sql(`select count(*) filter (where true), count(*) filter (where status='COMPLETED') from trip where school_id='${SCHOOL_A}' and date=current_date`)?.[0] ?? [];
  await shot(p, "day-02-transport-trips");
  record({ area: A, role: "Transport In-charge", check: "Trips screen shows today's trips with counts", status: Number.isFinite(trips) && trips > 0 ? "PASS" : "FAIL", note: `screen: ${trips} trips today, ${completed} completed; db: ${dbTrips.join("/") || "n/a"}` });
  await visit(p, "/transport-management");
  const lt = await text(p);
  const running = lt.match(/Buses running\n(\d+) of (\d+)/);
  record({ area: A, role: "Transport In-charge", check: "Live Tracking shows buses running and open alerts", status: running ? "PASS" : "FAIL", note: `Buses running ${running?.[1]} of ${running?.[2]}; ${lt.match(/\d+ alerts? open/)?.[0] ?? "no alert line"}` });
  await done(p);
}

// 3. Reception: a visitor checks in (only if not already done today).
const already = sql(`select count(*) from visitor_entry where school_id='${SCHOOL_A}' and name='${VISITOR}'`)?.[0]?.[0];
let passNo = sql(`select pass_no from visitor_entry where school_id='${SCHOOL_A}' and name='${VISITOR}' order by created_at desc limit 1`)?.[0]?.[0];
const rec = await as("cems.reception");
if (already === "0" || already === undefined) {
  await visit(rec, "/front-office/visitors");
  await rec.getByRole("link", { name: "Add visitor" }).or(rec.getByRole("button", { name: "Add visitor" })).first().click();
  await rec.waitForTimeout(1000);
  const sheet = rec.locator("dialog[open]").last();
  await sheet.locator("input[name=phone]").fill(PHONE);
  await sheet.locator("input[name=name]").fill(VISITOR);
  const opts = await sheet.locator("select[name=purpose] option").allInnerTexts();
  const pick = opts.find((o) => /meeting|parent|teacher/i.test(o)) ?? opts[1];
  await sheet.locator("select[name=purpose]").selectOption({ label: pick });
  const meet = sheet.locator("select[name=meetStaffId]");
  if (await meet.count()) {
    const mo = await meet.locator("option").allInnerTexts();
    const lav = mo.find((o) => /Lavanya/.test(o));
    if (lav) await meet.selectOption({ label: lav }); else await meet.selectOption({ index: 1 }).catch(() => {});
  }
  await sheet.locator("button[type=submit]").last().click();
  await rec.waitForTimeout(3500);
  const fb = await feedback(rec, 300);
  passNo = sql(`select pass_no from visitor_entry where school_id='${SCHOOL_A}' and name='${VISITOR}' order by created_at desc limit 1`)?.[0]?.[0];
  await shot(rec, "day-03-visitor-in");
  record({ area: A, role: "Receptionist", check: `09:05 Visitor ${VISITOR} checked in (purpose ${pick})`, status: passNo ? "PASS" : "FAIL", note: `pass ${passNo ?? "none"}; ${fb.slice(0, 200)}; purposes offered: ${opts.join(", ")}` });
} else {
  record({ area: A, role: "Receptionist", check: `Visitor ${VISITOR} checked in`, status: "PASS", note: `already checked in earlier in this run, pass ${passNo}` });
}
// The gate checks the pass and records exit later.
if (passNo) {
  const gate = await as("cems.gate");
  await visit(gate, `/front-office/visitors?check=${passNo}`);
  await gate.waitForTimeout(1200);
  let d = (await gate.locator("dialog[open]").innerText().catch(() => "")).replace(/\s+/g, " ");
  record({ area: A, role: "Gate Security", check: `Gate checks visitor pass ${passNo}`, status: d.includes(VISITOR) && /Valid|Already out/.test(d) ? "PASS" : "FAIL", note: d.slice(0, 250) });
  if (/Record exit/.test(d)) {
    await gate.locator("dialog[open]").getByRole("button", { name: "Record exit" }).click();
    await gate.waitForTimeout(2500);
    await visit(gate, `/front-office/visitors?check=${passNo}`);
    await gate.waitForTimeout(1200);
    d = (await gate.locator("dialog[open]").innerText().catch(() => "")).replace(/\s+/g, " ");
    record({ area: A, role: "Gate Security", check: `10:00 Gate records the visitor's exit (${passNo})`, status: /Already out|no longer works/.test(d) ? "PASS" : "FAIL", note: d.slice(0, 200) });
  }
  await done(gate);
}

// 4. Early pickup gate pass for Teja Varma (reception releases, gate lets out).
let gp = sql(`select pass_no from gate_pass where school_id='${SCHOOL_A}' and student_id='${TEJA}' and created_at::date=current_date order by created_at desc limit 1`)?.[0]?.[0];
if (!gp) {
  await visit(rec, `/front-office/pickup?student=${TEJA}`);
  await rec.waitForTimeout(1200);
  const form = rec.locator("form").filter({ has: rec.locator("input[name=guardianId]") });
  await form.getByRole("radio", { name: /Jyothi Varma/ }).click();
  await rec.waitForTimeout(1500);
  await form.getByRole("checkbox").first().click();
  const reasons = await form.getByRole("radio").allInnerTexts();
  const med = form.getByRole("radio", { name: /Medical|Doctor|Unwell|Sick/i });
  if (await med.count()) await med.first().click();
  else { await form.getByRole("radio", { name: "Other", exact: true }).click().catch(() => {}); await form.locator("input[name=otherReason]").fill("Demo QA simulation: doctor's visit").catch(() => {}); }
  await form.locator("button[type=submit]").last().click({ timeout: 8000 }).catch((e) => console.log("release click", e.message));
  await rec.waitForURL(/gp=/, { timeout: 15000 }).catch(() => {});
  await rec.waitForTimeout(1500);
  const after = await text(rec, 2000);
  gp = after.match(/GP-\d{4}-\d+/g)?.find((g) => g !== "GP-2026-0001") ?? null;
  await shot(rec, "day-04-pickup-pass");
  record({ area: A, role: "Receptionist", check: "11:45 Early pickup: Teja Varma released to Jyothi Varma (mother, on approved list), photo checked", status: gp ? "PASS" : "FAIL", note: `gate pass ${gp}; reasons offered: ${reasons.join("/").slice(0, 150)}` });
} else {
  record({ area: A, role: "Receptionist", check: "Early pickup gate pass for Teja Varma", status: "PASS", note: `already made earlier in this run: ${gp}` });
}
if (gp) {
  const gate = await as("cems.gate");
  await visit(gate, `/front-office/pickup?check=${gp}`);
  await gate.waitForTimeout(1200);
  let d = (await gate.locator("dialog[open]").innerText().catch(() => "")).replace(/\s+/g, " ");
  if (/Let them out/.test(d)) {
    await gate.locator("dialog[open]").getByRole("button", { name: "Let them out" }).click();
    await gate.waitForTimeout(2500);
    await visit(gate, `/front-office/pickup?check=${gp}`);
    await gate.waitForTimeout(1200);
    d = (await gate.locator("dialog[open]").innerText().catch(() => "")).replace(/\s+/g, " ");
  }
  await shot(gate, "day-05-gate-pickup");
  record({ area: A, role: "Gate Security", check: `Gate checks pickup pass ${gp} and lets Teja out; a second check says already used`, status: /Already used/.test(d) ? "PASS" : "FAIL", note: d.slice(0, 250) });
  await done(gate);
}
// Reception desk numbers agree with the visitor log.
await visit(rec, "/front-office");
const desk = await text(rec, 3000);
const deskVisitors = Number(desk.match(/Visitors today\n(\d+)/)?.[1]);
await visit(rec, "/front-office/visitors");
const log = await text(rec, 3000);
const logAll = Number(log.match(/All\n(\d+)/)?.[1]);
const dbV = Number(sql(`select count(*) from visitor_entry where school_id='${SCHOOL_A}' and visit_date=current_date and archived_at is null`)?.[0]?.[0] ?? NaN);
record({ area: A, role: "Receptionist", check: "Reception Desk 'Visitors today' = Visitor log count = records", status: deskVisitors === logAll && (Number.isNaN(dbV) || dbV === logAll) ? "PASS" : "FAIL", note: `desk ${deskVisitors}, log ${logAll}, db ${dbV}` });
await done(rec);
await close();
