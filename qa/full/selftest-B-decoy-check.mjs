// Recheck B6: wrong code typed on the code page reached with an unknown login (phone, light).
import { go, mainText, close, sleep, PHONE, snap } from "./selftest-B-h.mjs";
import { launch } from "../lib.mjs";
const ctx = await (await launch()).newContext({ ...PHONE });
const p = await ctx.newPage();
await go(p, "/sign-in"); await sleep(800);
await p.getByRole("button", { name: /Forgot password/ }).tap(); await sleep(300);
await p.locator("#username").fill(`nosuchdecoy${Date.now() % 1000}`);
await p.getByRole("button", { name: "Send code" }).tap();
await p.waitForURL(/\/sign-in\/code/, { timeout: 20000 }).catch(() => {});
await sleep(1500);
for (const code of ["123456", "654321"]) {
  const box = p.getByLabel("6-digit code"); await box.fill(""); await box.pressSequentially(code, { delay: 30 });
  await sleep(500);
  const v = p.getByRole("button", { name: /Verify and sign in/ });
  console.log("verify visible", await v.isVisible().catch(() => false), "enabled", await v.isEnabled().catch(() => false));
  if (await v.isEnabled().catch(() => false)) await v.click().catch((e) => console.log("click err", e.message.split("\n")[0]));
  await sleep(3000);
  console.log(code, "->", new URL(p.url()).pathname, (await mainText(p, 3000)).replace(/\n+/g, " | ").slice(0, 600));
}
await snap(p, "re-forgot-decoy-wrong-code");
const cookies = await ctx.cookies(); console.log("cookies", cookies.map((c) => `${c.name}=${c.value.slice(0, 12)}…`).join(" "));
await close();
