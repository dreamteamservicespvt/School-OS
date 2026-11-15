// Adopt item 10 (docs/research/inkwelly-2026-11-15.md): Send Message shows the
// live count of people and the credit cost right under the audience buttons,
// from the same preview as "Check and send" (P4): a section reaches fewer
// parents than its class, opted-out parents are left out, and Test mode uses
// no credits.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { planMessage } from "@/lib/messaging/send";
import { previewOf, readAudienceForm } from "@/lib/communication/send-form";
import { audienceLine } from "@/app/(school)/communication/audience-line";
import { makeCommSchool } from "./fixture";

let s: Awaited<ReturnType<typeof makeCommSchool>>;

beforeAll(async () => {
  s = await makeCommSchool();
}, 120_000);

/** The line as Send Message works it out from the form's audience fields. */
async function lineFor(fields: [string, string][]) {
  const form = new FormData();
  for (const [k, v] of fields) form.append(k, v);
  const to = readAudienceForm(form)!;
  const input = { to, channels: ["whatsapp" as const], text: "PTM on Saturday at 9 AM." };
  const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, input));
  const p = previewOf(plan, input);
  const credits = p.cost.filter((c) => !c.test).reduce((a, c) => a + c.credits, 0);
  const line = audienceLine({ checking: false, ready: true, people: p.people, noun: p.people === 1 ? "parent" : "parents", credits, upTo: false, test: p.testMode.length > 0 && !credits, free: false, leftOut: p.skipped.reduce((a, g) => a + g.count, 0) });
  return { people: p.people, line };
}

describe("audience count under Who gets it", () => {
  it("counts a section, a class and the whole school as the preview does", async () => {
    const section = await lineFor([["kinds", "parents"], ["sectionIds", s.a.id]]);
    const cls = await lineFor([["kinds", "parents"], ["classIds", s.cls.id]]);
    // 5 A: Ravi's father and Priya's mother; Anil's father opted out.
    expect(section.people).toBe(2);
    expect(section.line).toBe("2 parents · no credits (Test mode) · 1 left out");
    // Class 5: also 5 B's other father; Sita's parents are Ravi's, told once.
    expect(cls.people).toBe(3);
    expect(cls.line).toBe("3 parents · no credits (Test mode) · 1 left out");
  });

  it("says the credit cost when credits are used, and nothing before the audience is complete", () => {
    expect(audienceLine({ checking: false, ready: true, people: 1181, noun: "parents", credits: 1181, upTo: false, test: false, free: false, leftOut: 0 })).toBe("1,181 parents · 1,181 credits");
    expect(audienceLine({ checking: false, ready: true, people: 12, noun: "staff", credits: 0, upTo: false, test: false, free: true, leftOut: 0 })).toBe("12 staff · free");
    expect(audienceLine({ checking: false, ready: true, people: 40, noun: "parents", credits: 40, upTo: true, test: false, free: false, leftOut: 2 })).toBe("40 parents · up to 40 credits · 2 left out");
    expect(audienceLine({ checking: false, ready: true, people: 0, noun: "parents", credits: 0, upTo: false, test: false, free: false, leftOut: 0 })).toBe("Nobody to send to");
    expect(audienceLine({ checking: true, ready: true, people: null, noun: "parents", credits: 0, upTo: false, test: false, free: false, leftOut: 0 })).toBe("Counting…");
    expect(audienceLine({ checking: false, ready: false, people: 5, noun: "parents", credits: 5, upTo: false, test: false, free: false, leftOut: 0 })).toBeNull();
  });
});
