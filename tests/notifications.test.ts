// Notifications without spam (00-global.md §4).
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { isUnread, notificationPage, notify, UNREAD } from "@/lib/notifications";
import { makeSchool, makeUser } from "./helpers";

let school: Awaited<ReturnType<typeof makeSchool>>;
let person: { id: string };

beforeAll(async () => {
  school = await makeSchool();
  person = await makeUser({ schools: [{ id: school.id, roleKeys: ["accountant"] }] });
});

describe("notifications", () => {
  it("merges repeated events of the same kind into one line with a count", async () => {
    const ctx = { schoolId: school.id, userId: null };
    await withSchool(ctx, async (tx) => {
      for (let i = 0; i < 5; i++) {
        await notify(tx, ctx, {
          to: person.id, type: "fee", text: "New fee payment", link: "/fee-management",
          groupKey: "fee-paid", mergedText: (n) => `${n} new fee payments`,
        });
      }
      const rows = await tx.notification.findMany({ where: { userLoginId: person.id, groupKey: "fee-paid" } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ count: 5, text: "5 new fee payments" });
    });
  });

  it("does not tell people about what they did themselves", async () => {
    const ctx = { schoolId: school.id, userId: person.id };
    await withSchool(ctx, async (tx) => {
      expect(await notify(tx, ctx, { to: person.id, type: "x", text: "You did this", link: "/" })).toBeNull();
    });
  });

  it("counts a notification whose work is done as read: not in the bell count, listed after the unread ones (G48)", async () => {
    const reader = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }] });
    const ctx = { schoolId: school.id, userId: null };
    await withSchool(ctx, async (tx) => {
      const at = (min: number) => new Date(Date.now() - min * 60_000);
      const old = await tx.notification.create({ data: { schoolId: school.id, userLoginId: reader.id, type: "approval", text: "Waiting: old request", link: "/approvals/x", createdAt: at(30) } });
      const done = await tx.notification.create({ data: { schoolId: school.id, userLoginId: reader.id, type: "approval", text: "Waiting: decided by someone else", link: "/approvals/y", createdAt: at(1), doneAt: new Date() } });
      const read = await tx.notification.create({ data: { schoolId: school.id, userLoginId: reader.id, type: "fee", text: "Opened already", link: "/fee-management", createdAt: at(2), readAt: new Date() } });
      expect(await tx.notification.count({ where: { userLoginId: reader.id, ...UNREAD } })).toBe(1);
      const page = await notificationPage(tx, { userLoginId: reader.id }, 0, 10);
      expect(page.map((n) => n.id)).toEqual([old.id, done.id, read.id]);
      expect(page.map(isUnread)).toEqual([true, false, false]);
      // Paging carries on across the two parts.
      expect((await notificationPage(tx, { userLoginId: reader.id }, 1, 1)).map((n) => n.id)).toEqual([done.id]);
      expect((await notificationPage(tx, { userLoginId: reader.id }, 2, 5)).map((n) => n.id)).toEqual([read.id]);
    });
  });
});
