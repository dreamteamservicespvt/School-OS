// A school with no SMS, WhatsApp or email connected: admission messages say
// why they were not sent, never "sent" and never blame the parent's number
// (QA PEOPLE-08, PEOPLE-09).
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { createApplication, type ApplicationInput } from "@/lib/admission/applications";
import { rejectDocument, remindMissing } from "@/lib/admission/documents";
import { admissionSchool, applicationInput } from "./fixtures";

let t: Awaited<ReturnType<typeof admissionSchool>>;
let principal: Awaited<ReturnType<typeof t.who>>;
let appId = "";

beforeAll(async () => {
  t = await admissionSchool("No Channel School");
  principal = await t.who(t.principal);
  const app = await withSchool(principal.ctx, (tx) => createApplication(tx, principal.ctx, principal.v, principal.s, applicationInput(t.nextYearId, t.c1) as ApplicationInput, { campusId: t.campusId, channel: "counter" }));
  appId = app.id;
});

describe("admission messages with no channel set up", () => {
  it("the papers reminder names the missing set-up, not the phone number", async () => {
    await expect(withSchool(principal.ctx, (tx) => remindMissing(tx, principal.ctx, principal.v, "Test", appId)))
      .rejects.toThrow("The reminder was not sent. No messaging channel is set up (Settings, SMS, WhatsApp & Email).");
  });

  it("rejecting a paper with 'Message the parent' says the parent was not messaged, and why", async () => {
    const r = await withSchool(principal.ctx, async (tx) => {
      const doc = await tx.applicationDocument.findFirstOrThrow({ where: { applicationId: appId } });
      await tx.applicationDocument.update({ where: { id: doc.id }, data: { status: "RECEIVED" } });
      return rejectDocument(tx, principal.ctx, principal.v, "Test", doc.id, "Photo not clear", true);
    });
    expect(r).toEqual({ told: false, notSent: "No messaging channel is set up (Settings, SMS, WhatsApp & Email)" });
    const log = await withSchool(principal.ctx, (tx) => tx.applicationActivity.findFirst({ where: { applicationId: appId, kind: "document" }, orderBy: { at: "desc" } }));
    expect(log?.text).toContain("Parent not messaged: No messaging channel is set up");
  });
});
