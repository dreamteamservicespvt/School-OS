// The Message delivery report counts month by month in the database (gap list
// G37) and gives the same numbers as counting every recipient one by one:
// months in UTC as stored, test mode never "delivered", read counted as delivered.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { findEntry } from "@/lib/reports/catalogue";
import { readFilters } from "@/lib/reports/filters";
import { runEntry, viewerOf } from "@/lib/reports/run";
import { d, makeAttendanceSchool, TZ, type Fixture } from "../attendance/fixture";

let f: Fixture;
const STATUSES = ["QUEUED", "SENT", "DELIVERED", "READ", "FAILED"] as const;
const PEOPLE = 23;
const at = (i: number) => new Date(Date.UTC(2026, 8, 1) + i * 2.9 * 86_400_000 + (i % 5) * 3_600_000);
const rows = Array.from({ length: PEOPLE }, (_, i) => ({ queuedAt: at(i), status: STATUSES[i % STATUSES.length], provider: i % 3 === 0 ? "sandbox" : "meta", channel: i % 4 === 0 ? "sms" : "whatsapp" }));

beforeAll(async () => {
  f = await makeAttendanceSchool("Delivery Report School");
  await withSchool({ schoolId: f.school.id, userId: null }, async (tx) => {
    const m = await tx.message.create({ data: { schoolId: f.school.id, body: "Hello", channels: ["whatsapp", "sms"], audienceLabel: "Parents", status: "SENT" } });
    await tx.messageRecipient.createMany({
      data: rows.map((r, i) => ({ schoolId: f.school.id, messageId: m.id, recipientType: "guardian", name: `Parent ${i}`, channel: r.channel, address: `98765${String(i).padStart(5, "0")}`, text: "Hello", status: r.status, provider: r.provider, queuedAt: r.queuedAt })),
    });
  });
}, 120_000);

describe("Message delivery", () => {
  it("counts each month as counting every recipient would", async () => {
    const who = await withSchool({ schoolId: f.school.id, userId: f.principal.id }, (tx) => viewerOf(tx, f.principal.id, f.school.id));
    const entry = findEntry("co-delivery")!;
    const t = await withSchool(who!.ctx, async (tx) => runEntry(tx, who!, entry, await readFilters(tx, who!.ctx, entry, { from: "2026-09-01", to: "2026-10-31" }, { timeZone: TZ, weekStart: "monday", calendar: {} as never }, d("2026-10-31"))));
    // The count one recipient at a time, inside the dates asked for (India days).
    const from = new Date("2026-08-31T18:30:00Z"), to = new Date("2026-10-31T18:30:00Z");
    const by = new Map<string, { sent: number; delivered: number; read: number; failed: number; waiting: number }>();
    for (const r of rows.filter((x) => x.queuedAt >= from && x.queuedAt < to)) {
      const k = r.queuedAt.toISOString().slice(0, 7);
      const v = by.get(k) ?? { sent: 0, delivered: 0, read: 0, failed: 0, waiting: 0 };
      v.sent++;
      if ((r.status === "DELIVERED" || r.status === "READ") && r.provider !== "sandbox") v.delivered++;
      if (r.status === "READ") v.read++;
      if (r.status === "FAILED") v.failed++;
      if (r.status === "QUEUED") v.waiting++;
      by.set(k, v);
    }
    const want = [...by.keys()].sort().map((k) => by.get(k)!);
    expect(want.length).toBe(2);
    expect(t.rows.map((r) => ({ sent: r.sent, delivered: r.delivered, read: r.read, failed: r.failed, waiting: r.waiting }))).toEqual(want);
    expect(t.rows.map((r) => r.month)).toEqual(["September 2026", "October 2026"]);
  });
});
