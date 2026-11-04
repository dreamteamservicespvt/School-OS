// Collect Fee, "Ask for approval" (testing issue 5, 2026-11-03): pressing it twice for the
// same discount on the same rows must not send two requests to the Principal.
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Current } from "@/lib/current";

const who = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/flash", async (original) => ({ ...(await original<typeof import("@/lib/flash")>()), flash: async () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("@/lib/current", async (orig) => {
  const real = await orig<typeof import("@/lib/current")>();
  const { requirePermission } = await import("@/lib/permissions");
  const requireCurrent = async () => who.current as Current;
  return {
    ...real,
    requireCurrent,
    requireAction: async (module: Parameters<typeof requirePermission>[1], action: Parameters<typeof requirePermission>[2]) => {
      const current = await requireCurrent();
      return { current, reach: requirePermission(current.permissions, module, action) };
    },
  };
});

import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { askDiscountApproval } from "@/app/(school)/fee-management/collect/[studentId]/actions";
import { dues, makeFeeSchool, type FeeSchool } from "./fixture";

let f: FeeSchool;
const form = (values: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
};

beforeAll(async () => {
  f = await makeFeeSchool();
  const access = await accessIn(f.accountant.id, f.school.id);
  who.current = { ...access!, ctx: { schoolId: f.school.id, userId: f.accountant.id }, user: { id: f.accountant.id, displayName: "Test" }, menu: [], schools: [], session: null, support: null };
}, 180_000);

describe("Ask for approval", () => {
  it("sends the request once and refuses the same request again", async () => {
    const open = await dues(f.ctx, f.ravi.id);
    const values = { studentId: f.ravi.id, discount: "500", discountReason: "Sibling discount", dueId: open[0].id };
    const first = await askDiscountApproval(undefined, form(values));
    expect(first?.message, String(first?.message)).toContain("sent to the principal");
    const again = await askDiscountApproval(undefined, form(values));
    expect(again?.ok).toBe(false);
    expect(again?.message).toContain("already waiting");
    const waiting = await withSchool(f.ctx, (tx) => tx.concession.count({ where: { studentId: f.ravi.id, status: "WAITING" } }));
    expect(waiting).toBe(1);
  }, 60_000);
});
