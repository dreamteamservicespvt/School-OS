// A school with no WhatsApp, SMS or email connected (QA PEOPLE-16): an app
// notice to parents says they will not get it, instead of promising WhatsApp,
// SMS or email that is not there.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { planMessage } from "@/lib/messaging";
import { sendLinksOnAdmission } from "@/lib/parent-link/links";
import { makeCommSchool } from "./fixture";

let off: Awaited<ReturnType<typeof makeCommSchool>>;
let on: Awaited<ReturnType<typeof makeCommSchool>>;
beforeAll(async () => {
  off = await makeCommSchool({ channelsOn: false, credits: 0 });
  on = await makeCommSchool();
});

describe("app notice to parents", () => {
  it("says parents will not get it when nothing is connected", async () => {
    const plan = await withSchool(off.ctx, (tx) => planMessage(tx, off.ctx, { to: { kinds: ["parents"], sectionIds: [off.a.id] }, channels: ["app"], text: "PTM on Saturday." }));
    expect(plan.people).toBe(0);
    expect(plan.skipped.map((g) => g.reason)).toContain("Parents have no app, and WhatsApp, SMS and email are not connected, so they will not get it");
  });

  it("points to WhatsApp, SMS or email when one is connected", async () => {
    const plan = await withSchool(on.ctx, (tx) => planMessage(tx, on.ctx, { to: { kinds: ["parents"], sectionIds: [on.a.id] }, channels: ["app"], text: "PTM on Saturday." }));
    expect(plan.skipped.map((g) => g.reason)).toContain("Parents have no app; they get WhatsApp, SMS or email");
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
