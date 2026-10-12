// Devices & QR (05 §5, Done when 7 and 8, 08-platform-security.md §7):
// device keys stored hashed, a punch sent twice counts once, unmapped users
// rejected with the reason, a valid punch marks the staff member present
// with the in time; QR scans from outside the campus area refused and a
// second scan the same morning blocked; the device API's fair limit.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { addDevice, autoMatch, hashKey, mapUser, receivePunches, regenerateKey, reprocessRejected } from "@/lib/attendance/devices";
import { checkIn, createQrSession, qrCode, saveGeoFence } from "@/lib/attendance/qr";
import { setAttendanceFeature } from "@/lib/attendance/settings";
import { GET, POST } from "@/app/api/v1/attendance/punches/route";
import { accessFor, as, at, d, makeAttendanceSchool, TZ, type Fixture } from "./fixture";

let f: Fixture;
let deviceId: string;
let key: string;
beforeAll(async () => {
  f = await makeAttendanceSchool("Devices Test School");
  const access = await accessFor(f, f.principal.id);
  const r = await withSchool(as(f, f.principal.id), async (tx) => {
    for (const k of ["attendance-devices", "attendance-qr", "attendance-mobile"] as const) await setAttendanceFeature(tx, as(f, f.principal.id), k, true);
    await tx.attendanceSetting.update({ where: { schoolId: f.school.id }, data: { qrStaffOn: true, staffMethods: ["register", "qr", "mobile", "device"] } });
    return addDevice(tx, as(f, f.principal.id), access, { name: "Main gate scanner", serialNo: "ZK-0001", location: "Main entrance", campusId: f.school.campus.id, deviceType: "face", allowedUsers: "both", ipAddress: null, connectionNote: null });
  });
  deviceId = r.device.id;
  key = r.key;
});

const sys = () => ({ schoolId: f.school.id, userId: null });
async function punch(list: { punchNo: string; userNo: string; time: string }[], now: Date) {
  return withSchool(sys(), async (tx) => {
    const device = await tx.attendanceDevice.findUniqueOrThrow({ where: { id: deviceId } });
    return receivePunches(tx, sys(), device, list, now, TZ);
  });
}

describe("device keys", () => {
  it("stores only the key's hash, and shows the key once", async () => {
    const row = await withSchool(sys(), (tx) => tx.attendanceDevice.findUniqueOrThrow({ where: { id: deviceId } }));
    expect(key).toMatch(/^sosd_/);
    expect(row.keyHash).toBe(hashKey(key));
    expect(JSON.stringify(row)).not.toContain(key);
    expect(row.keyLast4).toBe(key.slice(-4));
  });

  it("refuses a second device with the same serial number", async () => {
    const access = await accessFor(f, f.principal.id);
    await expect(withSchool(as(f, f.principal.id), (tx) => addDevice(tx, as(f, f.principal.id), access, { name: "Copy", serialNo: "ZK-0001", location: null, campusId: f.school.campus.id, deviceType: "face", allowedUsers: "both", ipAddress: null, connectionNote: null })))
      .rejects.toThrow(/already added as "Main gate scanner"/);
  });

  it("a teacher cannot add devices", async () => {
    const access = await accessFor(f, f.teacherA.id);
    await expect(withSchool(as(f, f.teacherA.id), (tx) => addDevice(tx, as(f, f.teacherA.id), access, { name: "Mine", serialNo: "X-1", location: null, campusId: f.school.campus.id, deviceType: "face", allowedUsers: "both", ipAddress: null, connectionNote: null })))
      .rejects.toThrow(/Only the School Admin or the Principal/);
  });
});

describe("punches (Done when 7)", () => {
  it("rejects a punch from an unmapped user and keeps it with the reason", async () => {
    const out = await punch([{ punchNo: "1001", userNo: "ST-001", time: "2026-10-05T08:20:00+05:30" }], at("2026-10-05", "08:21"));
    expect(out).toEqual([{ punchNo: "1001", result: "rejected", reason: "Unknown user (not mapped)" }]);
    const row = await withSchool(sys(), (tx) => tx.devicePunch.findFirstOrThrow({ where: { punchNo: "1001" } }));
    expect(row.accepted).toBe(false);
    expect(row.rejectReason).toBe("unknown-user");
  });

  it("auto-matches the user number to a staff ID, and re-running the sync marks the staff member present with the in time", async () => {
    const access = await accessFor(f, f.principal.id);
    const matched = await withSchool(as(f, f.principal.id), (tx) => autoMatch(tx, as(f, f.principal.id), access, deviceId));
    expect(matched).toBe(1);
    const r = await withSchool(as(f, f.principal.id), (tx) => reprocessRejected(tx, as(f, f.principal.id), access, deviceId, at("2026-10-05", "09:00"), TZ));
    expect(r.accepted).toBe(1);
    const mark = await withSchool(sys(), (tx) => tx.attendanceMark.findFirstOrThrow({ where: { staffId: f.staffA.id, date: d("2026-10-05") } }));
    expect(mark.statusKey).toBe("present");
    expect(mark.method).toBe("face");
    expect(mark.inTime?.toISOString()).toBe(at("2026-10-05", "08:20").toISOString());
  });

  it("counts a punch sent twice only once (idempotency by punch number)", async () => {
    const p = { punchNo: "2001", userNo: "ST-001", time: "2026-10-06T08:47:00+05:30" };
    const first = await punch([p], at("2026-10-06", "08:48"));
    const again = await punch([p, p], at("2026-10-06", "08:49"));
    expect(first[0].result).toBe("accepted");
    expect(again.map((x) => x.result)).toEqual(["duplicate", "duplicate"]);
    expect(await withSchool(sys(), (tx) => tx.devicePunch.count({ where: { deviceId, punchNo: "2001" } }))).toBe(1);
    // Late: 08:47 is 17 minutes after the 08:30 start, more than the 10 minutes allowed.
    const mark = await withSchool(sys(), (tx) => tx.attendanceMark.findFirstOrThrow({ where: { staffId: f.staffA.id, date: d("2026-10-06") } }));
    expect(mark.statusKey).toBe("late");
    expect(mark.lateMinutes).toBe(17);
  });

  it("rejects a repeat within a few minutes, and takes a later punch as the out time", async () => {
    const out = await punch([
      { punchNo: "2002", userNo: "ST-001", time: "2026-10-06T08:49:00+05:30" },
      { punchNo: "2003", userNo: "ST-001", time: "2026-10-06T16:05:00+05:30" },
    ], at("2026-10-06", "16:06"));
    expect(out.map((x) => x.result)).toEqual(["rejected", "accepted"]);
    expect(out[0].reason).toMatch(/Repeat/);
    const mark = await withSchool(sys(), (tx) => tx.attendanceMark.findFirstOrThrow({ where: { staffId: f.staffA.id, date: d("2026-10-06") } }));
    expect(mark.outTime?.toISOString()).toBe(at("2026-10-06", "16:05").toISOString());
  });

  it("rejects punches outside the attendance window and on holidays", async () => {
    const out = await punch([
      { punchNo: "3001", userNo: "ST-001", time: "2026-10-07T23:10:00+05:30" },
      { punchNo: "3002", userNo: "ST-001", time: "2026-10-02T08:30:00+05:30" },
    ], at("2026-10-08", "08:00"));
    expect(out.map((x) => x.reason)).toEqual(["Outside the attendance window", "Holiday or Sunday"]);
  });

  it("a regenerated key replaces the old one at once", async () => {
    const access = await accessFor(f, f.principal.id);
    const old = key;
    const r = await withSchool(as(f, f.principal.id), (tx) => regenerateKey(tx, as(f, f.principal.id), access, deviceId));
    key = r.key;
    const call = (k: string) => GET(new Request(`http://x/api/v1/attendance/punches?s=${f.school.id}`, { headers: { authorization: `Bearer ${k}` } }));
    expect((await call(old)).status).toBe(401);
    expect((await call(key)).status).toBe(200);
  });
});

describe("the device API", () => {
  const post = (body: unknown, k = key) => POST(new Request(`http://x/api/v1/attendance/punches?s=${f.school.id}`, { method: "POST", headers: { authorization: `Bearer ${k}`, "content-type": "application/json" }, body: JSON.stringify(body) }));

  it("takes a batch and answers per punch", async () => {
    const res = await post({ punches: [{ punchNo: "4001", userNo: "NOBODY", time: new Date().toISOString() }] });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(1);
    expect(json.results[0].result).toBe("rejected");
  });

  it("refuses a key from another school", async () => {
    const other = await makeAttendanceSchool("Other device school");
    const res = await POST(new Request(`http://x/api/v1/attendance/punches?s=${other.school.id}`, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: JSON.stringify({ punches: [] }) }));
    expect(res.status).toBe(401);
  });

  it("has a fair limit per device per minute", async () => {
    let last = 200;
    for (let i = 0; i < 65 && last !== 429; i++) last = (await GET(new Request(`http://x/api/v1/attendance/punches?s=${f.school.id}`, { headers: { authorization: `Bearer ${key}` } }))).status;
    expect(last).toBe(429);
  });
});

describe("QR and mobile check-in (Done when 8)", () => {
  let code: string;
  beforeAll(async () => {
    const access = await accessFor(f, f.principal.id);
    await withSchool(as(f, f.principal.id), async (tx) => {
      await saveGeoFence(tx, as(f, f.principal.id), access, { campusId: f.school.campus.id, latitude: 17.385, longitude: 78.4867, radiusM: 50, studentsOn: false, staffOn: true });
      const s = await createQrSession(tx, as(f, f.principal.id), access, { name: "Main entrance", forWhom: "staff", scope: "school", campusId: null, rotation: "daily", expiresAt: null, now: new Date() });
      code = `${s.id}.${qrCode(s, d("2026-10-07"))}`;
    });
  });
  const scan = (userId: string, c: string, loc: { lat: number; lng: number }, now: Date) => withSchool(as(f, userId), (tx) => checkIn(tx, as(f, userId), { method: "qr", code: c, location: { ...loc, accuracy: 10 }, now, timeZone: TZ }));

  it("refuses a scan from 300 m outside the campus area", async () => {
    // About 300 m north of the campus point.
    const r = await scan(f.teacherB.id, code, { lat: 17.3877, lng: 78.4867 }, at("2026-10-07", "08:02"));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/^You are 3\d\d m from school/);
  });

  it("accepts a scan inside the area, then blocks a second scan the same morning", async () => {
    const ok = await scan(f.teacherB.id, code, { lat: 17.3851, lng: 78.4867 }, at("2026-10-07", "08:02"));
    expect(ok).toMatchObject({ ok: true, statusKey: "present" });
    const again = await scan(f.teacherB.id, code, { lat: 17.3851, lng: 78.4867 }, at("2026-10-07", "08:20"));
    expect(again).toEqual({ ok: false, message: "Already marked at 8:02 AM." });
  });

  it("refuses yesterday's code when the QR changes daily", async () => {
    const access = await accessFor(f, f.principal.id);
    void access;
    const r = await scan(f.principal.id, code, { lat: 17.3851, lng: 78.4867 }, at("2026-10-08", "08:05"));
    expect(r).toEqual({ ok: false, message: "This QR is not valid today. Scan the QR at the school entrance." });
  });

  it("refuses a geo-fence radius under 25 m", async () => {
    const access = await accessFor(f, f.principal.id);
    await expect(withSchool(as(f, f.principal.id), (tx) => saveGeoFence(tx, as(f, f.principal.id), access, { campusId: f.school.campus.id, latitude: 17.385, longitude: 78.4867, radiusM: 10, studentsOn: false, staffOn: true }))).rejects.toThrow(/between 25 and 5000/);
  });

  it("mobile check-in works inside the area", async () => {
    const r = await withSchool(as(f, f.hrLogin.id), (tx) => checkIn(tx, as(f, f.hrLogin.id), { method: "mobile", location: { lat: 17.385, lng: 78.4868 }, now: at("2026-10-07", "08:50"), timeZone: TZ }));
    expect(r).toMatchObject({ ok: true, statusKey: "late" });
  });

  it("maps a device user by hand to a student", async () => {
    const access = await accessFor(f, f.principal.id);
    const p = await withSchool(as(f, f.principal.id), (tx) => mapUser(tx, as(f, f.principal.id), access, { deviceId, deviceUserNo: "C-77", who: `student:${f.studentsA[0].id}` }));
    expect(p.name).toBe("Aarav Sharma");
    const out = await punch([{ punchNo: "5001", userNo: "C-77", time: "2026-10-08T08:40:00+05:30" }], at("2026-10-08", "08:41"));
    expect(out[0].result).toBe("accepted");
    const mark = await withSchool(sys(), (tx) => tx.attendanceMark.findFirstOrThrow({ where: { studentId: f.studentsA[0].id, date: d("2026-10-08") } }));
    expect(mark.sectionId).toBe(f.sectionA.id);
    expect(mark.statusKey).toBe("present");
  });
});
