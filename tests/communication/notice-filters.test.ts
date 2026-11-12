// A word in the Notice Board's address that is not a real status or priority is
// ignored, never sent to the database: "?status=waiting" made the page fail and the
// browser showed React error #441 (QA LC23).
import { describe, expect, it } from "vitest";
import { noticeStatusOf, noticeWhere } from "@/lib/communication/notice-list";
import type { ListParams } from "@/lib/list";

const ctx = { schoolId: "00000000-0000-0000-0000-000000000001", userId: "00000000-0000-0000-0000-000000000002" };
const params = (filters: Record<string, string>) => ({ q: "", filters, archived: false, page: 1 }) as unknown as ListParams;
const statusOf = (w: ReturnType<typeof noticeWhere>) => (w.AND as { status?: unknown }[]).find((x) => "status" in x)?.status;

describe("Notice Board filters from the address", () => {
  it("reads real statuses, and 'waiting' as Waiting for approval", () => {
    expect(noticeStatusOf("PUBLISHED")).toBe("PUBLISHED");
    expect(noticeStatusOf("waiting_approval")).toBe("WAITING_APPROVAL");
    expect(noticeStatusOf("waiting")).toBe("WAITING_APPROVAL");
    expect(noticeStatusOf("nonsense")).toBeNull();
    expect(noticeStatusOf(undefined)).toBeNull();
  });

  it("ignores an unknown status or priority instead of passing it to the database", () => {
    const w = noticeWhere(ctx, true, params({ status: "nonsense", priority: "URGENT" }));
    expect(statusOf(w)).toEqual({ not: "ARCHIVED" });
    expect((w.AND as object[]).some((x) => "priority" in x)).toBe(false);
  });

  it("still filters by a real status, group and priority", () => {
    expect(statusOf(noticeWhere(ctx, true, params({ status: "waiting" })))).toBe("WAITING_APPROVAL");
    expect(statusOf(noticeWhere(ctx, true, params({ group: "archive" })))).toEqual({ in: ["EXPIRED", "ARCHIVED"] });
    expect(statusOf(noticeWhere(ctx, true, params({ group: "toString" })))).toEqual({ not: "ARCHIVED" });
    expect((noticeWhere(ctx, true, params({ priority: "HIGH" })).AND as object[])).toContainEqual({ priority: "HIGH" });
  });
});
