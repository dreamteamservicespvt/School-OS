// Regression re-test of the fixed PLATFORM defects, through the screens.
//   QA_OUT=qa-output/regression node qa/regression/platform.mjs [ID ...]
import { as, open, settle, mainText, shot, close, layoutIssues, squeeze, rec, check, BASE, VIEWPORTS } from "./_lib.mjs";

const only = process.argv.slice(2);
const want = (id) => !only.length || only.includes(id);
const A = "platform";

// PLATFORM-01 (P1): Search finds people, never "Too many searches".
if (want("PLATFORM-01")) await check({ id: "PLATFORM-01", area: A, role: "cems.admin", check: "Ctrl+K, type Aarav: students named Aarav are listed, no 'Too many searches'" }, async (set) => {
  const p = set(await as("cems.admin"));
  await open(p, "/dashboard");
  const statuses = [];
  p.on("response", (r) => { if (r.url().includes("/api/v1/search")) statuses.push(r.status()); });
  await p.keyboard.press("Control+k");
  const box = p.getByRole("combobox", { name: "Search" });
  await box.waitFor();
  await box.pressSequentially("Aarav", { delay: 80 });
  await p.waitForTimeout(2500);
  const list = squeeze(await p.locator("#cmdk-list").innerText());
  const s = await shot(p, "PLATFORM-01-search");
  const ok = /Aarav/i.test(list) && !/Too many searches/i.test(list) && !statuses.includes(429) && statuses.length > 0;
  return { status: ok ? "PASS" : "FAIL", note: `search API statuses [${statuses.join(",")}]; list: ${list.slice(0, 250)}`, shot: s };
});

// PLATFORM-02 (P2): Recent payments link goes to Collect Fee for the accountant, Fee Dashboard for the Principal.
for (const [login, label, path] of [["cems.accountant", "Collect fee", "/fee-management"], ["cems.principal", "Fee Dashboard", "/fee-management/dashboard"]]) {
  if (!want("PLATFORM-02")) break;
  await check({ id: "PLATFORM-02", area: A, role: login, check: `Dashboard Recent payments panel link reads "${label}" and opens a real page` }, async (set) => {
    const p = set(await as(login));
    await open(p, "/dashboard");
    const panel = p.getByText("Recent payments", { exact: true }).first().locator("xpath=ancestor::*[.//a[normalize-space()='Collect fee' or normalize-space()='Fee Dashboard']][1]");
    const link = panel.getByRole("link").filter({ hasText: /^\s*(Collect fee|Fee Dashboard)\s*$/ }).first();
    const text = squeeze(await link.innerText());
    const href = await link.getAttribute("href");
    await Promise.all([p.waitForURL((u) => u.pathname !== "/dashboard", { timeout: 20000 }), link.click()]);
    await settle(p);
    const body = await mainText(p, 800);
    const s = await shot(p, `PLATFORM-02-${login}`, false);
    const notFound = /This page is not here/.test(body);
    const ok = text === label && href === path && !notFound;
    return { status: ok ? "PASS" : "FAIL", note: `link "${text}" -> ${href}; landed ${p.url().replace(BASE, "")}; ${notFound ? "page says 'This page is not here'" : "page opened: " + squeeze(body).slice(0, 120)}`, shot: s };
  });
}

// PLATFORM-03 (P2): no demo seed backup shown as "Last backup".
if (want("PLATFORM-03")) await check({ id: "PLATFORM-03", area: A, role: "cems.admin", check: "Settings > Data Backup & Security shows 'no backup yet', not the demo seed as Last backup" }, async (set) => {
  const p = set(await as("cems.admin"));
  await open(p, "/settings");
  await p.getByRole("link", { name: /Data Backup & Security/ }).first().click();
  await p.waitForURL(/data-security/); await p.getByText("Backups", { exact: true }).first().waitFor();
  const t = squeeze(await mainText(p, 2500));
  const s = await shot(p, "PLATFORM-03-backup", false);
  const ok = /No backup has been recorded/i.test(t) && !/Last backup/i.test(t);
  return { status: ok ? "PASS" : "FAIL", note: t.match(/Backups.{0,200}/)?.[0] ?? t.slice(0, 200), shot: s };
});

// PLATFORM-04 (P2): typed gateway keys stay after "Test these details" (School B).
if (want("PLATFORM-04")) await check({ id: "PLATFORM-04", area: A, role: "qab.admin", check: "Payment Gateways > Add: made-up Razorpay test keys stay after 'Test these details'; Add saves" }, async (set) => {
  const p = set(await as("qab.admin"));
  await open(p, "/settings/payment-gateways");
  await p.getByRole("link", { name: /^Add/ }).first().click();
  await p.waitForURL(/payment-gateways\/new/); await p.waitForLoadState("networkidle").catch(() => {});
  const name = `QA Regression Razorpay ${Date.now() % 100000}`;
  await p.getByLabel(/Display name/).fill(name);
  await p.getByLabel(/Key ID/).fill("rzp_test_DEMOQAREGRESS01");
  await p.getByLabel(/Key Secret/).fill("DEMOqaRegressionSecret0001");
  await p.getByLabel(/Webhook secret/).fill("DEMOqaWebhook0001");
  await p.getByRole("button", { name: "Test these details" }).click();
  await p.waitForTimeout(6000);
  const vals = { keyId: await p.getByLabel(/Key ID/).inputValue(), secret: await p.getByLabel(/Key Secret/).inputValue(), hook: await p.getByLabel(/Webhook secret/).inputValue() };
  const after = squeeze(await mainText(p, 3000));
  const testWords = after.match(/(could not|did not|failed|reach|test)[^.]{0,160}\./i)?.[0] ?? "";
  const s1 = await shot(p, "PLATFORM-04-after-test");
  const kept = vals.keyId === "rzp_test_DEMOQAREGRESS01" && vals.secret === "DEMOqaRegressionSecret0001" && vals.hook === "DEMOqaWebhook0001";
  await p.getByRole("button", { name: "Add gateway" }).click();
  await p.waitForTimeout(4000); await p.waitForLoadState("networkidle").catch(() => {});
  const saved = squeeze(await mainText(p, 3000));
  const s2 = await shot(p, "PLATFORM-04-after-add");
  const needed = /Key ID is needed/i.test(saved);
  const listed = saved.includes(name) || !/payment-gateways\/new/.test(p.url());
  const ok = kept && !needed && listed;
  return { status: ok ? "PASS" : "FAIL", note: `after test: Key ID ${vals.keyId ? "kept" : "EMPTY"}, Key Secret ${vals.secret ? "kept" : "EMPTY"}, Webhook secret ${vals.hook ? "kept" : "EMPTY"}; test said "${testWords.slice(0, 160)}"; after Add: ${needed ? "'Key ID is needed'" : `at ${p.url().replace(BASE, "")}, ${listed ? `"${name}" saved (switched off)` : "not saved: " + saved.slice(0, 200)}`}. Real Razorpay check itself needs a real key (not used).`, shot: s2 ?? s1 };
});

// PLATFORM-07 (P3): change password has a limit on wrong current passwords.
if (want("PLATFORM-07")) await check({ id: "PLATFORM-07", area: A, role: "cems.store", check: "Profile > Change password with a wrong current password 11 times: refused with a wait message after 10" }, async (set) => {
  const p = set(await as("cems.store"));
  await open(p, "/profile");
  const said = [];
  await p.getByRole("button", { name: "Change password" }).first().click();
  await p.locator("#currentPassword").waitFor();
  for (let i = 1; i <= 12; i++) {
    await p.locator("#currentPassword").fill(`WrongQa#${i}x2026`);
    await p.locator("#newPassword").fill("QaNewPass#2026zz");
    await p.locator("#confirmPassword").fill("QaNewPass#2026zz");
    const prev = await p.locator("form [role=alert]").innerText().catch(() => "");
    await p.locator("form").filter({ has: p.locator("#currentPassword") }).getByRole("button", { name: "Change password" }).click();
    await p.waitForFunction((pv) => { const a = document.querySelector("form [role=alert]"); return a && (a.dataset.n = (Number(a.dataset.n || 0) + 1)) && true; }, prev, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(1800);
    const msg = squeeze(await p.locator("form [role=alert], [role=status]").allInnerTexts().then((a) => a.join(" | ")).catch(() => ""));
    said.push(`${i}: ${msg.slice(0, 110)}`);
    if (/changed/i.test(msg) && !/not/i.test(msg)) break;
  }
  const s = await shot(p, "PLATFORM-07-limit", false);
  const limited = said.slice(10).some((x) => /Too many|wait|minutes/i.test(x)) && !said.slice(0, 9).some((x) => /Too many/i.test(x));
  return { status: limited ? "PASS" : "FAIL", note: said.join(" ; ").slice(0, 900), shot: s };
});

// PLATFORM-09 (P3): no sideways scroll at 768 and 1024; profile button visible.
if (want("PLATFORM-09")) for (const vp of ["tablet768", "tablet820", "laptop1024", "laptop1280"]) {
  await check({ id: "PLATFORM-09", area: A, role: "cems.admin", check: `Top bar fits at ${VIEWPORTS[vp].width}px: no sideways scroll, profile button on screen` }, async (set) => {
    const p = set(await as("cems.admin", VIEWPORTS[vp]));
    const bad = [], shots = [];
    for (const url of ["/dashboard", "/student-management", "/fee-management", "/settings"]) {
      await open(p, url);
      const r = await p.evaluate(() => {
        const b = document.querySelector('header button[aria-label="Your profile and settings"]')?.getBoundingClientRect();
        const h = document.querySelector("header");
        const wide = [...document.querySelectorAll("main *")].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest(".overflow-x-auto, .overflow-auto, table, [data-scroll-x]")).slice(0, 2).map((e) => `${e.tagName.toLowerCase()} "${(e.innerText || "").slice(0, 25).replace(/\s+/g, " ")}"`);
        return { sw: document.documentElement.scrollWidth, w: window.innerWidth, right: b ? b.right : null, header: h.scrollWidth <= h.clientWidth + 1, wide };
      });
      if (r.sw > r.w + 1 || r.right === null || r.right > r.w || !r.header) { bad.push(`${url}: page ${r.sw}px wide in a ${r.w}px window; top bar ${r.header ? "fits" : "OVERFLOWS"}, profile button right edge ${Math.round(r.right)}px; wide parts: ${r.wide.join(", ")}`); await p.evaluate(() => window.scrollTo(400, 0)); shots.push(await shot(p, `PLATFORM-09-${vp}${url.replace(/\W+/g, "_")}-scrolled`, false)); }
    }
    const s = shots[0] ?? await shot(p, `PLATFORM-09-${vp}`, false);
    return { status: bad.length ? "FAIL" : "PASS", note: bad.length ? bad.join("; ") : "dashboard, students, fees, settings fit; top bar fits; profile button on screen", shot: s };
  });
}

// PLATFORM-10 (P3): text contrast 4.5:1 in light and dark.
if (want("PLATFORM-10")) await check({ id: "PLATFORM-10", area: A, role: "cems.admin", check: "Text contrast >= 4.5:1 (3:1 large) on Dashboard and Audit log, light and dark" }, async (set) => {
  const p = set(await as("cems.admin"));
  const out = [];
  let fails = 0;
  for (const theme of ["light", "dark"]) for (const url of ["/dashboard", "/settings/data-security/audit-log"]) {
    await open(p, url);
    await p.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await p.waitForTimeout(300);
    const low = await p.evaluate(() => {
      const cv = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      const col = (c) => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = "#000"; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); const d = cv.getImageData(0, 0, 1, 1).data; return { rgb: [d[0], d[1], d[2]], a: d[3] / 255 }; };
      const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (c === "transparent" || c === "rgba(0, 0, 0, 0)") continue; const b = col(c); if (b.a > 0.6) return b.rgb; } return col(getComputedStyle(document.body).backgroundColor).rgb; };
      const low = [];
      for (const el of document.querySelectorAll("body *")) {
        if (![...el.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim())) continue;
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
        const cs = getComputedStyle(el); if (cs.visibility === "hidden" || Number(cs.opacity) < 0.3) continue;
        if (el.closest("[disabled], [aria-disabled=true], .sr-only")) continue;
        const [a, b] = [lum(col(cs.color).rgb), lum(bgOf(el))].sort((x, y) => y - x);
        const ratio = (a + 0.05) / (b + 0.05);
        const large = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && Number(cs.fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5)) low.push(`${ratio.toFixed(2)} "${el.textContent.trim().slice(0, 24)}"`);
      }
      return low;
    });
    fails += low.length;
    out.push(`${theme} ${url}: ${low.length} below${low.length ? " e.g. " + low.slice(0, 3).join(", ") : ""}`);
  }
  const s = await shot(p, "PLATFORM-10-dark-audit", false);
  return { status: fails ? "FAIL" : "PASS", note: out.join("; "), shot: s };
});

// PLATFORM-12 (P3): profile menu takes focus; New sheet keeps focus inside.
if (want("PLATFORM-12")) await check({ id: "PLATFORM-12", area: A, role: "cems.admin", check: "Keyboard: profile menu takes focus; New sheet keeps focus for 25 Tabs; Escape closes" }, async (set) => {
  const p = set(await as("cems.admin"));
  await open(p, "/dashboard");
  await p.locator('header button[aria-label="Your profile and settings"]').focus();
  await p.keyboard.press("Enter");
  await p.waitForTimeout(500);
  const inMenu = await p.evaluate(() => !!document.activeElement?.closest('[role=menu][aria-label="Your profile and settings"]'));
  let menuStays = 0;
  for (let i = 0; i < 15; i++) { await p.keyboard.press("Tab"); if (await p.evaluate(() => !!document.activeElement?.closest("[role=menu]"))) menuStays++; }
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  const menuClosed = !(await p.locator('[role=menu][aria-label="Your profile and settings"]').isVisible().catch(() => false));
  const backOnButton = await p.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Your profile and settings");
  await p.getByRole("button", { name: "New", exact: true }).first().focus();
  await p.keyboard.press("Enter");
  await p.waitForTimeout(600);
  let inSheet = 0;
  for (let i = 0; i < 25; i++) { await p.keyboard.press("Tab"); if (await p.evaluate(() => !!document.activeElement?.closest("[role=dialog][aria-modal=true]"))) inSheet++; }
  const s = await shot(p, "PLATFORM-12-new-sheet", false);
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  const sheetClosed = !(await p.locator("[role=dialog][aria-modal=true]").first().isVisible().catch(() => false));
  const ok = inMenu && menuStays === 15 && menuClosed && inSheet === 25 && sheetClosed;
  return { status: ok ? "PASS" : "FAIL", note: `profile menu: focus moved in ${inMenu}, stayed in for ${menuStays}/15 Tabs, Escape closed ${menuClosed}, focus back on button ${backOnButton}; New sheet: focus inside for ${inSheet}/25 Tabs, Escape closed ${sheetClosed}`, shot: s };
});

// PLATFORM-14 (P3): panel count matches the bell; profile menu links land on their sections.
if (want("PLATFORM-14")) await check({ id: "PLATFORM-14", area: A, role: "cems.principal", check: "Bell badge equals the panel's 'N new'; Colours and text size, Signed-in devices and #password land on their sections" }, async (set) => {
  const p = set(await as("cems.principal"));
  await open(p, "/dashboard");
  const bell = p.locator('header button[aria-label^="Notifications"]');
  const badge = squeeze(await bell.innerText().catch(() => ""));
  const label = await bell.getAttribute("aria-label");
  await bell.click(); await p.waitForTimeout(600);
  const head = squeeze(await p.locator("[role=dialog][aria-label=Notifications] h2 + p").innerText());
  const countOk = badge ? head.startsWith(`${badge} new`) || (badge.endsWith("+") && /new/.test(head)) : /caught up/.test(head);
  await p.keyboard.press("Escape");
  await p.locator('header button[aria-label="Your profile and settings"]').click(); await p.waitForTimeout(400);
  await p.getByRole("menuitem", { name: /Colours and text size/ }).click();
  await p.waitForURL(/appearance/, { timeout: 20000 }).catch(() => {});
  const appearance = /\/profile\/appearance/.test(p.url());
  const anchors = [];
  for (const [item, hash] of [["Signed-in devices", "devices"], [null, "password"]]) {
    if (item) {
      await open(p, "/dashboard");
      await p.locator('header button[aria-label="Your profile and settings"]').click(); await p.waitForTimeout(400);
      await p.getByRole("menuitem", { name: item }).click();
      await p.waitForURL(new RegExp(`#${hash}`), { timeout: 20000 }).catch(() => {});
    } else {
      await open(p, "/dashboard");
      await p.keyboard.press("Control+k");
      await p.getByRole("combobox", { name: "Search" }).pressSequentially("Change password", { delay: 50 });
      await p.waitForTimeout(1200);
      await p.locator("#cmdk-list [role=option]").filter({ hasText: /Change password/i }).first().click().catch(async () => { await p.keyboard.press("Enter"); });
      await p.waitForURL(/profile/, { timeout: 20000 }).catch(() => {});
    }
    await p.waitForLoadState("networkidle").catch(() => {}); await p.waitForTimeout(1200);
    const top = await p.evaluate((h) => document.getElementById(h)?.getBoundingClientRect().top ?? null, hash);
    anchors.push(`${hash}: url ${p.url().replace(BASE, "")}, section top ${top === null ? "missing" : Math.round(top) + "px"}`);
    if (!(top !== null && top < 250 && top > -50)) anchors.push(`${hash} NOT IN VIEW`);
  }
  const s = await shot(p, "PLATFORM-14-password-anchor", false);
  const ok = countOk && appearance && !anchors.some((a) => /NOT IN VIEW/.test(a));
  return { status: ok ? "PASS" : "FAIL", note: `bell "${badge}" (${label}), panel "${head}"; Colours and text size -> ${appearance ? "/profile/appearance" : p.url()}; ${anchors.join("; ")}`, shot: s };
});

// PLATFORM-18 (P4): transport papers alert names each paper once.
if (want("PLATFORM-18")) await check({ id: "PLATFORM-18", area: A, role: "cems.admin", check: "Dashboard transport papers alert has no doubled 'and N more'" }, async (set) => {
  const p = set(await as("cems.admin"));
  await open(p, "/dashboard");
  const t = squeeze(await mainText(p, 20000));
  const m = t.match(/\d+ transport papers? (due|expired)[^.]*\.[^.]*\./i)?.[0] ?? "";
  const s = await shot(p, "PLATFORM-18-dash", false);
  if (!m) return { status: "BLOCKED", note: "No transport papers alert on the Dashboard now", shot: s };
  const n = Number(m.match(/^(\d+)/)[1]);
  const doubled = /more and \d+ more/.test(m);
  if (doubled) return { status: "FAIL", note: m, shot: s };
  return { status: n >= 3 ? "PASS" : "BLOCKED", note: `${m}${n < 3 ? " (only " + n + " papers due, so the 'and N more' case is not shown; see the PLATFORM-18 3-paper row if present)" : ""}`, shot: s };
});

await close();
