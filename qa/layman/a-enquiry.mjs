// Layman A: Add enquiry (empty, bad phone, Hindi name, emoji, double click), open it, follow-up, then filters and export.
import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const p = await asRole("admin");
const S = Date.now().toString().slice(-5);
const log = (k, v) => console.log(`== ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
const dlg = () => p.getByRole("dialog").last();
const dt = async () => (await dlg().innerText().catch(() => "")).replace(/\n+/g, " | ");
await go(p, "/admission-management/enquiries"); await sleep(800);
await p.getByRole("button", { name: "Add enquiry" }).click(); await sleep(1200);
log("dialog", (await dt()).slice(0, 1500));
log("fields", await dlg().evaluate((d) => [...d.querySelectorAll("input,select,textarea")].filter((e) => e.type !== "hidden").map((e) => `${e.tagName}:${e.name}:${e.id}:${e.type}:${(e.id && document.querySelector(`label[for="${e.id}"]`)?.innerText) || ""}`)));
log("buttons", await dlg().evaluate((d) => [...d.querySelectorAll("button")].map((b) => b.innerText.trim())));
await snap(p, "enq-dialog");
await p.setViewportSize({ width: 390, height: 844 }); await sleep(500); await snap(p, "enq-dialog-390", false); await p.setViewportSize({ width: 1440, height: 900 });
console.log("PROBLEMS", p.problems);
await close();
