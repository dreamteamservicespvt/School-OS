// Hostel: the School Admin adds a boys' and a girls' hostel and makes Demo Satyavathi Kella (cems.warden) the warden;
// the warden adds rooms (validation, duplicate room number) and blocks a bed.
import { asUser, go, mainText, close, record, openDialog, send, said, sleep } from "./util.mjs";
const M = "Hostel Management", P = "Rooms & Beds";
const rec = (role, action, expected, actual, status, defect) => record({ module: M, page: P, action, role, expected, actual, status, ...(defect ? { defect } : {}) });
const ONLY = process.env.ONLY?.split(",");
async function hostelId(page, name) {
  await go(page, "/hostel-management/rooms");
  return page.evaluate((n) => { for (const a of document.querySelectorAll("main a[href*='hostel=']")) if (a.innerText.includes(n)) return new URL(a.href).searchParams.get("hostel"); return null; }, name);
}
const step = async (name, fn) => { if (ONLY && !ONLY.some((o) => name.includes(o))) return; try { await fn(); } catch (e) { console.log("ERR", name, e.message.split("\n")[0]); } };
const btn = async (page) => (await page.locator("dialog[open] button[type=submit]").last().innerText()).trim();
const D = (page, k) => page.locator(`dialog[open] [name="${k}"]`).first();

await step("hostels", async () => {
  const page = await asUser("cems.admin");
  await go(page, "/hostel-management/rooms"); const t0 = await mainText(page, 3000);
  for (const [name, g] of [["QA Demo Boys Hostel", "Boys"], ["QA Demo Girls Hostel", "Girls"]]) {
    if (t0.includes(name)) { console.log("exists", name); continue; }
    await openDialog(page, "/hostel-management/rooms?add=hostel");
    if (g === "Boys") { const r0 = await send(page, "Add hostel"); rec("School Admin", "Add a hostel with nothing typed", "Refused: name needed", r0.s, r0.open && /name/i.test(r0.s) ? "PASS" : "FAIL"); }
    await D(page, "name").fill(name); await page.locator("dialog[open] button", { hasText: new RegExp(`^${g}$`) }).first().click(); await D(page, "floors").fill("Ground, First");
    const r = await send(page, "Add hostel");
    rec("School Admin", `Add ${name} (${g}, floors Ground and First)`, "Saved", r.s, !r.open ? "PASS" : "FAIL");
  }
  // Wardens.
  await go(page, "/hostel-management/rooms"); const t = await mainText(page, 4000);
  for (const name of ["QA Demo Boys Hostel", "QA Demo Girls Hostel"]) {
    const href = await page.evaluate((n) => [...document.querySelectorAll("main a[href*='wardens=']")].map((a) => a.getAttribute("href")), name);
    console.log("warden links", href);
  }
  console.log(t.slice(0, 800));
  await page.context().close();
});

await step("wardens", async () => {
  const page = await asUser("cems.admin");
  await go(page, "/hostel-management/rooms");
  for (const name of ["QA Demo Boys Hostel", "QA Demo Girls Hostel"]) {
    if (ONLY?.includes("girls") && !name.includes("Girls")) continue;
    const id = await hostelId(page, name); console.log(name, id);
    await openDialog(page, `/hostel-management/rooms?hostel=${id}&wardens=${id}`);
    const s = page.locator("dialog[open] select[name=staffId]").first();
    await s.selectOption(await s.locator("option", { hasText: "Satyavathi Kella" }).first().getAttribute("value"));
    const r = await send(page, "Save wardens");
    rec("School Admin", `Make Demo Satyavathi Kella the warden of ${name}`, "Saved", r.s, !r.open ? "PASS" : "FAIL");
  }
  await page.context().close();
});
await step("rooms", async () => {
  const page = await asUser("cems.warden");
  await go(page, "/hostel-management/rooms"); const t = await mainText(page, 3000);
  rec("Hostel Warden", "Rooms & Beds as the warden", "Both QA Demo hostels shown, with Add room", t.slice(0, 300).replace(/\n/g, " / "), t.includes("QA Demo Boys Hostel") && /Add room/.test(t) ? "PASS" : "FAIL");
  for (const [hostel, rooms] of [["QA Demo Boys Hostel", ["B-101", "B-102"]], ["QA Demo Girls Hostel", ["G-101"]]]) {
    const base = `/hostel-management/rooms?hostel=${await hostelId(page, hostel)}`;
    for (const no of [...rooms, ...(hostel.includes("Boys") ? ["B-101"] : [])]) {
      await openDialog(page, base + (base.includes("?") ? "&" : "?") + "add=room");
      await page.locator("dialog[open] [name=roomNo]").fill(no);
      const b = page.locator("dialog[open] [name=beds]"); if (await b.count()) await b.fill("2");
      const r = await send(page, (await page.locator("dialog[open] button[type=submit]").last().innerText()).trim());
      const dup = hostel.includes("Boys") && no === "B-101" && rooms.indexOf(no) === 0 && (await page.locator("dialog[open]").count()) === 0 ? false : null;
      void dup;
      console.log(no, r.open, r.s);
      recRoom(hostel, no, r);
    }
  }
  await page.context().close();
});
function recRoom(hostel, no, r) {
  recRoom.seen ??= new Set(); const again = recRoom.seen.has(hostel + no); recRoom.seen.add(hostel + no);
  if (again) rec("Hostel Warden", `Add room ${no} again in ${hostel}`, "Refused: room number already used in this hostel", r.s, r.open && /already|used|exists/i.test(r.s) ? "PASS" : "FAIL");
  else rec("Hostel Warden", `Add room ${no} with 2 beds in ${hostel}`, "Saved, beds made and numbered", r.s, !r.open ? "PASS" : "FAIL");
}

await close();
