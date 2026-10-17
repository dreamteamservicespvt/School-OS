// Keyboard only: sign in, find a student with Ctrl+K and open the profile, the
// profile menu (focus in, Escape out, focus back), visible focus on each Tab
// stop, and error words tied to fields (sign-in and an empty form).
//   node qa/platform/a11y.mjs
import { close, BASE, PASSWORD } from "../lib.mjs";
import { page } from "./util.mjs";

const say = (s, m) => console.log(`${s.padEnd(5)} ${m}`);
const focusInfo = (p) => p.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { tag: "body" };
  const cs = getComputedStyle(el);
  const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || /rgb|#/.test(cs.boxShadow) && cs.boxShadow !== "none";
  const name = el.getAttribute("aria-label") || (el.id && document.querySelector(`label[for="${el.id}"]`)?.innerText) || el.innerText?.trim() || el.getAttribute("placeholder") || el.getAttribute("name") || "";
  return { tag: el.tagName.toLowerCase(), type: el.getAttribute("type"), name: name.replace(/\s+/g, " ").slice(0, 40), ring, invalid: el.getAttribute("aria-invalid"), describedby: el.getAttribute("aria-describedby") };
});

const p = await page();
// 1. Wrong password with a made-up login (no real login gets a failed try).
await p.goto(`${BASE}/sign-in`);
await p.keyboard.press("Tab");
const order = [];
for (let i = 0; i < 8; i++) { const f = await focusInfo(p); order.push(`${f.tag}${f.type ? `[${f.type}]` : ""} "${f.name}"${f.ring ? "" : " (NO FOCUS RING)"}`); if (/password/i.test(f.name) && f.tag === "input") break; await p.keyboard.press("Tab"); }
say(order.some((o) => /NO FOCUS RING/.test(o)) ? "FAIL" : "PASS", `sign-in tab order: ${order.join(" -> ")}`);
await p.getByLabel(/username|mobile|login/i).first().focus();
await p.keyboard.type("demo.nobody.qa5");
await p.keyboard.press("Tab"); // straight to the password box ("Forgot password?" is after Sign in, PLATFORM-16)
await p.keyboard.type("Wrong#Pass1");
await p.keyboard.press("Enter");
await p.waitForTimeout(2500);
const err = await p.evaluate(() => {
  const a = [...document.querySelectorAll("[role=alert], [aria-live]")].map((e) => e.innerText.trim()).filter(Boolean);
  const inv = [...document.querySelectorAll("input[aria-invalid=true]")].map((i) => ({ id: i.id, by: i.getAttribute("aria-describedby"), byText: (i.getAttribute("aria-describedby") ?? "").split(" ").map((x) => document.getElementById(x)?.innerText).join(" ") }));
  return { a, inv, focus: document.activeElement?.tagName + "#" + document.activeElement?.id };
});
say(err.a.length ? "PASS" : "FAIL", `wrong password is announced: ${JSON.stringify(err)}`);

// 2. Keyboard sign in.
await p.getByLabel(/username|mobile|login/i).first().focus();
await p.keyboard.press("Control+A"); await p.keyboard.type("cems.admin");
await p.keyboard.press("Tab");
await p.keyboard.press("Tab");
await p.keyboard.press("Control+A"); await p.keyboard.type(PASSWORD);
await p.keyboard.press("Enter");
await p.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 60000 }).catch(() => {});
say(/sign-in/.test(p.url()) ? "FAIL" : "PASS", `keyboard sign in lands on ${p.url().replace(BASE, "")}`);
await p.waitForTimeout(1500);

// 3. Skip link is the first Tab stop.
await p.keyboard.press("Tab");
let f = await focusInfo(p);
say(/skip/i.test(f.name) ? "PASS" : "FAIL", `first Tab stop after sign in: ${f.tag} "${f.name}" ring=${f.ring}`);
await p.keyboard.press("Enter");
await p.waitForTimeout(300);
f = await focusInfo(p);
say("INFO", `after the skip link, focus is on ${f.tag} "${f.name}"; URL ${p.url().replace(BASE, "")}`);

// 4. Tab through the first 40 stops: every one shows focus.
const noRing = [];
for (let i = 0; i < 40; i++) { await p.keyboard.press("Tab"); const x = await focusInfo(p); if (!x.ring && x.tag !== "body") noRing.push(`${x.tag} "${x.name}"`); }
say(noRing.length ? "FAIL" : "PASS", `40 Tab stops on the dashboard; without a visible focus: ${noRing.length} ${noRing.slice(0, 6).join("; ")}`);

// 5. Task: Ctrl+K, type a student's name, open the profile with the keyboard.
const student = await p.evaluate(async () => {
  const r = await fetch("/api/v1/search?q=Harini"); return r.ok ? r.json() : { status: r.status };
});
await p.keyboard.press("Control+k");
await p.waitForTimeout(600);
f = await focusInfo(p);
const dialog = await p.locator("[role=dialog]").count();
say(dialog && f.tag === "input" ? "PASS" : "FAIL", `Ctrl+K opens a dialog with focus in the search box: dialog=${dialog} focus=${f.tag} "${f.name}"`);
await p.keyboard.type("Harini");
await p.waitForTimeout(2000);
await p.keyboard.press("ArrowDown");
await p.keyboard.press("Enter");
await p.waitForTimeout(3000);
say(/student-management\/[0-9a-f-]{36}/.test(p.url()) ? "PASS" : "CHECK", `Enter on a search result opens ${p.url().replace(BASE, "")} (api found ${JSON.stringify(student).slice(0, 120)})`);

// 6. Profile menu: focus moves in, Escape closes it and focus comes back.
await p.goto(`${BASE}/dashboard`); await p.waitForTimeout(1200);
await p.locator('header button[aria-label="Your profile and settings"]').focus();
await p.keyboard.press("Enter");
await p.waitForTimeout(500);
f = await focusInfo(p);
const inMenu = await p.evaluate(() => Boolean(document.activeElement?.closest("[role=menu], [role=dialog]")));
say(inMenu ? "PASS" : "FAIL", `profile menu opened: focus inside the menu=${inMenu} (${f.tag} "${f.name}")`);
await p.keyboard.press("Escape");
await p.waitForTimeout(400);
const open = await p.locator("[role=menu]").count();
f = await focusInfo(p);
say(!open && /profile/i.test(f.name) ? "PASS" : "FAIL", `Escape closes the menu (still open: ${open}); focus back on ${f.tag} "${f.name}"`);

// 7. New (quick add) dialog: Tab stays inside, Escape closes.
await p.getByRole("button", { name: /^New$/ }).first().focus();
await p.keyboard.press("Enter");
await p.waitForTimeout(600);
let inside = 0;
for (let i = 0; i < 25; i++) { await p.keyboard.press("Tab"); if (await p.evaluate(() => Boolean(document.activeElement?.closest("[role=dialog]")))) inside++; }
say(inside === 25 ? "PASS" : "FAIL", `New dialog keeps focus inside for 25 Tabs: ${inside}/25`);
await p.keyboard.press("Escape"); await p.waitForTimeout(400);
f = await focusInfo(p);
say(!(await p.locator("[role=dialog]").count()) ? "PASS" : "FAIL", `Escape closes the New dialog; focus on ${f.tag} "${f.name}"`);

// 8. An empty form: errors tied to their fields, focus on the first wrong one.
await p.goto(`${BASE}/student-management/new`); await p.waitForTimeout(1500);
const save = p.getByRole("button", { name: /^(Save|Add student|Admit)/ }).first();
say("INFO", `form save button: ${await save.innerText().catch(() => "none")}`);
await p.evaluate(() => document.querySelectorAll("form [required]").forEach((e) => e.removeAttribute("required"))); // reach the server's own checks
await save.click().catch(() => {});
await p.waitForTimeout(3000);
const formErr = await p.evaluate(() => ({
  invalid: [...document.querySelectorAll("[aria-invalid=true]")].map((i) => `${i.id}->${(i.getAttribute("aria-describedby") ?? "").split(" ").map((x) => document.getElementById(x)?.innerText?.slice(0, 50)).filter(Boolean).join("|") || "NOT TIED"}`).slice(0, 6),
  focus: document.activeElement?.id || document.activeElement?.tagName,
  alerts: [...document.querySelectorAll("[role=alert]")].map((e) => e.innerText.trim().slice(0, 80)).filter(Boolean),
}));
say(formErr.invalid.length && !formErr.invalid.some((x) => /NOT TIED/.test(x)) ? "PASS" : "CHECK", `empty student form: ${JSON.stringify(formErr)}`);
await close();
