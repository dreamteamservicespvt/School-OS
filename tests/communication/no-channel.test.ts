// A school with no WhatsApp, SMS or email connected (QA PEOPLE-16): an app
// notice to parents reaches those with a Parent Link (live test 16 Nov), and
// says plainly that the others have none, instead of promising WhatsApp, SMS
// or email that is not there.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { planMessage } from "@/lib/messaging";
import { NO_PARENT_LINK_YET } from "@/lib/messaging/send";
import { createLink, sendLinksOnAdmission } from "@/lib/parent-link/links";
import { makeCommSchool } from "./fixture";

let off: Awaited<ReturnType<typeof makeCommSchool>>;
let on: Awaited<ReturnType<typeof makeCommSchool>>;
beforeAll(async () => {
  off = await makeCommSchool({ channelsOn: false, credits: 0 });
  on = await makeCommSchool();
});

describe("app notice to parents", () => {
  // Live test 16 Nov: an app notice now reaches a parent's own Parent Link ("Messages from the school").
  it("leaves out parents with no Parent Link yet, saying why, when nothing is connected", async () => {
    const plan = await withSchool(off.ctx, (tx) => planMessage(tx, off.ctx, { to: { kinds: ["parents"], sectionIds: [off.a.id] }, channels: ["app"], title: "PTM", text: "PTM on Saturday." }));
    expect(plan.people).toBe(0);
    expect(plan.skipped.map((g) => g.reason)).toContain(NO_PARENT_LINK_YET);
  });

  it("reaches a parent with a Parent Link, with or without WhatsApp and email", async () => {
    for (const s of [off, on]) {
      await withSchool(s.ctx, (tx) => createLink(tx, s.ctx, s.father.id));
      const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { to: { kinds: ["parents"], sectionIds: [s.a.id] }, channels: ["app"], title: "PTM", text: "PTM on Saturday." }));
      expect(plan.rows.map((r) => [r.candidate.name, r.channel, r.address])).toEqual([["Srinivas Kumar", "app", s.father.id]]);
      expect(plan.skipped.find((g) => g.reason === NO_PARENT_LINK_YET)?.count).toBeGreaterThan(0);
    }
  });
});

describe("Parent Link on admission (QA PEOPLE-22)", () => {
  it("makes the links but does not mark them sent when nothing is connected", async () => {
    const r = await withSchool(off.ctx, (tx) => sendLinksOnAdmission(tx, off.ctx, off.anil.id));
    expect(r.made).toBe(1);
    const link = await withSchool(off.ctx, (tx) => tx.parentLink.findFirstOrThrow({ where: { guardianId: off.optFather.id } }));
    expect(link.lastSentAt).toBeNull();
  });

  it("marks them sent when a channel is connected", async () => {
    const r = await withSchool(on.ctx, (tx) => sendLinksOnAdmission(tx, on.ctx, on.anil.id));
    expect(r.made).toBe(1);
    const link = await withSchool(on.ctx, (tx) => tx.parentLink.findFirstOrThrow({ where: { guardianId: on.optFather.id } }));
    expect(link.lastSentAt).not.toBeNull();
  });
});
