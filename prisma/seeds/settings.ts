// Demo data for Settings: school details, a second campus, custom fields
// with a "show only when" rule, a published custom form, two approval rules,
// and a few requests in Approvals (waiting, decided and asked by a teacher).
// Writes rows directly: the seed runs outside the app, so it does not use
// the server-only helpers.
import { randomUUID } from "node:crypto";
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

    // A few requests in Approvals.
    const days = (n: number) => new Date(Date.now() - n * 86_400_000);
    const asked = (by: string, at: Date, note: string | null) => [{ at: at.toISOString(), by, action: "asked", note }];
    await tx.approval.createMany({
      data: [
        { schoolId: s.schoolId, type: "expense", recordType: "Expense", recordId: randomUUID(), summary: "Lab chemicals for Class 10 practicals", amountPaise: BigInt(1_240_000), reason: "Stock ran out before the board practicals.", askedById: s.users.accountant, currentApproverRole: "principal", step: 2, createdAt: days(1), history: asked(s.users.accountant, days(1), "Stock ran out before the board practicals.") },
        { schoolId: s.schoolId, type: "refund", recordType: "Fee Payment", recordId: randomUUID(), summary: "Refund of bus fee, Aarav Reddy (Class 6 A)", amountPaise: BigInt(350_000), reason: "Family moved closer to school; no bus from July.", askedById: s.users.admin, currentApproverRole: "accountant", step: 1, createdAt: days(3), history: asked(s.users.admin, days(3), "Family moved closer to school; no bus from July.") },
        { schoolId: s.schoolId, type: "concession", recordType: "Student", recordId: randomUUID(), summary: "Sibling discount for Diya Sharma (Class 2 B)", amountPaise: BigInt(600_000), reason: "Elder brother in Class 7.", askedById: s.users.accountant, currentApproverRole: "principal", step: 1, createdAt: days(4), history: asked(s.users.accountant, days(4), "Elder brother in Class 7.") },
        { schoolId: s.schoolId, type: "staff-leave", recordType: "Staff Leave", recordId: randomUUID(), summary: "Casual leave, Ravi Teja, 2 days", reason: "Family function in Warangal.", askedById: s.users.teacher, currentApproverRole: "principal", step: 1, createdAt: days(2), history: asked(s.users.teacher, days(2), "Family function in Warangal.") },
        { schoolId: s.schoolId, type: "expense", recordType: "Expense", recordId: randomUUID(), summary: "Printer cartridges for the office", amountPaise: BigInt(320_000), askedById: s.users.accountant, currentApproverRole: "principal", step: 2, status: "APPROVED", decidedById: s.users.principal, decidedAt: days(5), createdAt: days(6),
          history: [...asked(s.users.accountant, days(6), null), { at: days(5).toISOString(), by: s.users.principal, action: "approve", note: null }] },
        { schoolId: s.schoolId, type: "certificate", recordType: "Certificate", recordId: randomUUID(), summary: "Bonafide certificate, Sai Kiran (Class 9 C)", askedById: s.users.admin, currentApproverRole: "principal", step: 1, status: "REJECTED", decidedById: s.users.principal, decidedAt: days(7), decisionReason: "Fees for Term 1 are still due. Ask the family to clear them first.", createdAt: days(8),
          history: [...asked(s.users.admin, days(8), null), { at: days(7).toISOString(), by: s.users.principal, action: "ask-change", note: "Fees for Term 1 are still due. Ask the family to clear them first." }] },
      ],
    });
  });
};
