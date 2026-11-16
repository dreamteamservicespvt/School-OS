// Send Message offers only templates whose every blank it can fill (layman loop 6, L6-40): bus, salary and
// pass templates are sent by their own modules, and staff ones only to people who may message staff.
import { describe, expect, it } from "vitest";
import { fillableBlanks, variablesIn } from "@/lib/messaging/blanks";
import { countWithReason } from "@/lib/messaging/skip-words";

const offered = (body: string, kinds: Parameters<typeof fillableBlanks>[0]) => {
  const ok = new Set([...fillableBlanks(kinds), "parent_link"]);
  return variablesIn(body).every((k) => ok.has(k));
};

describe("Send Message template list (L6-40)", () => {
  it("keeps typed-message templates and leaves out module-only and staff ones for a teacher", () => {
    const teacher = ["parents", "students"] as const;
    expect(offered("Dear {guardian_name}, {student_name} has a holiday on Friday. {school_name}", [...teacher])).toBe(true);
    expect(offered("Dear {guardian_name}, the bus {bus} will reach {stop} in {minutes} minutes.", [...teacher])).toBe(false);
    expect(offered("Dear {staff_name}, your salary slip for {month} is ready.", [...teacher, "staff"])).toBe(false);
    expect(offered("Dear {staff_name}, happy birthday!", [...teacher])).toBe(false);
    expect(offered("Dear {staff_name}, happy birthday!", [...teacher, "staff"])).toBe(true);
  });

  it("says one student in the singular (L6-39)", () => {
    expect(countWithReason(1, "Students get app messages only")).toBe("1 student gets app messages only");
  });
});
