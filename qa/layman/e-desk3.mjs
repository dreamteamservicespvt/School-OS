// Layman E: due date change with reason; invalid date; then return both copies (bad charges first).
process.env.QA_OUT ??= "D:/all/Projects/School-OS/qa-output/layman-e";
const { asRole, go, snap, note, close, sleep } = await import("../full/selftest-A-h.mjs");
const p = await asRole("librarian");
const settle = async () => { for (let i = 0; i < 30; i++) { const busy = await p.locator('button[aria-busy="true"], button:has(.animate-spin)').count(); if (!busy) break; await sleep(500); } await sleep(900); };
const desk = async () => ((await p.locator("main").innerText()).split("Reservations\n\nReady at the desk")[0].split("ready at the desk")[1] ?? "").replace(/\n{2,}/g, "\n");
const step = async (label) => { await settle(); const t = await desk(); note("desk3", `\n--- ${label}\n${t}\nPROBLEMS: ${p.problems.join(" ; ")}`); await snap(p, `desk3-${label}`, false); console.log(`--- ${label}\n${t.slice(0, 900)}`); return t; };
await go(p, "/library-management");
await p.locator("#scan-member").fill("SPS/2023/0055"); await p.locator("#scan-member").press("Enter"); await settle();
await p.locator("#scan-copy").fill("Ashoka"); await p.locator("#scan-copy").press("Enter"); await settle();
await p.getByText(/Issue copy \d+/).first().click(); await settle();
const due = p.locator("#issue-due");
await due.click(); await due.press("Control+a"); await due.press("Backspace");
await due.pressSequentially("31122026", { delay: 40 });
console.log("typed due:", await due.inputValue());
const issueBtn = p.getByRole("button", { name: /^Issue “/ });
await issueBtn.click(); await step("30-due-no-reason");
console.log("due after error:", await due.inputValue());
await p.locator("#issue-reason").fill("LE- holiday project");
await issueBtn.click(); await step("31-due-with-reason");
// return both copies
for (const acc of ["00392", ...(await p.locator("main").innerText()).match(/copy (\d{5})/g)?.map((s) => s.slice(5)) ?? []]) {
  await go(p, "/library-management?mode=return");
  await p.locator("#scan-return").fill(acc); await p.locator("#scan-return").press("Enter"); await settle();
  if (!(await p.locator("#scan-return").count()) || !(await p.getByRole("button", { name: /^Return “/ }).count())) { await step(`40-${acc}-not-returnable`); continue; }
  await step(`40-${acc}-found`);
  await p.getByRole("radio", { name: "Damaged" }).click();
  await p.locator("#ret-charge").fill("-50");
  await p.getByRole("button", { name: /^Return “/ }).click(); await step(`41-${acc}-negative`);
  await p.locator("#ret-charge").fill("abc");
  await p.getByRole("button", { name: /^Return “/ }).click(); await step(`42-${acc}-letters`);
  await p.getByRole("radio", { name: "Good" }).click();
  await p.getByRole("button", { name: /^Return “/ }).click(); await step(`43-${acc}-good`);
}
await go(p, "/library-management"); await sleep(1000);
console.log("TOP:", (await p.locator("main").innerText()).slice(0, 300).replace(/\n+/g, " | "));
await close();
