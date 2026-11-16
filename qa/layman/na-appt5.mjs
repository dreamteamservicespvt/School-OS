import { asRole, close, txt, snap, log, go, sleep } from "./na-h.mjs";
const p = await asRole("reception");
await go(p, "/front-office/appointments?day=2026-11-16");
await sleep(1500);
await p.getByRole("button", { name: "Actions for NA-Single Click Parent 02" }).click(); await sleep(1000);
log("menu: " + (await p.locator('[role="menu"]').innerText().catch(() => "no menu")).replace(/\n/g, " | "));
await snap(p, "appt-menu", false);
const cancel = p.getByRole("menuitem", { name: /cancel/i });
if (await cancel.count()) {
  await cancel.first().click(); await sleep(1500);
  const d = p.locator('[role="dialog"]:visible, [role="alertdialog"]:visible, dialog[open]').last();
  log("cancel dialog: " + (await d.innerText().catch(() => "none")).replace(/\n/g, " | "));
  await snap(p, "appt-cancel-dlg", false);
  const fields = await d.evaluate((el) => [...el.querySelectorAll("input,textarea,select,button")].map((e) => e.tagName + ":" + (e.name || e.innerText?.trim()))).catch(() => []);
  log("fields: " + fields.join(", "));
  const reason = d.locator("textarea, input[type=text]").first();
  // try empty confirm first
  const confirmBtn = d.getByRole("button", { name: /cancel appointment|yes|confirm/i }).last();
  if (await confirmBtn.count()) { await confirmBtn.click(); await sleep(2000); log("after empty confirm: " + (await d.innerText().catch(() => "closed")).replace(/\n/g, " | ")); }
  if (await reason.count().catch(() => 0)) { await reason.pressSequentially("NA- parent called to cancel").catch(() => {}); await confirmBtn.click().catch(() => {}); await sleep(2500); }
  log("after cancel: " + (await txt(p, 3000)).replace(/\n/g, " | ").slice(-700));
  await snap(p, "appt-cancelled");
}
await close();
