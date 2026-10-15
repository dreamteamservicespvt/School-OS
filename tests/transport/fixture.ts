// A small school for Transport tests: this year (2026-27), Class 5 A with six
// students and their parents, WhatsApp in test mode with the bus messages
// switched on, and a login for each role that matters (05-roles.md column
// 12): Principal and School Admin (Full, oversee), Transport In-charge (Full),
// Vice Principal (View), Teacher and Accountant (none), and two drivers
// (Own): Ramesh drives Route 1 and Srinu, a hired driver, Route 2. Transport
// and live tracking are switched on. Route 1 has two stops with locations
// and a bus with 3 seats; Route 2 one stop and a van.
import { withSchool, type SchoolContext } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { encryptSecrets } from "@/lib/messaging/channels";
import { ensureReadyTemplates } from "@/lib/messaging/templates";
import { trCan, trViewer } from "@/lib/transport/access";
import { addDriver, addVehicle, saveVendor } from "@/lib/transport/fleet";
import { addRoute, addStop } from "@/lib/transport/routes";
import { saveSchedule } from "@/lib/transport/trips";
import { saveSettings } from "@/lib/transport/settings";
import { todayDate } from "@/lib/front-office/time";
import { makeSchool, makeUser } from "../helpers";

export const TZ = "Asia/Kolkata";
export const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const SCHOOL = { lat: 17.4849, lng: 78.4138 };
export const STOP1 = { lat: 17.4980, lng: 78.3870 };
export const STOP2 = { lat: 17.4905, lng: 78.3985 };
export const today = () => todayDate(TZ);

export async function makeTransportSchool(name = "Transport Test School", opts: { on?: boolean } = {}) {
  const school = await makeSchool(name);
  const sid = school.id;
  const sys: SchoolContext = { schoolId: sid, userId: null };
  await withSchool(sys, (tx) => tx.role.updateMany({ where: { key: { in: ["vice-principal", "driver"] } }, data: { isEnabled: true } }));
  const principal = await makeUser({ schools: [{ id: sid, roleKeys: ["principal"] }], name: "Principal" });
  const admin = await makeUser({ schools: [{ id: sid, roleKeys: ["school-admin"] }], name: "School Admin" });
  const incharge = await makeUser({ schools: [{ id: sid, roleKeys: ["transport-in-charge"] }], name: "Transport In-charge" });
  const vp = await makeUser({ schools: [{ id: sid, roleKeys: ["vice-principal"] }], name: "Vice Principal" });
  const teacher = await makeUser({ schools: [{ id: sid, roleKeys: ["teacher"] }], name: "Teacher" });
  const accountant = await makeUser({ schools: [{ id: sid, roleKeys: ["accountant"] }], name: "Accountant" });
  const rameshLogin = await makeUser({ schools: [{ id: sid, roleKeys: ["driver"] }], name: "Ramesh Goud" });
  const srinuLogin = await makeUser({ schools: [{ id: sid, roleKeys: ["driver"] }], name: "Srinu Naik" });
  const ctx: SchoolContext = { schoolId: sid, userId: incharge.id };

  const ids = await withSchool(sys, async (tx) => {
    const campusId = school.campus.id;
    if (opts.on !== false) {
      await tx.schoolModule.update({ where: { schoolId_moduleKey: { schoolId: sid, moduleKey: "transport-management" } }, data: { isOn: true } });
      await tx.schoolFeature.create({ data: { schoolId: sid, featureKey: "transport-live-tracking", isOn: true } });
    }
    const year = await tx.academicYear.create({ data: { schoolId: sid, campusId, name: "2026-27", startDate: d("2026-04-01"), endDate: d("2027-03-31"), status: "ACTIVE" } });
    const cls = await tx.schoolClass.create({ data: { schoolId: sid, campusId, name: "Class 5", sortOrder: 5 } });
    const section = await tx.section.create({ data: { schoolId: sid, classId: cls.id, academicYearId: year.id, name: "A" } });
    const students: { id: string; name: string; guardianId: string }[] = [];
    for (const [i, full] of ["Aarav Sharma", "Diya Reddy", "Kabir Rao", "Meera Iyer", "Rohan Das", "Sara Khan"].entries()) {
      const [first, last] = full.split(" ");
      const st = await tx.student.create({ data: { schoolId: sid, campusId, admissionNo: `ADM-${i + 1}`, firstName: first, lastName: last, fullName: full, status: "ACTIVE" } });
      const g = await tx.guardian.create({ data: { schoolId: sid, name: `Parent of ${first}`, relationship: "Father", phone: `90100${String(i + 1).padStart(5, "0")}` } });
      await tx.studentGuardian.create({ data: { schoolId: sid, studentId: st.id, guardianId: g.id, relationship: "Father", isPrimary: true } });
      await tx.enrolment.create({ data: { schoolId: sid, studentId: st.id, academicYearId: year.id, classId: cls.id, sectionId: section.id, rollNo: i + 1 } });
      students.push({ id: st.id, name: full, guardianId: g.id });
    }
    // Bus messages really go out (sandbox WhatsApp), so "one per trip" can be counted.
    await tx.school.update({ where: { id: sid }, data: { phone: "04023456789" } });
    await tx.messagingChannel.create({ data: { schoolId: sid, channel: "whatsapp", provider: "sandbox", isOn: true, environment: "test", ...encryptSecrets({ appSecret: "app-secret-1234", verifyToken: "verify-me", accessToken: "x" }) } });
    await tx.creditLedgerEntry.create({ data: { schoolId: sid, channel: "whatsapp", amount: 1000, note: "Test top-up" } });
    await ensureReadyTemplates(tx, sys);
    await tx.templateVersion.updateMany({ where: { schoolId: sid, template: { channel: "whatsapp", key: { startsWith: "bus-" } } }, data: { whatsappStatus: "APPROVED" } });
    for (const key of ["bus-arriving", "bus-pickup", "bus-drop"]) await tx.automaticMessageRule.create({ data: { schoolId: sid, key, isOn: true } });
    return { yearId: year.id, sectionId: section.id, students };
  });

  // Transport's own records, made the way the pages make them.
  const t = await withSchool(ctx, async (tx) => {
    await saveSettings(tx, ctx, { schoolLat: SCHOOL.lat, schoolLng: SCHOOL.lng });
    const vendor = await saveVendor(tx, ctx, null, { name: "Balaji Travels", contactName: null, phone: null, email: null, address: null, gstin: null, bankName: null, bankAccountNo: null, ifsc: null, monthlyChargePaise: null, contractEnd: null });
    const bus = await addVehicle(tx, ctx, { number: "TS07UB2236", label: "Bus 1", type: "BUS", model: null, capacity: 3, ownership: "OWNED", vendorId: null, status: "ACTIVE", gpsDeviceId: null, odometerKm: 1000, serviceEveryKm: null, serviceEveryDays: null }, [{ kind: "INSURANCE", expiresOn: new Date(today().getTime() + 200 * 86_400_000) }]);
    const van = await addVehicle(tx, ctx, { number: "TS10GB1290", label: "Van 1", type: "VAN", model: null, capacity: 12, ownership: "HIRED", vendorId: vendor.id, status: "ACTIVE", gpsDeviceId: null, odometerKm: null, serviceEveryKm: null, serviceEveryDays: null });
    const ramesh = (await addDriver(tx, ctx, { name: "Ramesh Goud", phone: "9701100101", role: "DRIVER", employment: "HIRED", vendorId: vendor.id, licenceNo: "TS0720190012345", licenceExpiry: d("2030-02-14"), invite: false })).driver;
    const srinu = (await addDriver(tx, ctx, { name: "Srinu Naik", phone: "9701100103", role: "DRIVER", employment: "HIRED", vendorId: vendor.id, licenceNo: "TS0920170067890", licenceExpiry: d("2030-08-30"), invite: false })).driver;
    await tx.driver.update({ where: { id: ramesh.id }, data: { userLoginId: rameshLogin.id } });
    await tx.driver.update({ where: { id: srinu.id }, data: { userLoginId: srinuLogin.id } });
    const route1 = await addRoute(tx, ctx, { name: "KPHB Colony", vehicleId: bus.id, driverId: ramesh.id, attendantId: null, feeTwoWayPaise: null, feeOneWayPaise: null, schoolArrivalMin: 8 * 60 + 25, eveningDepartMin: 15 * 60 + 30 });
    const stop1 = await addStop(tx, ctx, route1.id, { name: "KPHB Phase 9", before: null, pickupMin: 7 * 60 + 15, dropMin: null, lat: STOP1.lat, lng: STOP1.lng, feeTwoWayPaise: BigInt(180000), feeOneWayPaise: BigInt(110000) });
    const stop2 = await addStop(tx, ctx, route1.id, { name: "Vasanth Nagar", before: null, pickupMin: 7 * 60 + 33, dropMin: null, lat: STOP2.lat, lng: STOP2.lng, feeTwoWayPaise: BigInt(160000), feeOneWayPaise: null });
    const route2 = await addRoute(tx, ctx, { name: "Balanagar", vehicleId: van.id, driverId: srinu.id, attendantId: null, feeTwoWayPaise: BigInt(150000), feeOneWayPaise: BigInt(100000), schoolArrivalMin: 8 * 60 + 20, eveningDepartMin: 15 * 60 + 35 });
    const stop3 = await addStop(tx, ctx, route2.id, { name: "Fatehnagar", before: null, pickupMin: 7 * 60 + 45, dropMin: null, lat: 17.463, lng: 78.456, feeTwoWayPaise: null, feeOneWayPaise: null });
    // Every day, so the trips exist on whatever day the tests run.
    for (const r of [route1, route2]) for (const kind of ["MORNING", "EVENING"]) {
      await saveSchedule(tx, ctx, { routeId: r.id, kind, vehicleId: null, driverId: null, attendantId: null, startMin: kind === "MORNING" ? 7 * 60 : 15 * 60 + 30, days: [1, 2, 3, 4, 5, 6, 7] });
    }
    return { vendor, bus, van, ramesh, srinu, route1, route2, stop1, stop2, stop3 };
  });

  return { school, sys, ctx, principal, admin, incharge, vp, teacher, accountant, rameshLogin, srinuLogin, ...ids, ...t };
}

export type TrFixture = Awaited<ReturnType<typeof makeTransportSchool>>;

export const as = (f: TrFixture, userId: string | null): SchoolContext => ({ schoolId: f.school.id, userId });

/** What a person may see and do in Transport, worked out as the pages and actions do. */
export async function trFor(f: TrFixture, userId: string) {
  const view = await accessIn(userId, f.school.id);
  if (!view) throw new Error("no access");
  const who = { ...view, user: { id: userId } };
  const v = trViewer(who);
  return { v, can: trCan(v, who), view };
}
