import { asRole, go, mainText, sleep, close, snap } from "./d-h.mjs";
const role = process.argv[2];
const p = await asRole(role);
const urls = ["/staff-hr-management", "/staff-hr-management/add", "/staff-hr-management/aa89a6b9-5967-4620-baed-4f2895ffdabe", "/staff-hr-management/documents", "/staff-hr-management/leave?view=all", "/staff-hr-management/settings", "/staff-hr-management/export?format=csv", "/staff-hr-management/id-cards",
  "/front-office/visitors", "/front-office/enquiries", "/front-office/postal", "/front-office/pickup",
  "/events-calendar", "/events-calendar/events", "/events-calendar/settings",
  "/transport-management", "/transport-management/students", "/transport-management/export",
  "/hostel-management", "/hostel-management/allocation", "/hostel-management/settings", "/hostel-management/rooms/export", "/driver"];
console.log("landing:", new URL(p.url()).pathname, "| menu:", (await p.locator('nav[aria-label="Main menu"] a').allInnerTexts().catch(() => [])).map((s) => s.split("\n")[0]).join(", "));
for (const u of urls) {
  if (/export|id-cards/.test(u)) {
    const r = await p.request.get("http://localhost:3000" + u, { maxRedirects: 0 }).catch((e) => null);
    console.log(u, "->", r?.status(), r?.headers()["content-type"], r?.headers()["location"] ?? "");
    continue;
  }
  await go(p, u); await sleep(500);
  await p.waitForLoadState("load").catch(() => {}); await sleep(800);
  const t = await mainText(p, 3000).catch(async () => { await sleep(2000); return mainText(p, 3000).catch(() => "(navigating)"); });
  const refused = /no-access/.test(p.url()) || /You do not have access|not allowed|No access|can't open this|cannot open this|isn.t switched on|not switched on/i.test(t);
  const h1 = (await p.locator("h1").first().innerText().catch(() => "")).trim().replace(/\n/g, " ");
  console.log(u, "->", new URL(p.url()).pathname, refused ? "REFUSED" : "OPEN", "|", h1, "|", t.replace(/\n+/g, " | ").slice(0, 160));
}
await close();
