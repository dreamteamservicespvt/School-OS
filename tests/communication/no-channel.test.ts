// A school with no WhatsApp, SMS or email connected (QA PEOPLE-16): an app
// notice to parents says they will not get it, instead of promising WhatsApp,
// SMS or email that is not there.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { planMessage } from "@/lib/messaging";
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
