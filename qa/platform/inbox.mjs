// Approvals inbox, Notifications panel, Messages and Profile, read through the screens.
//   node qa/platform/inbox.mjs <login>
import { close, BASE, mainText } from "../lib.mjs";
import { as } from "./util.mjs";
const login = process.argv[2] ?? "cems.admin";
const p = await as(login);
const say = (m) => console.log(`${login}: ${m}`);

await p.goto(`${BASE}/approvals`); await p.waitForTimeout(1000);
let t = (await mainText(p, 4000)).replace(/\n/g, " | ");
say(`approvals: ${t.slice(0, 260)}`);
for (const tab of ["Asked by me", "All requests"]) {
  const link = p.getByRole("link", { name: new RegExp(tab) }).or(p.getByRole("tab", { name: new RegExp(tab) })).first();
  if (await link.count()) { await link.click(); await p.waitForTimeout(1200); t = (await mainText(p, 4000)).replace(/\n/g, " | "); say(`approvals "${tab}" (${p.url().replace(BASE, "")}): rows ${await p.locator("main li, main tbody tr").count()} :: ${t.slice(150, 450)}`); }
}
const status = p.getByLabel("Status").first();
if (await status.count()) {
  const opts = await status.locator("option").allInnerTexts();
  say(`status filter options: ${opts.join(", ")}`);
  const pick = opts.find((o) => /Approved/.test(o));
  if (pick) { await status.selectOption({ label: pick }); await p.waitForTimeout(1500); say(`after Status=${pick}: ${p.url().replace(BASE, "")} rows ${await p.locator("main li, main tbody tr").count()}`); }
}

// Notifications panel from the bell.
await p.goto(`${BASE}/dashboard?view=dashboard`); await p.waitForTimeout(1000);
await p.getByRole("button", { name: /^Notifications/ }).first().click();
await p.waitForTimeout(600);
const panel = p.locator("[role=dialog][aria-label=Notifications]");
say(`notifications panel: ${(await panel.innerText().catch(() => "not open")).replace(/\s+/g, " ").slice(0, 300)}`);
await p.keyboard.press("Escape");
await p.goto(`${BASE}/notifications`); await p.waitForTimeout(1000);
say(`notifications page: ${(await mainText(p, 600)).replace(/\n/g, " | ").slice(0, 300)}`);

await p.goto(`${BASE}/messages`); await p.waitForTimeout(1000);
say(`messages: ${(await mainText(p, 600)).replace(/\n/g, " | ").slice(0, 300)}`);

await p.goto(`${BASE}/profile`); await p.waitForTimeout(1000);
say(`profile: ${(await mainText(p, 1500)).replace(/\n/g, " | ").slice(0, 700)}`);
say(`page problems: ${JSON.stringify(p.problems)}`);
await close();
