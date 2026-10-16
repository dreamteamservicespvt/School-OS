// Regression re-test of the campus fixes (Transport CAMPUS-01, 02, 04 to 08; Library CAMPUS-11;
// Library and Hostel reports on a phone), through the screens.
//   QA_OUT=qa-output/regression node qa/regression/campus.mjs [ID ...]
import { as, open, settle, mainText, shot, close, squeeze, rec, check, layoutIssues, BASE, VIEWPORTS } from "./_lib.mjs";

const only = process.argv.slice(2);
const want = (id) => !only.length || only.includes(id);
const A = "campus";
const tag = String(Date.now()).slice(-5);
const V = "/transport-management/vehicles", R = "/transport-management/routes";
const said = async (p) => p.evaluate(() => { const b = []; document.querySelectorAll("[role=alert], [role=status], [aria-live], [id$='-error'], [data-error]").forEach((e) => { const t = e.innerText?.trim(); if (t) b.push(t); }); return [...new Set(b)].join(" | ").replace(/\s+/g, " ").slice(0, 600); });
const D = (p, k) => p.locator(`dialog[open] [name=${k}]`);
async function sheetAt(p, url) { await open(p, url); await p.waitForSelector("dialog[open]", { timeout: 15000 }); await p.waitForTimeout(300); }
async function clickB(p, name) { const root = p.locator("dialog[open]").last(); await root.getByRole("button", { name, exact: true }).or(root.getByRole("radio", { name, exact: true })).first().click(); await p.waitForTimeout(300); }
async function submit(p, name, wait = 3000) { await p.locator("dialog[open]").last().getByRole("button", { name }).last().click(); await p.waitForTimeout(wait); return said(p); }
const phone = (n) => `90000${String(70000 + (Number(tag) % 2000) * 10 + n).slice(-5)}`;

async function addDriver(p, { name, ph, lic, exp, emp = "Hired" }) {
  await sheetAt(p, `${V}?view=people&do=driver`);
  await clickB(p, "Driver");
  await D(p, "name").fill(name); await D(p, "phone").fill(ph);
  await clickB(p, emp);
  if (await D(p, "licenceNo").count()) { await D(p, "licenceNo").fill(lic); await D(p, "licenceExpiry").fill(exp); }
  return submit(p, /^Add driver$/);
}
async function selectByText(p, k, text) { const o = await D(p, k).evaluate((e) => [...e.options].map((x) => ({ v: x.value, t: x.text }))); const m = o.find((x) => x.t.includes(text)); if (!m) throw new Error(`no "${text}" in ${k}: ${o.map((x) => x.t).join(", ")}`); await D(p, k).selectOption(m.v); }

const expiredDriver = `Demo QA Expired Driver ${tag}`;

// CAMPUS-02: a driver whose licence has already ended is not added silently.
if (want("CAMPUS-02") || want("CAMPUS-04")) await check({ id: "CAMPUS-02", area: A, role: "cems.transport", check: "Add driver (hired) with licence expiry 01-01-2025: refused or warned that the licence has ended" }, async (set) => {
  const p = set(await as("cems.transport"));
  const s = await addDriver(p, { name: expiredDriver, ph: phone(1), lic: `AP39QA${tag}1`, exp: "2025-01-01" });
  const sh = await shot(p, "CAMPUS-02-expired-licence", false);
  const warned = /expired|ended|past/i.test(s);
  return { status: warned ? "PASS" : "FAIL", note: `screen: "${s.slice(0, 260)}"`, shot: sh };
});

// CAMPUS-01: the driver app invite is not called sent when no channel exists.
if (want("CAMPUS-01")) await check({ id: "CAMPUS-01", area: A, role: "cems.transport", check: "Add driver with 'Send the driver app invite' on (no SMS/WhatsApp): not claimed as sent" }, async (set) => {
  const p = set(await as("cems.transport"));
  const s = await addDriver(p, { name: `Demo QA Invite Driver ${tag}`, ph: phone(2), lic: `AP39QA${tag}2`, exp: "2029-06-30" });
  const sh = await shot(p, "CAMPUS-01-invite", false);
  const claims = /invite sent/i.test(s) && !/not sent/i.test(s);
  return { status: /added as driver/i.test(s) && !claims ? "PASS" : "FAIL", note: `screen: "${s.slice(0, 260)}"`, shot: sh };
});

async function addRoute(p, { name, vehicle, driver, arrive = "", leave = "" }) {
  await sheetAt(p, `${R}?do=route`);
  await D(p, "name").fill(name);
  if (vehicle) await selectByText(p, "vehicleId", vehicle);
  if (driver) await selectByText(p, "driverId", driver);
  await D(p, "schoolArrival").fill(arrive); await D(p, "eveningDepart").fill(leave);
  const s = await submit(p, "Add route", 3500);
  return { s, url: p.url() };
}

// CAMPUS-04: a driver whose licence has ended cannot be put on a new route.
if (want("CAMPUS-04")) await check({ id: "CAMPUS-04", area: A, role: "cems.transport", check: `New route 'Demo QA Route ${tag}' with the expired-licence driver: refused` }, async (set) => {
  const p = set(await as("cems.transport"));
  await sheetAt(p, `${R}?do=route`);
  const opts = await D(p, "driverId").evaluate((e) => [...e.options].map((x) => x.text));
  const listed = opts.find((t) => t.includes(expiredDriver));
  if (!listed) return { status: "PASS", note: `the expired-licence driver is not offered in the route's Driver list (options: ${opts.slice(0, 6).join(", ")})` };
  const r = await addRoute(p, { name: `Demo QA Route ${tag}`, driver: expiredDriver, arrive: "08:50", leave: "16:05" });
  const sh = await shot(p, "CAMPUS-04-route", false);
  const added = /routes\/[0-9a-f-]{36}/.test(r.url) && !/do=route/.test(r.url);
  return { status: !added && /expired|ended|licence/i.test(r.s) ? "PASS" : "FAIL", note: `driver option "${listed}"; screen: "${r.s.slice(0, 240)}"; ${added ? "ROUTE ADDED " + r.url.replace(BASE, "") : "not added"}`, shot: sh };
});

// CAMPUS-05: the evening trip must leave after the morning trip reaches school.
if (want("CAMPUS-05")) await check({ id: "CAMPUS-05", area: A, role: "cems.transport", check: "Add route reaching school 08:45 and leaving 08:00: refused" }, async (set) => {
  const p = set(await as("cems.transport"));
  const r = await addRoute(p, { name: `Demo QA Backwards ${tag}`, arrive: "08:45", leave: "08:00" });
  const sh = await shot(p, "CAMPUS-05-route-times", false);
  const added = /added/i.test(r.s);
  return { status: !added && /after|before|leave|arriv/i.test(r.s) ? "PASS" : "FAIL", note: `screen: "${r.s.slice(0, 240)}"`, shot: sh };
});

async function routeId(p, name) {
  await open(p, R);
  const h = await p.locator("main a[href*='/transport-management/routes/']").filter({ hasText: name }).first().getAttribute("href");
  return h.match(/routes\/([0-9a-f-]{36})/)[1];
}

// CAMPUS-06: a stop's pickup must be before the bus reaches school.
if (want("CAMPUS-06")) await check({ id: "CAMPUS-06", area: A, role: "cems.transport", check: "Demo Route North (reaches school 08:45): add stop with pickup 09:30: refused" }, async (set) => {
  const p = set(await as("cems.transport"));
  const id = await routeId(p, "Demo Route North");
  await sheetAt(p, `${R}/${id}?do=stop`);
  await D(p, "name").fill(`Demo QA Late Stop ${tag}`); await D(p, "pickup").fill("09:30");
  if (await D(p, "drop").count()) await D(p, "drop").fill("16:45");
  if (await D(p, "feeTwoWay").count()) await D(p, "feeTwoWay").fill("300");
  const s = await submit(p, /^Add stop/);
  const sh = await shot(p, "CAMPUS-06-late-stop", false);
  return { status: !/added as stop/i.test(s) && /before|reach|arriv|after/i.test(s) ? "PASS" : "FAIL", note: `screen: "${s.slice(0, 240)}"`, shot: sh };
});

// CAMPUS-08: a fee with paise keeps its paise (₹600.50) on the route page and on Routes.
if (want("CAMPUS-08")) await check({ id: "CAMPUS-08", area: A, role: "cems.transport", check: "Demo Route North's stop Demo Village Beta (₹600.50) shows ₹600.50, not ₹601" }, async (set) => {
  const p = set(await as("cems.transport"));
  const id = await routeId(p, "Demo Route North");
  const list = squeeze(await mainText(p, 8000));
  await open(p, `${R}/${id}`);
  const t = squeeze(await mainText(p, 8000));
  const sh = await shot(p, "CAMPUS-08-route", false);
  const beta = t.match(/Demo Village Beta.{0,120}/)?.[0] ?? "";
  const range = list.match(/Demo Route North.{0,200}/)?.[0]?.match(/₹[\d,.]+\s?–\s?₹[\d,.]+|₹[\d,.]+/)?.[0] ?? "";
  if (!beta) return { status: "BLOCKED", note: `no 'Demo Village Beta' stop on Demo Route North: ${t.slice(0, 200)}`, shot: sh };
  return { status: /600\.50/.test(beta) && !/₹601\b/.test(beta) ? "PASS" : "FAIL", note: `route page: "${beta.slice(0, 100)}"; Routes list fee: "${range}"`, shot: sh };
});

// CAMPUS-07: "1 parent", not "1 parents", on a route message.
if (want("CAMPUS-07")) await check({ id: "CAMPUS-07", area: A, role: "cems.transport", check: "Route message sheet for a route with one parent says '1 parent' (not sent)" }, async (set) => {
  const p = set(await as("cems.transport"));
  await open(p, R);
  const hrefs = await p.locator("main a[href*='/transport-management/routes/']").evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
  const seen = [];
  for (const h of hrefs.slice(0, 8)) {
    await sheetAt(p, `${h.split("?")[0]}?do=message`).catch(() => {});
    const t = squeeze(await p.locator("dialog[open]").last().innerText().catch(() => ""));
    const m = t.match(/\b(\d+) parents?\b/);
    seen.push(`${h.split("/").pop().slice(0, 8)}: ${m?.[0] ?? "no count"}`);
    if (m && m[1] === "1") {
      const sh = await shot(p, "CAMPUS-07-one-parent", false);
      const bad = /\b1 parents\b/.test(t);
      return { status: bad ? "FAIL" : "PASS", note: `sheet (not sent): ${t.match(/.{0,60}\b1 parents?\b.{0,60}/)?.[0]}; button: ${t.match(/Send to [^.|]{0,30}/)?.[0] ?? ""}`, shot: sh };
    }
  }
  return { status: "BLOCKED", note: `no route has exactly one parent now (${seen.join("; ")})` };
});

// CAMPUS-11: after a good return, the desk shows no red "nothing to return".
if (want("CAMPUS-11")) await check({ id: "CAMPUS-11", area: A, role: "cems.librarian", check: "Issue a free copy to Demo QA Regress's card, return it: desk shows success only, no 'nothing to return' / 'renew it instead'" }, async (set) => {
  const p = set(await as("cems.librarian"));
  const card = encodeURIComponent(process.env.REG_CARD ?? "CEMS/2026/0354");
  let copy = null;
  for (let i = 1; i <= 30 && !copy; i++) {
    const acc = String(i).padStart(5, "0");
    await open(p, `/library-management?card=${card}&copy=${acc}`);
    if (await p.getByRole("button", { name: /^Issue “/ }).count()) copy = acc;
  }
  if (!copy) return { status: "BLOCKED", note: "no free copy 00001-00030 could be issued to the card" };
  await p.getByRole("button", { name: /^Issue “/ }).click();
  let s1 = ""; for (let i = 0; i < 30 && !/issued to/i.test(s1); i++) { await p.waitForTimeout(700); s1 = await said(p); }
  await p.waitForTimeout(4000);
  const afterIssue = await said(p);
  await open(p, `/library-management?mode=return&copy=${copy}`);
  await p.getByRole("button", { name: /^Return “/ }).click({ timeout: 30000 });
  let s2 = ""; for (let i = 0; i < 30 && !/returned/i.test(s2); i++) { await p.waitForTimeout(700); s2 = await said(p); }
  await p.waitForTimeout(4000);
  const afterReturn = await said(p);
  const sh = await shot(p, "CAMPUS-11-after-return", false);
  const bad = /nothing to return|Renew it instead/i.test(afterIssue + afterReturn);
  return { status: /issued to/i.test(s1) && /returned/i.test(afterReturn) && !bad ? "PASS" : "FAIL", note: `copy ${copy}: after issue "${afterIssue.slice(0, 150)}"; after return "${afterReturn.slice(0, 200)}"`, shot: sh };
});

// Phone layout: Library Reports and Hostel Reports fit 320 to 414 px.
if (want("CAMPUS-PHONE")) for (const [login, url, name] of [["cems.librarian", "/library-management/reports", "Library Reports"], ["cems.warden", "/hostel-management/reports", "Hostel Reports"]]) {
  await check({ id: "CAMPUS-PHONE", area: A, role: login, check: `${name} at 320, 375, 390 and 414 px: no sideways scroll` }, async (set) => {
    const out = []; let bad = false, sh;
    for (const vp of ["phone320", "phone375", "phone390", "phone414"]) {
      const p = set(await as(login, VIEWPORTS[vp]));
      await open(p, url);
      const li = (await layoutIssues(p)).filter((x) => /sideways/.test(x));
      if (li.length) { bad = true; sh = await shot(p, `CAMPUS-PHONE-${name.replace(/\W+/g, "")}-${vp}`); }
      const head = squeeze(await mainText(p, 200));
      out.push(`${VIEWPORTS[vp].width}px: ${li.length ? li.join("; ").slice(0, 160) : "fits"}${/not here|no access/i.test(head) ? " (PAGE NOT OPEN: " + head.slice(0, 60) + ")" : ""}`);
      if (/not here|no access/i.test(head)) bad = true;
      sh ??= await shot(p, `CAMPUS-PHONE-${name.replace(/\W+/g, "")}-${vp}`);
      await p.context().close();
    }
    set(null);
    return { status: bad ? "FAIL" : "PASS", note: out.join("; "), shot: sh };
  });
}

await close();
