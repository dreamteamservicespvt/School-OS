// School day, afternoon/evening: Principal sends a notice to staff, reads the Dashboard, and
// the numbers are compared with Attendance, Fee Dashboard, Fee Reports, Front Office and the
// Finance Day Book. The Day Book is read and printed at the end of the day (not closed: other QA
// work still posts to today).
//   node qa/simulations/day-3-evening.mjs
import { as, visit, text, shot, record, done, close, sql, SCHOOL_A, feedback } from "./sim-lib.mjs";

const A = "sim-day";
const NOTICE = "Demo QA simulation: staff meeting today at 4:15 PM in the staff room";
const rs = (s) => Number(String(s ?? "").replace(/[₹,\s]/g, ""));

// ---------- Notice to staff ----------
const pr = await as("cems.principal");
if (sql(`select count(*) from notice where school_id='${SCHOOL_A}' and title='${NOTICE}'`)[0][0] === "0") {
  await visit(pr, "/communication/notices/new");
  await pr.locator("input[name=title]").fill(NOTICE);
  await pr.locator("textarea[name=body]").fill("Demo notice for QA. All teaching staff please meet in the staff room at 4:15 PM to plan next week's PTM.");
  await pr.locator("input[name=staff]").check();
  await pr.locator("form").getByRole("button", { name: /^(Publish|Send for approval)$/ }).click();
  await pr.waitForURL(/notices\/[0-9a-f-]{36}/, { timeout: 20000 }).catch(() => {});
  const fb = await feedback(pr, 1500);
  await shot(pr, "day-11-notice-staff");
  const n = sql(`select status from notice where school_id='${SCHOOL_A}' and title='${NOTICE}'`);
  record({ area: A, role: "Principal", check: "Principal publishes a notice to all staff", status: /PUBLISHED/i.test(n?.[0]?.[0] ?? "") || /Published/.test(fb) ? "PASS" : "FAIL", note: `${fb.slice(0, 200)}; saved status ${n?.[0]?.[0]}` });
} else record({ area: A, role: "Principal", check: "Principal publishes a notice to all staff", status: "PASS", note: "already published earlier in this run" });
{
  const te = await as("cems.teacher");
  await visit(te, "/communication/notices");
  const t = await text(te, 5000);
  record({ area: A, role: "Teacher", check: "A teacher sees the staff notice on Notices", status: t.includes("staff meeting today at 4:15") ? "PASS" : "FAIL", note: (t.match(/.{0,60}staff meeting today.{0,60}/s)?.[0] ?? t.slice(0, 200)).replace(/\s+/g, " ") });
  await done(te);
}

// ---------- Principal reads the Dashboard ----------
await visit(pr, "/dashboard");
const d = await text(pr, 6000);
await shot(pr, "day-12-principal-dashboard");
const dPresent = d.match(/Students present\n(\d+) \/ (\d+)\n([\d.]+)% of marked · (\d+) absent · (\d+) classes not marked/);
const dFeesToday = d.match(/Fees collected today\n(₹[\d.,]+ ?(?:k|L|Cr)?)\n(\d+) payments/);
const dFeeYear = d.match(/Fee collection\n(₹[\d.]+ ?[LkCr]*) of (₹[\d.]+ ?[LkCr]*) due so far/);

// Attendance truth: active students' marks today.
const marks = Object.fromEntries(sql(`select m.status_key, count(*) from attendance_mark m join student s on s.id=m.student_id where m.school_id='${SCHOOL_A}' and m.date=current_date and m.archived_at is null and m.period_no=0 and s.status='ACTIVE' group by 1`).map(([k, n]) => [k, Number(n)]));
const marksAll = Object.fromEntries(sql(`select m.status_key, count(*) from attendance_mark m where m.school_id='${SCHOOL_A}' and m.date=current_date and m.archived_at is null and m.period_no=0 and m.student_id is not null group by 1`).map(([k, n]) => [k, Number(n)]));
const activeMarked = Object.values(marks).reduce((a, b) => a + b, 0);
const presentLike = (marks.present ?? 0) + (marks.late ?? 0);
const pct = activeMarked ? ((presentLike / activeMarked) * 100).toFixed(1) : "0";
const ct = await as("cems.principal");
await visit(ct, "/attendance-management/register");
const reg = await text(ct, 1500);
await done(ct);
if (dPresent) {
  const [_, p, tot, pc, ab] = dPresent;
  const ok = Number(p) === presentLike && Number(ab) === (marks.absent ?? 0) && pc === pct;
  record({ area: A, role: "Principal", check: "Dashboard 'Students present' agrees with today's Grade 5 A register (after corrections)", status: ok ? "PASS" : "FAIL", note: `Dashboard: ${p}/${tot}, ${pc}% of marked, ${ab} absent. Register of active students: present ${marks.present ?? 0} + late ${marks.late ?? 0} = ${presentLike}, absent ${marks.absent ?? 0}, leave ${marks.leave ?? 0} → ${pct}% of ${activeMarked} marked. All saved marks incl. non-active students: ${JSON.stringify(marksAll)}. Register header: ${reg.split("\n")[1] ?? ""}` });
} else record({ area: A, role: "Principal", check: "Dashboard shows Students present", status: "FAIL", note: d.slice(0, 300) });

// Fee truth.
const [todayCnt, todayAmt] = sql(`select count(*), coalesce(sum(amount_paise),0) from payment where school_id='${SCHOOL_A}' and status='POSTED' and payment_date=current_date`)[0].map(Number);
const [yearCnt, yearAmt] = sql(`select count(*), coalesce(sum(amount_paise),0) from payment where school_id='${SCHOOL_A}' and status='POSTED' and payment_date>='2026-04-01'`)[0].map(Number);
const acc = await as("cems.accountant");
await visit(acc, "/fee-management/dashboard");
const fd = await text(acc, 3000);
await shot(acc, "day-13-fee-dashboard-accountant");
const fToday = fd.match(/Collected today\n(₹[\d,]+)\n(\d+) payments/);
const fYear = fd.match(/Collected this year\n(₹[\d.]+ ?[LkCr]*)\nof (₹[\d.]+ ?[LkCr]*) due so far/);
await visit(pr, "/fee-management/dashboard");
const fdp = await text(pr, 3000);
const pToday = fdp.match(/Collected today\n(₹[\d,]+)\n(\d+) payments/);
const pYear = fdp.match(/Collected this year\n(₹[\d.]+ ?[LkCr]*)\nof (₹[\d.]+ ?[LkCr]*) due so far/);
record({ area: A, role: "Accountant + Principal", check: "Fees collected today: Fee Dashboard (accountant) = Fee Dashboard (principal) = Dashboard = posted payments", status: fToday && pToday && rs(fToday[1]) === todayAmt / 100 && rs(pToday[1]) === todayAmt / 100 && Number(fToday[2]) === todayCnt ? "PASS" : "FAIL", note: `Fee Dashboard accountant ${fToday?.[1]} (${fToday?.[2]} payments), principal ${pToday?.[1]} (${pToday?.[2]}); Dashboard ${dFeesToday?.[1]} (${dFeesToday?.[2]} payments); posted today ₹${(todayAmt / 100).toLocaleString("en-IN")} in ${todayCnt}` });
const dashK = dFeesToday ? dFeesToday[1] : "";
const unit = /Cr$/.test(dashK) ? 1e7 : /L$/.test(dashK) ? 1e5 : /k$/.test(dashK) ? 1e3 : 1;
const shown = Number(dashK.replace(/[₹,\sLkCr]/g, "")) * unit;
const kOk = Math.abs(shown - todayAmt / 100) <= unit / 2;
record({ area: A, role: "Principal", check: "Dashboard 'Fees collected today' rounds the same amount as the Fee Dashboard", status: kOk && Number(dFeesToday?.[2]) === todayCnt ? "PASS" : "FAIL", note: `Dashboard ${dashK} / ${dFeesToday?.[2]} payments vs ₹${(todayAmt / 100).toLocaleString("en-IN")} / ${todayCnt}` });
record({ area: A, role: "Accountant + Principal", check: "Collected this year: Dashboard 'Fee collection' = Fee Dashboard 'Collected this year' (same as both roles)", status: dFeeYear && fYear && dFeeYear[1] === fYear[1] && dFeeYear[2] === fYear[2] && pYear?.[1] === fYear[1] ? "PASS" : "FAIL", note: `Dashboard: ${dFeeYear?.[1]} of ${dFeeYear?.[2]} due; Fee Dashboard accountant: ${fYear?.[1]} of ${fYear?.[2]} due; principal: ${pYear?.[1]} of ${pYear?.[2]}; posted payments this year ₹${(yearAmt / 100).toLocaleString("en-IN")} in ${yearCnt}` });

// Fee Reports collection report, Daily.
await visit(acc, "/fee-management/reports?view=daily");
let cr = await text(acc, 4000);
if (!/16-10-2026|16 Oct/.test(cr)) {
  await acc.getByRole("radio", { name: "Daily" }).or(acc.getByRole("tab", { name: "Daily" })).or(acc.getByRole("link", { name: "Daily" })).first().click().catch(() => {});
  await acc.waitForTimeout(2000);
  cr = await text(acc, 4000);
}
const crLine = cr.split("\n").find((l) => /16-10-2026|16 Oct/.test(l) && /₹/.test(l)) ?? "";
const crTotal = cr.match(/October 2026\t(\d+)\t[^\n]*\t(₹[\d,]+)\n/);
const crAmt = crLine ? rs(crLine.split("\t").pop()) : crTotal ? rs(crTotal[2]) : NaN;
await shot(acc, "day-14-collection-report");
record({ area: A, role: "Accountant", check: "Fee Reports collection report for today = Fee Dashboard 'Collected today'", status: crAmt === todayAmt / 100 ? "PASS" : "FAIL", note: `report line: "${(crLine || crTotal?.[0] || cr.slice(0, 300)).replace(/\t/g, " | ").trim()}" vs collected today ₹${(todayAmt / 100).toLocaleString("en-IN")}` });

// Day Book end of day.
await visit(acc, "/finance-management/day-book");
const db = await text(acc, 8000);
await shot(acc, "day-15-day-book", true);
const inc = db.match(/Total income\n(−?₹[\d,]+)\n(\d+) transactions · ([^\n]+)/);
const feeFull = rs(inc?.[3].match(/Fees (₹[\d,]+)/)?.[1]);
const feePart = rs(inc?.[3].match(/Partial (₹[\d,]+)/)?.[1]);
const reversed = rs(inc?.[3].match(/less (₹[\d,]+) reversed/)?.[1] ?? 0);
const dayRev = sql(`select coalesce(sum(d.amount_paise) filter (where p.payment_date=current_date),0), coalesce(sum(d.amount_paise) filter (where p.payment_date<>current_date),0) from day_book_entry d join payment p on p.id::text=d.source_id where d.school_id='${SCHOOL_A}' and d.section='reversal' and d.date=current_date`)[0].map((x) => Number(x) / 100);
const feeNet = feeFull + feePart - reversed;
const explained = feeNet + dayRev[1] === todayAmt / 100;
record({ area: A, role: "Accountant", check: "Day Book fee income for today reconciles with Fee Dashboard 'Collected today'", status: explained ? "PASS" : "FAIL", note: `Day Book: ${inc?.[0].replace(/\n/g, " ")}. Fees ₹${feeFull} + Partial ₹${feePart} − reversed ₹${reversed} = ₹${feeNet}; Fee Dashboard ₹${todayAmt / 100}. Reversals today of payments dated today ₹${dayRev[0]}, of earlier payments ₹${dayRev[1]} (a June payment cancelled today shows as a reversal in today's Day Book but does not lower 'Collected today').` });
record({ area: A, role: "Accountant", check: "Day Book lists the ₹2,500 cash part payment from Lasya Boddu", status: /Lasya Boddu[^\n]*\n?[^\n]*2,500/.test(db) || (db.includes("Lasya Boddu") && db.includes("₹2,500")) ? "PASS" : "FAIL", note: (db.match(/.{0,40}Lasya Boddu.{0,120}/s)?.[0] ?? "not listed").replace(/\s+/g, " ") });
const printBtn = acc.getByRole("button", { name: "Print" }).or(acc.getByRole("link", { name: "Print" }));
record({ area: A, role: "Accountant", check: "End of day: Day Book can be printed; 'Close today' is offered (not pressed: other QA still posts to today)", status: (await printBtn.count()) && /Close today/.test(db) ? "PASS" : "FAIL", note: `Print controls ${await printBtn.count()}; Close today offered ${/Close today/.test(db)}` });
await done(acc);

// Visitors: Principal sees today's visitor count.
await visit(pr, "/front-office");
const fo = await text(pr, 2000);
const vis = Number(fo.match(/Visitors today\n(\d+)/)?.[1]);
const dbv = Number(sql(`select count(*) from visitor_entry where school_id='${SCHOOL_A}' and visit_date=current_date and archived_at is null`)[0][0]);
record({ area: A, role: "Principal", check: "Visitors today on Front Office (as Principal) = visitors checked in today", status: vis === dbv ? "PASS" : "FAIL", note: `screen ${vis}, records ${dbv}. The Principal's Dashboard itself has no visitors tile (${/Visitors/.test(d) ? "it mentions visitors" : "no 'Visitors' word on Dashboard"}).` });
await shot(pr, "day-16-front-office-principal");
await done(pr);
await close();
