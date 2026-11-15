// Layman loop 15 Nov (moving in): an old staff register's "Emp Code" had nowhere to go, so old codes were lost.
// The staff import now has an optional Staff ID column (matched from "Emp Code", "Employee Code", "Emp ID" ...).
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { importKind } from "@/lib/importer";
import "@/lib/staff/import";
import { makeHrSchool } from "./fixture";

let f: Awaited<ReturnType<typeof makeHrSchool>>;
beforeAll(async () => { f = await makeHrSchool(); }, 120_000);

const kind = () => importKind("staff")!;
const row = (over: Record<string, string>) => {
  const r: Record<string, string> = Object.fromEntries(kind().columns.map((c) => [c.key, ""]));
  return { ...r, fullName: "Padmavathi", phone: "9000000301", designation: "Teacher", joiningDate: "01-06-2015", createLogin: "No", ...over };
};

describe("staff import: Staff ID", () => {
  it("is matched from an old register's Emp Code heading", () => {
    const col = kind().columns.find((c) => c.key === "staffCode");
    expect(col?.label).toBe("Staff ID");
    expect(col?.aliases).toEqual(expect.arrayContaining(["emp code", "employee code", "emp id"]));
  });

  it("keeps the old code, refuses it twice in one file or with odd characters", async () => {
    const ctx = { schoolId: f.school.id, userId: f.admin.id };
    await withSchool(ctx, async (tx) => {
      const seen = new Set<string>();
      const first = await kind().check(tx, ctx, row({ staffCode: "T01" }), seen);
      expect(first.ok).toBe(true);
      if (first.ok) expect((first.value as { details: { staffCode: string | null } }).details.staffCode).toBe("T01");
      const again = await kind().check(tx, ctx, row({ staffCode: "t01", phone: "9000000302", fullName: "Rajesh Kumar" }), seen);
      expect(again.ok).toBe(false);
      if (!again.ok) expect(again.problems.join(" ")).toMatch(/Staff ID t01 is on another row of the file/);
      const odd = await kind().check(tx, ctx, row({ staffCode: "T 03", phone: "9000000303", fullName: "Srilatha" }), seen);
      expect(odd.ok).toBe(false);
      const none = await kind().check(tx, ctx, row({ phone: "9000000304", fullName: "Venu" }), seen);
      expect(none.ok).toBe(true);
      if (none.ok) expect((none.value as { details: { staffCode: string | null } }).details.staffCode).toBeNull();
    });
  });
});
