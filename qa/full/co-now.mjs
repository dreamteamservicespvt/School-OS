// Bug 9 re-check: the Receptionist checks out the visitor who is in, straight away (same minute is allowed).
import { as } from "./look.mjs";
import { go, close, mainText } from "./h.mjs";
const p = await as("reception");
await go(p, "/front-office/visitors?status=In");
const row = p.locator("main table tbody tr").filter({ hasText: "Ramesh Babu" }).first();
await row.getByRole("link", { name: /Check out/ }).click();
await p.waitForTimeout(1500);
const d = p.getByRole("dialog").last();
console.log("DIALOG", (await d.innerText()).replace(/\n+/g, " | ").slice(0, 400));
await d.getByRole("button", { name: /^Check out/ }).last().click();
await p.waitForTimeout(3000);
console.log("AFTER", (await p.getByRole("dialog").last().innerText().catch(() => "(closed)")).replace(/\n+/g, " | ").slice(0, 300));
await go(p, "/front-office/visitors?status=In");
const t = await mainText(p, 4000);
console.log(t.includes("Ramesh Babu") ? "FAIL still in" : "PASS checked out", p.problems);
await close();
