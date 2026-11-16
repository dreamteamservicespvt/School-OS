// Live test 16 Nov: "New notice" ({title}) and "Results published" ({exam_name}) could not go to one
// person from Send Message ("has no notice title"). The typed Title now fills both blanks.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { planMessage } from "@/lib/messaging/send";
import { ensureReadyTemplates } from "@/lib/messaging/templates";
import { makeCommSchool, templateId } from "./fixture";

let s: Awaited<ReturnType<typeof makeCommSchool>>;
beforeAll(async () => {
  s = await makeCommSchool();
  await withSchool(s.ctx, (tx) => ensureReadyTemplates(tx, s.ctx));
});

describe("the Title box fills {title} and {exam_name}", () => {
  it("New notice goes to one parent with the typed title", async () => {
    const t = await templateId(s.ctx, "notice", "whatsapp");
    const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { to: { guardiansOf: [s.ravi.id] }, channels: ["whatsapp"], templates: { whatsapp: t }, title: "Sports day on Friday", text: "Please send your child in sports dress.", single: true }));
    expect(plan.problems).toEqual([]);
    expect(plan.rows.length).toBeGreaterThan(0);
    expect(plan.rows[0].text).toContain("Sports day on Friday");
  });
  it("Results published goes to one parent with the typed exam name", async () => {
    const t = await templateId(s.ctx, "result", "whatsapp");
    const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { to: { guardiansOf: [s.ravi.id] }, channels: ["whatsapp"], templates: { whatsapp: t }, title: "Half Yearly Exam", single: true }));
    expect(plan.problems).toEqual([]);
    expect(plan.rows[0].text).toContain("Half Yearly Exam");
  });
});
