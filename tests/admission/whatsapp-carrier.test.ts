// On a real WhatsApp account a business-started message must be an approved template: plain words
// are refused unless the family wrote in the last 24 hours. Admission messages to families who are
// not yet parents go in the approved General announcement (the typed-announcement carrier), keep
// their plain words in test mode, and say plainly when WhatsApp has not approved it yet.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { encryptSecrets } from "@/lib/messaging/channels";
import { createApplication, sendBack, type ApplicationInput } from "@/lib/admission/applications";
import { remindMissing } from "@/lib/admission/documents";
import { CARRIER_NOT_APPROVED } from "@/lib/admission/notify-parents";
import { EN } from "@/lib/i18n/catalogues/en";
import { hi } from "@/lib/i18n/catalogues/hi";
import { te } from "@/lib/i18n/catalogues/te";
import { admissionSchool, applicationInput } from "./fixtures";

let t: Awaited<ReturnType<typeof admissionSchool>>;
let principal: Awaited<ReturnType<typeof t.who>>;
let appId = "";
let father = "";

beforeAll(async () => {
  t = await admissionSchool("Carrier School");
  principal = await t.who(t.principal);
  await withSchool(principal.ctx, async (tx) => {
    await tx.messagingChannel.create({ data: { schoolId: t.school.id, channel: "whatsapp", provider: "meta-cloud", isOn: true, environment: "live", config: { phoneNumberId: "1", businessAccountId: "2" }, ...encryptSecrets({ accessToken: "token" }) } });
    await tx.creditLedgerEntry.create({ data: { schoolId: t.school.id, channel: "whatsapp", amount: 1000, note: "Test top-up" } });
  });
  const app = await withSchool(principal.ctx, (tx) => createApplication(tx, principal.ctx, principal.v, principal.s, applicationInput(t.nextYearId, t.c1) as ApplicationInput, { campusId: t.campusId, channel: "counter" }));
  appId = app.id;
  father = app.fatherName!;
});

const sentFor = (trigger: string) => withSchool(principal.ctx, (tx) => tx.messageRecipient.findMany({ where: { message: { trigger, sourceId: appId } }, include: { message: { select: { body: true } } }, orderBy: { queuedAt: "asc" } }));

async function approveGeneral() {
  await withSchool(principal.ctx, async (tx) => {
    const g = await tx.template.findFirstOrThrow({ where: { schoolId: t.school.id, key: "general", channel: "whatsapp" } });
    await tx.templateVersion.updateMany({ where: { templateId: g.id }, data: { whatsappStatus: "APPROVED", whatsappName: "t_general" } });
  });
}

describe("admission messages on a real WhatsApp account", () => {
  it("say plainly that WhatsApp has not approved the General announcement yet, and send nothing", async () => {
    const r = await withSchool(principal.ctx, (tx) => sendBack(tx, principal.ctx, principal.v, "Carrier School", appId, "The birth certificate number"));
    expect(r.notSent).toBe("WhatsApp has not approved the General announcement message yet");
    expect(await sentFor("Application details missing")).toHaveLength(0);
    await expect(withSchool(principal.ctx, (tx) => remindMissing(tx, principal.ctx, principal.v, "Carrier School", appId)))
      .rejects.toThrow("The reminder was not sent. WhatsApp has not approved the General announcement message yet.");
    const log = await withSchool(principal.ctx, (tx) => tx.applicationActivity.findFirst({ where: { applicationId: appId, kind: "sent-back" } }));
    expect(log?.text).toContain("(message not sent: WhatsApp has not approved the General announcement message yet)");
  });

  it("go as the approved General announcement, never plain text", async () => {
    await approveGeneral();
    const r = await withSchool(principal.ctx, (tx) => sendBack(tx, principal.ctx, principal.v, "Carrier School", appId, "The birth certificate number"));
    expect(r.notSent).toBeNull();
    const rows = await sentFor("Application details missing");
    expect(rows).toHaveLength(1);
    const row = rows[0];
    const general = await withSchool(principal.ctx, (tx) => tx.templateVersion.findFirstOrThrow({ where: { id: row.templateVersionId ?? "none" }, include: { template: { select: { key: true } } } }));
    expect(general.template.key).toBe("general");
    expect(general.whatsappStatus).toBe("APPROVED");
    const values = row.values as Record<string, string>;
    // The template adds its own greeting, so the family's words go in {message} without "Dear …,".
    expect(values.guardian_name).toBe(father);
    expect(values.message).toMatch(/^application .+ needs a few more details: The birth certificate number\. Please share them with the school office\.$/);
    expect(row.text).toBe(`Dear ${father}, here is a message from Carrier School:\n${values.message}\nPlease contact the school office if you have any questions.`);
    // Message History keeps the words the school wrote.
    expect(row.message.body).toMatch(/^Dear .+, application .+ needs a few more details/);

    await withSchool(principal.ctx, (tx) => remindMissing(tx, principal.ctx, principal.v, "Carrier School", appId));
    const reminder = (await sentFor("Missing admission papers"))[0];
    expect(reminder.templateVersionId).toBe(row.templateVersionId);
    expect((reminder.values as Record<string, string>).message).toMatch(/please bring: /);
  });

  it("keep their plain words in test mode", async () => {
    await withSchool(principal.ctx, (tx) => tx.messagingChannel.update({ where: { schoolId_channel: { schoolId: t.school.id, channel: "whatsapp" } }, data: { environment: "test" } }));
    await withSchool(principal.ctx, (tx) => sendBack(tx, principal.ctx, principal.v, "Carrier School", appId, "The child's blood group"));
    const rows = await sentFor("Application details missing");
    const last = rows[rows.length - 1];
    expect(last.templateVersionId).toBeNull();
    expect(last.text).toMatch(/^Dear .+, application .+ needs a few more details: The child's blood group\./);
    await withSchool(principal.ctx, (tx) => tx.messagingChannel.update({ where: { schoolId_channel: { schoolId: t.school.id, channel: "whatsapp" } }, data: { environment: "live" } }));
  });

  it("the reason is in the catalogues, in Hindi and Telugu too", () => {
    expect(EN).toContain(CARRIER_NOT_APPROVED);
    expect(hi[CARRIER_NOT_APPROVED]).toBeTruthy();
    expect(te[CARRIER_NOT_APPROVED]).toBeTruthy();
  });
});
