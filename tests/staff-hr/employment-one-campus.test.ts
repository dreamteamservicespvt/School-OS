// Owner live test, 14 Nov 2026: in a one-campus school the Employment edit has no Campus field, and saving it
// said "Required", so nobody could change a staff member's post there.
import { describe, expect, it } from "vitest";
import { parseForm } from "@/lib/forms";
import { employmentSchema } from "@/lib/staff/schemas";

const form = (extra: Record<string, string> = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ staffCode: "ST-009", joiningDate: "2026-11-13", designation: "School Administrator", departmentId: "", employmentType: "Permanent", reportingToId: "", ...extra })) fd.set(k, v);
  return fd;
};

describe("Employment edit", () => {
  it("saves in a one-campus school, where the form has no Campus field", () => {
    const r = parseForm(employmentSchema, form());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.campusId ?? null).toBeNull();
  });

  it("still checks a campus when one is sent", () => {
    expect(parseForm(employmentSchema, form({ campusId: "not-an-id" })).ok).toBe(false);
  });
});
