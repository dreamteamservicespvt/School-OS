// The attendance device API (08-platform-security.md §7, 05 Devices & QR).
// Each device sends its own key; only the key's hash is stored. Each punch
// carries the device's unique punch number, so a punch sent twice counts once.
//
//   POST /api/v1/attendance/punches?s=<school id>
//   Authorization: Bearer <device key>
//   { "punches": [{ "punchNo": "10023", "userNo": "SPS-ST-004", "time": "2026-10-09T08:41:00+05:30" }] }
//
//   GET  /api/v1/attendance/punches?s=<school id>   (connection check)
import { withSchool } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hitLimit } from "@/lib/rate-limit";
import { hashKey, receivePunches, type PunchIn } from "@/lib/attendance/devices";
import { attendanceFeatures } from "@/lib/attendance/settings";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PUNCHES = 500;
/** Requests per device per minute (inferred: a fair limit, 08 §7). */
const DEVICE_LIMIT_PER_MINUTE = 60;

const reply = (status: number, body: object, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

async function findDevice(request: Request) {
  const url = new URL(request.url);
  const schoolId = url.searchParams.get("s") ?? "";
  const auth = request.headers.get("authorization") ?? "";
  const key = (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : request.headers.get("x-device-key") ?? "").trim();
  if (!UUID.test(schoolId) || !/^sosd_[\w-]{20,80}$/.test(key)) return { problem: reply(401, { problem: "Send the device key as 'Authorization: Bearer <key>' and the school in ?s=." }) };
  const keyHash = hashKey(key);
  const limit = await hitLimit(`attendance-device:${keyHash.slice(0, 32)}`, DEVICE_LIMIT_PER_MINUTE, 60);
  if (!limit.ok) return { problem: reply(429, { problem: "Too many requests from this device. Send punches in batches." }, { "Retry-After": String(limit.retryAfterSeconds) }) };
  const ctx = { schoolId, userId: null };
  const found = await withSchool(ctx, async (tx) => {
    const device = await tx.attendanceDevice.findFirst({ where: { keyHash, archivedAt: null } });
    if (!device) return null;
    const features = await attendanceFeatures(tx, ctx);
    const school = await tx.school.findUnique({ where: { id: schoolId }, select: { timeZone: true } });
    return { device, on: features.has("attendance-devices"), timeZone: school?.timeZone ?? "Asia/Kolkata" };
  });
  if (!found) return { problem: reply(401, { problem: "This device key is not valid. It may have been replaced; copy the new key from Devices & QR." }) };
  if (!found.on) return { problem: reply(403, { problem: "Attendance devices are switched off for this school (Attendance Settings)." }) };
  return { ctx, ...found };
}

export async function GET(request: Request) {
  const r = await findDevice(request);
  if ("problem" in r) return r.problem;
  const now = new Date();
  await withSchool(r.ctx, (tx) => tx.attendanceDevice.update({ where: { id: r.device.id }, data: { lastSyncAt: now } }));
  return reply(200, { ok: true, device: r.device.name, active: r.device.isActive, serverTime: now.toISOString() });
}

export async function POST(request: Request) {
  const r = await findDevice(request);
  if ("problem" in r) return r.problem;
  const raw = await request.text();
  if (raw.length > 500_000) return reply(413, { problem: `Too large. Send at most ${MAX_PUNCHES} punches at a time.` });
  let body: { punches?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return reply(400, { problem: "The body must be JSON like { \"punches\": [...] }." });
  }
  if (!Array.isArray(body.punches)) return reply(400, { problem: "The body must have a 'punches' list." });
  if (body.punches.length > MAX_PUNCHES) return reply(413, { problem: `Send at most ${MAX_PUNCHES} punches at a time.` });
  const punches = body.punches.filter((p): p is PunchIn => typeof p === "object" && p !== null).map((p) => ({ punchNo: String(p.punchNo ?? ""), userNo: String(p.userNo ?? ""), time: String(p.time ?? "") }));
  const now = new Date();
  const results = await withSchool(r.ctx, async (tx) => {
    const out = await receivePunches(tx, r.ctx, r.device, punches, now, r.timeZone);
    const count = (k: string) => out.filter((x) => x.result === k).length;
    await writeAudit(tx, r.ctx, { action: "device-punches-received", recordType: "Attendance Device", recordId: r.device.id, after: { received: out.length, accepted: count("accepted"), rejected: count("rejected"), duplicates: count("duplicate") } });
    return out;
  }, { timeout: 60_000 });
  const count = (k: string) => results.filter((x) => x.result === k).length;
  return reply(200, { received: results.length, accepted: count("accepted"), rejected: count("rejected"), duplicates: count("duplicate"), results });
}
