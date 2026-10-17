// QA (Chaitanya EM School audit), plain words for refusals:
// PLATFORM-06: a refused server action reached the generic "could not open" page; the
//   refusal now carries a digest the error page recognises (production hides messages).
// PLATFORM-11: "Approved" appeared twice in the audit log's Action filter.
// PLATFORM-15: a report closed by a school feature said "not open to your role".
import { describe, expect, it } from "vitest";
import { NO_PERMISSION_DIGEST, PermissionDeniedError } from "@/lib/permissions";
import { actionWords } from "@/lib/data-security/audit-view";
import { closedWords, featureOff, findEntry } from "@/lib/reports/catalogue";
import type { ReportAccess } from "@/lib/reports/access";

describe("refusals in plain words", () => {
  it("a permission refusal carries a digest naming the module", () => {
    const e = new PermissionDeniedError("fee-management");
    expect(e.digest).toBe(`${NO_PERMISSION_DIGEST}fee-management`);
  });

  it("the two kinds of approval read differently in the audit log", () => {
    expect(actionWords("approved")).not.toBe(actionWords("approval-approve"));
  });

  it("says a school feature is off, not the role, when only the feature closes a report", () => {
    const entry = findEntry("at-overtime")!;
    const who = {
      features: new Set<string>(),
      permissions: { "attendance-management": { see: "all" } },
      roles: [],
      modulesOn: new Set<string>(),
    } as never;
    const access = { cats: [entry.category], own: false, roleKeys: ["school-admin"], full: true, staffAttendance: true } as unknown as ReportAccess;
    expect(closedWords(entry, access, who)).toMatch(/switched off for your school/);
    expect(closedWords(entry, access, who)).not.toMatch(/your role/);
    // The page names the feature, the school, and who switches it on where.
    const off = featureOff(entry, access, who, "Chaitanya EM School")!;
    expect(off.features).toEqual(["attendance-overtime"]);
    expect(off.title).toBe("“Overtime and shifts” is switched off for Chaitanya EM School");
    expect(off.body).toMatch(/needs Overtime\. The Principal or School Admin can switch it on in Attendance Settings/);
    const noStaff = { ...access, staffAttendance: false } as ReportAccess;
    expect(closedWords(entry, noStaff, who)).toMatch(/not open to your role/);
    expect(featureOff(entry, noStaff, who)).toBeNull();
  });

  it("names Finance Settings for a finance report closed by its feature", () => {
    const entry = findEntry("fi-budget")!;
    const who = { features: new Set<string>(), permissions: { "finance-management": { see: "all", change: "all" } }, roles: [], modulesOn: new Set<string>() } as never;
    const access = { cats: [entry.category], own: false, roleKeys: ["school-admin"], full: true, finance: "full" } as unknown as ReportAccess;
    expect(featureOff(entry, access, who)?.body).toMatch(/needs Budget\. .* in Finance Settings/);
  });
});
