// Layman E: library issue & return desk, like a librarian.
process.env.QA_OUT ??= "D:/all/Projects/School-OS/qa-output/layman-e";
const { asRole, go, snap, ok, finish, note, close, sleep, mainText } = await import("../full/selftest-A-h.mjs");
const p = await asRole("librarian");
const settle = async () => { for (let i = 0; i < 30; i++) { const busy = await p.locator('button[aria-busy="true"], button:has(.animate-spin)').count(); if (!busy) break; await sleep(500); } await sleep(700); };
const desk = async () => (await p.locator("main").innerText()).split("Reservations\nReady at the desk")[0].split("1 ready at the desk")[1] ?? "";
const step = async (label) => { await settle(); const t = await desk(); note("desk", `\n--- ${label}\n${t}\nPROBLEMS: ${p.problems.join(" ; ")}`); await snap(p, `desk-${label}`, false); console.log(`--- ${label}\n${t.slice(0, 700)}`); return t; };
await go(p, "/library-management");
const box = p.locator("#scan-member");
const goBtn = () => p.getByRole("button", { name: "Go", exact: true }).first();
await box.fill("zzzz-no-such-card"); await goBtn().click(); await step("02-wrong-card");
await box.fill("ఆద్య"); await goBtn().click(); await step("03-telugu");
await box.fill("Aadhya"); await goBtn().click(); await step("04-partial-name");
await box.fill("SPS/2023/0055"); await goBtn().click(); await step("05-card");
const bbox = p.locator("#scan-copy");
await bbox.fill("Ashoka"); await goBtn().click(); await step("06-book-title");
await close();
