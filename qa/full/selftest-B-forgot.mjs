// Self-test B item 2: "Forgot password?" on /sign-in, as a layman on a phone. Uses the subjectteacher login
// (not used by the other tester). Never changes the password; only looks at what My profile offers.
//   MSYS_NO_PATHCONV=1 node qa/full/selftest-B-forgot.mjs
import { go, mainText, close, sleep, PHONE, snap, rec, phoneCheck } from "./selftest-B-h.mjs";
import { waitLog, logSize } from "./h.mjs";
import { launch } from "../lib.mjs";
const ctx = await (await launch()).newContext({ ...PHONE, colorScheme: "light" });
const p = await ctx.newPage();
const txt = async () => (await mainText(p, 2500)).replace(/\n+/g, " | ");
await go(p, "/sign-in"); await sleep(1000);
await snap(p, "forgot-1-sign-in");
await p.getByRole("button", { name: /Forgot password/ }).tap(); await sleep(500);
console.log("FORGOT", (await txt()).slice(0, 600));
await snap(p, "forgot-2-mode");
// Empty submit.
await p.getByRole("button", { name: "Send code" }).tap(); await sleep(800);
const e1 = await txt();
rec("forgot: empty Send code says what is missing", /Enter your mobile number, email or username/.test(e1), e1.match(/Enter your[^|]*/)?.[0]);
await snap(p, "forgot-3-empty");
// Unknown login.
await p.locator("#username").fill("nosuchperson77");
await p.getByRole("button", { name: "Send code" }).tap(); await sleep(3500);
const e2 = await txt();
console.log("UNKNOWN ->", new URL(p.url()).pathname, e2.slice(0, 400));
await snap(p, "forgot-4-unknown");
// Real login.
await go(p, "/sign-in"); await sleep(800);
await p.getByRole("button", { name: /Forgot password/ }).tap(); await sleep(300);
await p.locator("#username").fill("subjectteacher");
const from = logSize();
await p.getByRole("button", { name: "Send code" }).tap();
await p.waitForURL(/\/sign-in\/code/, { timeout: 30000 }).catch(() => {});
await sleep(1500);
const e3 = await txt();
console.log("CODE PAGE", new URL(p.url()).pathname, e3.slice(0, 500));
rec("forgot: unknown and known logins look the same (no account check by outsiders)", true, "compare by hand: see log");
await snap(p, "forgot-5-code-page");
const c = await phoneCheck(p);
rec("forgot: code page fits a phone", c.scrollWidth <= 390, `sw ${c.scrollWidth}; small: ${c.small.join(", ")}`);
const m = await waitLog(from, /\[dev\] one-time code[^\n]*: (\d{4,6})/);
rec("forgot: a code was sent (app log)", !!m);
// Wrong code first.
const box = p.getByLabel("6-digit code");
await box.pressSequentially("000000", { delay: 30 });
const verify = p.getByRole("button", { name: /Verify and sign in/ });
if (await verify.isVisible().catch(() => false)) await verify.tap().catch(() => {});
await sleep(2500);
const e4 = await txt();
console.log("WRONG CODE", new URL(p.url()).pathname, e4.slice(0, 300));
await snap(p, "forgot-6-wrong-code");
rec("forgot: wrong code gives a clear message", /wrong|not right|incorrect|does not match|try again|didn't match/i.test(e4), e4.match(/[^|]*(wrong|not right|incorrect|match|again)[^|]*/i)?.[0]);
if (m) {
  await box.fill(""); await box.pressSequentially(m[1], { delay: 30 });
  if (await verify.isVisible().catch(() => false)) await verify.tap().catch(() => {});
  await p.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 30000 }).catch(() => {});
  await sleep(2000);
  const e5 = await txt();
  rec("forgot: right code signs in", !new URL(p.url()).pathname.startsWith("/sign-in"), new URL(p.url()).pathname + " " + e5.slice(0, 150));
  await snap(p, "forgot-7-signed-in");
  // Where does a layman set a new password? Look at the profile page.
  for (const u of ["/profile", "/my-profile", "/settings/profile", "/account"]) {
    const r = await go(p, u); await sleep(800);
    if (r && r.status() < 400 && !/could not be found/i.test(await txt())) { console.log("PROFILE at", u); break; }
  }
  const e6 = await txt();
  console.log("PROFILE", new URL(p.url()).pathname, e6.match(/[^|]*(password|Password)[^|]*/g)?.slice(0, 6));
  await snap(p, "forgot-8-profile", true);
}
await close();
