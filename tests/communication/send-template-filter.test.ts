// Send Message offers only templates whose every blank it can fill (layman loop 6, L6-40): bus, salary and
// pass templates are sent by their own modules, and staff ones only to people who may message staff.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { fillableBlanks, offeredOnSend, sendMessageBlanks, takesTypedText, variablesIn } from "@/lib/messaging/blanks";
import { countWithReason } from "@/lib/messaging/skip-words";
import { planMessage } from "@/lib/messaging/send";
import { makeCommSchool, templateId } from "./fixture";

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

// Live test 16 Nov: "New notice" and "General announcement" were not offered, as {message} (the typed
// Message, filled by send.ts) was not counted as a blank Send Message fills.
describe("Send Message offers New notice and General announcement (live test 16 Nov)", () => {
  let s: Awaited<ReturnType<typeof makeCommSchool>>;
  beforeAll(async () => { s = await makeCommSchool(); });

  const offeredNames = (staff: boolean) => withSchool(s.ctx, async (tx) => {
    const templates = await tx.template.findMany({ where: { schoolId: s.ctx.schoolId, archivedAt: null, channel: "whatsapp" }, include: { versions: { where: { isCurrent: true } } } });
    const blanks = sendMessageBlanks(staff);
    return templates.filter((t) => t.versions.length && offeredOnSend(t.versions, blanks)).map((t) => t.name);
  });

  it("a teacher (parents and students only) and an admin (staff too) both get them", async () => {
    for (const staff of [false, true]) {
      const names = await offeredNames(staff);
      expect(names).toContain("New notice");
      expect(names).toContain("General announcement");
      expect(names).toContain("Results published");
      // Still left out: blanks only their own modules fill.
      expect(names).not.toContain("Bus arriving");
      expect(names).not.toContain("Salary slip ready");
    }
    expect(await offeredNames(false)).not.toContain("Message to staff");
    expect(await offeredNames(true)).toContain("Message to staff");
  });

  it("the typed Message fills {message}; with none typed the sender is told to type it", async () => {
    const id = await templateId(s.ctx, "notice", "whatsapp");
    const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { to: { guardianIds: [s.father.id] }, channels: ["whatsapp"], templates: { whatsapp: id }, title: "Diwali holidays", text: "School is closed from 20 to 24 October.", single: true }));
    expect(plan.problems).toEqual([]);
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0].text).toContain("Diwali holidays");
    expect(plan.rows[0].text).toContain("School is closed from 20 to 24 October.");
    const empty = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { to: { guardianIds: [s.father.id] }, channels: ["whatsapp"], templates: { whatsapp: id }, title: "Diwali holidays" }));
    expect(empty.problems.join(" ")).toContain("Type the message. The template \"New notice\" puts it in its {message} blank.");
  });

  it("the form knows which templates need the Message box", () => {
    expect(takesTypedText("Dear Parent, 📌 *{title}* Details: {message}")).toBe(true);
    expect(takesTypedText("Dear {guardian_name}, the exam results are ready. Exam: {exam_name}")).toBe(false);
  });
});
