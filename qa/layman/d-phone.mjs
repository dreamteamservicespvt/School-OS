import { asRole, go, sleep, close, snap } from "./d-h.mjs";
const p = await asRole("admin", { width: 390, height: 844 });
for (const [u, n] of [["/staff-hr-management", "ph-staff"], ["/staff-hr-management/aa89a6b9-5967-4620-baed-4f2895ffdabe", "ph-staff-profile"], ["/events-calendar", "ph-calendar"], ["/events-calendar/events", "ph-events"], ["/hostel-management/rooms", "ph-rooms"], ["/transport-management/routes", "ph-routes"], ["/front-office/visitors", "ph-visitors"]]) {
  await go(p, u); await sleep(1200); await snap(p, n, false);
}
await close();
