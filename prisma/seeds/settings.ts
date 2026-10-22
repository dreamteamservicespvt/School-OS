// Demo data for Settings: school details, a second campus, custom fields
// with a "show only when" rule, a published custom form and two approval
// rules. Writes rows directly. The requests in Approvals are made by each
// module's seed through the app, so every one points at a real record (QA
// SEED-03): leave in staff-hr.ts and attendance.ts, a concession and a refund
// in fees-finance.ts, expenses, outing passes, purchases and so on.
import { withSchool } from "../../src/lib/db";
import type { ModuleSeed } from "./types";

export const seedSettings: ModuleSeed = async (s) => {
  await withSchool(s.ctx, async (tx) => {
    await tx.school.update({
      where: { id: s.schoolId },
      data: {
        phone: s.full ? "4023456789" : "4027654321",
        email: s.full ? "office@sunriseschool.edu.in" : "office@greenvalley.edu.in",
        website: s.full ? "www.sunriseschool.edu.in" : null,
        brandColor: s.full ? "#1d4ed8" : "#15803d",
        affiliationNumber: s.full ? "3630214" : null,
        languages: ["en", "te", "hi"],
        preferences: { weekStart: "monday", rollNumberOrder: "name", compliance: { udiseCode: s.full ? "36220100512" : null } },
      },
    });
    if (!s.full) return;

    await tx.campus.create({ data: { schoolId: s.schoolId, name: "Kondapur Junior Wing", address: "Plot 14, Kondapur, Hyderabad", phone: "4023456790", headName: "Mrs. Kavitha Rao" } });

    // Custom fields on Student: a yes-or-no field and one shown only when it is Yes.
    await tx.customField.createMany({
      data: [
        { schoolId: s.schoolId, recordType: "student", key: "uses_school_bus", label: "Uses school bus", fieldType: "yesno", sortOrder: 0 },
        { schoolId: s.schoolId, recordType: "student", key: "bus_pass_number", label: "Bus pass number", fieldType: "text", sortOrder: 1, showWhen: { fieldKey: "uses_school_bus", equals: "yes" } },
        { schoolId: s.schoolId, recordType: "student", key: "house", label: "House", fieldType: "choice", choices: ["Red", "Blue", "Green", "Yellow"], sortOrder: 2 },
        { schoolId: s.schoolId, recordType: "staff", key: "blood_donor", label: "Willing to donate blood", fieldType: "yesno", sortOrder: 0, visibility: "restricted" },
      ],
    });

    await tx.customForm.create({
      data: {
        schoolId: s.schoolId,
        name: "Teacher appraisal",
        description: "Filled in by the Principal for each teacher at the end of the year.",
        aboutType: "staff",
        status: "published",
        version: 1,
        publishedAt: new Date(),
        createdById: s.users.principal,
        updatedById: s.users.principal,
        fields: [
          { key: "teaching_quality", label: "Teaching quality", fieldType: "choice", required: true, choices: ["Good", "Average", "Needs help"], showWhen: null, help: null },
          { key: "support_plan", label: "Support plan", fieldType: "text", required: true, choices: [], showWhen: { fieldKey: "teaching_quality", equals: "Needs help" }, help: "What help the school will give, and by when." },
          { key: "remarks", label: "Remarks", fieldType: "text", required: false, choices: [], showWhen: null, help: null },
        ],
      },
    });

    // Approval rules: refunds and concessions by amount.
    await tx.approvalRule.createMany({
      data: [
        { schoolId: s.schoolId, requestType: "refund", steps: [{ approverRole: "accountant", upToPaise: "500000" }, { approverRole: "principal", upToPaise: null }], escalateAfterDays: 2, updatedById: s.users.admin },
        { schoolId: s.schoolId, requestType: "concession", steps: [{ approverRole: "principal", upToPaise: null }], escalateAfterDays: 3, updatedById: s.users.admin },
      ],
    });
  });
};
