// Notifications without spam (00-global.md §4).
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { notify } from "@/lib/notifications";
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
});
