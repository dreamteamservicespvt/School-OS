// Layman E: school details with a wrong phone and email (refused, then checked unchanged), global search, roles page.
process.env.QA_OUT ??= "D:/all/Projects/School-OS/qa-output/layman-e";
const { asRole, go, close, sleep, mainText, snap, note } = await import("../full/selftest-A-h.mjs");
const p = await asRole("admin");
await go(p, "/settings/school-profile"); await sleep(1200);
const phone = p.getByLabel(/^Phone/).first(); const email = p.getByLabel(/^Email/).first();
const was = { phone: await phone.inputValue(), email: await email.inputValue() };
console.log("was:", JSON.stringify(was));
try {
  await phone.fill("12"); await email.fill("abc@");
  await p.getByRole("button", { name: "Save school details" }).click(); await sleep(4000);
  const t = await mainText(p, 2500); note("set2", t);
  console.log("errors:", t.split("\n").filter((l) => /must|valid|digits|needed|check|not right/i.test(l)).join(" | "));
  await snap(p, "set2-profile-bad", false);
  await go(p, "/settings/school-profile"); await sleep(1000);
  const now = { phone: await p.getByLabel(/^Phone/).first().inputValue(), email: await p.getByLabel(/^Email/).first().inputValue() };
  console.log("after reload:", JSON.stringify(now), JSON.stringify(now) === JSON.stringify(was) ? "UNCHANGED" : "CHANGED!");
  if (JSON.stringify(now) !== JSON.stringify(was)) { await p.getByLabel(/^Phone/).first().fill(was.phone); await p.getByLabel(/^Email/).first().fill(was.email); await p.getByRole("button", { name: "Save school details" }).click(); await sleep(4000); console.log("restored"); }
} catch (e) { console.log("profile test error", e.message.split("\n")[0]); }
// global search
for (const q of ["Ashoka", "SPS/2023/0055", "Library", "ఆద్య", "zzqx"]) {
  await go(p, "/dashboard"); await sleep(500);
  await p.keyboard.press("Control+k"); await sleep(600);
  await p.keyboard.type(q, { delay: 30 }); await sleep(2500);
  const box = p.getByRole("dialog").last();
  const t = (await box.innerText().catch(() => "(no dialog)")).replace(/\n+/g, " | ").slice(0, 400);
  console.log(`SEARCH "${q}": ${t}`);
  await snap(p, `set2-search-${q.replace(/[^\w]/g, "_")}`, false);
}
await close();
