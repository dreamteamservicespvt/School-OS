// G07: a message to a parent is never lost silently. Each person gets it on a
// channel that can really carry it: SMS only from a template with a DLT
// template ID (typed words go inside "General announcement (SMS)"), and on a
// real WhatsApp account only templates WhatsApp approved. When nothing can
// carry it the sender is told before sending, and the person is kept on the
// message as "Not sent" with the reason, counted on the Dashboard and resent
// once a channel can carry it. No template blank reaches a parent unfilled,
// and one phone gets one message per send.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { withSchool, type SchoolContext } from "@/lib/db";
import "@/lib/messaging/jobs";
import { runDueJobs } from "@/lib/jobs";
import { NOT_SENT, planMessage, sendAutomatic, sendMessage } from "@/lib/messaging";
import { deliverMessage, retryableFailures } from "@/lib/messaging/deliver";
import { resend } from "@/lib/messaging/resend";
import { SYSTEM_SCOPE } from "@/lib/messaging/recipients";
import { READY_TEMPLATES, render, sampleValues, strayBraces, unknownVariables } from "@/lib/messaging/templates";
import { notDeliveredCount } from "@/lib/dashboard/widgets/communication";
import { sendDueReminders } from "@/lib/events/events";
import { diaryText } from "@/lib/events/daily";
import { certificateText } from "@/lib/events/cocurricular";
import { accessIn } from "@/lib/auth/access";
import { buildHome } from "@/lib/dashboard/compose";
import type { Current } from "@/lib/current";
import { addDlt, makeCommSchool, templateId } from "./fixture";

type School = Awaited<ReturnType<typeof makeCommSchool>>;

afterEach(() => vi.unstubAllGlobals());

async function runAll() {
  for (let i = 0; i < 10; i++) if ((await runDueJobs(50)) === 0) break;
}

const turn = (s: School, channel: string, data: Record<string, unknown>) =>
  withSchool(s.ctx, (tx) => tx.messagingChannel.update({ where: { schoolId_channel: { schoolId: s.school.id, channel } }, data }));

/** WhatsApp on a real account (Meta Cloud API, live). The fetch stub stands in for WhatsApp. */
const goLive = (s: School) => turn(s, "whatsapp", { provider: "meta-cloud", environment: "live", config: { phoneNumberId: "100", businessAccountId: "200" } });

async function approve(s: School, key: string, name: string) {
  const id = await templateId(s.ctx, key, "whatsapp");
  await withSchool(s.ctx, (tx) => tx.templateVersion.updateMany({ where: { templateId: id, isCurrent: true }, data: { whatsappStatus: "APPROVED", whatsappName: name } }));
}

describe("typed text when WhatsApp is off (events, diary, gallery, consent, PTM summary)", () => {
  let s: School;
  beforeAll(async () => {
    s = await makeCommSchool();
    await turn(s, "whatsapp", { isOn: false });
    await turn(s, "email", { isOn: false });
  });

  const typed = (s: School) => ({ to: { guardiansOf: [s.ravi.id, s.priya.id] }, channels: "preferred" as const, text: `Dear Parent, the Annual Day is on Saturday. - ${s.school.name}`, title: "Annual Day" });

  it("says before sending that nobody can get it, and why, instead of failing on SMS", async () => {
    const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, typed(s)));
    expect(plan.problems).toEqual([]);
    expect(plan.rows).toHaveLength(0);
    expect(plan.notSent).toHaveLength(2);
    const g = plan.skipped.find((x) => x.notSent)!;
    expect(g.count).toBe(2);
    expect(g.reason).toMatch(/^Not sent: WhatsApp and email are not connected; a typed SMS goes only in the "General announcement \(SMS\)" template, which has no DLT template ID$/);
    await expect(withSchool(s.ctx, (tx) => sendMessage(tx, s.ctx, typed(s)))).rejects.toThrow(/^Nobody would get this message\. Not sent: WhatsApp and email are not connected/);
  });

  it("a message the software sends by itself is kept as Not sent, counted on the Dashboard, and resent once SMS can carry it", async () => {
    const before = await withSchool(s.ctx, (tx) => notDeliveredCount(tx, new Date()));
    const r = await withSchool(s.ctx, (tx) => sendMessage(tx, s.ctx, { ...typed(s), onNobody: "record" }));
    expect(r).toMatchObject({ people: 0, queued: 0, notSent: 2 });
    const rows = await withSchool(s.ctx, (tx) => tx.messageRecipient.findMany({ where: { messageId: r.messageId } }));
    expect(rows).toHaveLength(2);
    expect(rows.every((x) => x.status === "FAILED" && x.failReason!.startsWith(NOT_SENT) && x.credits === 0)).toBe(true);
    const msg = await withSchool(s.ctx, (tx) => tx.message.findUniqueOrThrow({ where: { id: r.messageId } }));
    expect(msg.status).toBe("SENT");
    expect(msg.skipped).toEqual([]);
    const after = await withSchool(s.ctx, (tx) => notDeliveredCount(tx, new Date()));
    expect(after.count - before.count).toBe(2);
    expect(after.notSent - before.notSent).toBe(2);
    // Retry on the same channel would fail the same way: they are resent by the best channel instead.
    const retry = await withSchool(s.ctx, (tx) => retryableFailures(tx, s.ctx, r.messageId));
    expect(retry).toMatchObject({ rows: [], notSent: 2 });

    // The school adds the DLT template ID: the typed words go inside "General announcement (SMS)".
    await addDlt(s.ctx, "general");
    const again = await withSchool(s.ctx, (tx) => resend(tx, s.ctx, r.messageId, "failed", "preferred", SYSTEM_SCOPE));
    expect(again.people).toBe(2);
    const sms = await withSchool(s.ctx, (tx) => tx.messageRecipient.findMany({ where: { messageId: again.messageId } }));
    expect(sms.map((x) => x.channel)).toEqual(["sms", "sms"]);
    expect(sms.every((x) => x.templateVersionId)).toBe(true);
    // One greeting and one school name, not two.
    expect(sms[0].text).toBe(`Dear Parent, the Annual Day is on Saturday. - ${s.school.name}`);
    expect((await withSchool(s.ctx, (tx) => notDeliveredCount(tx, new Date()))).count).toBe(before.count);
  });

  it("email carries it to a parent with an email address when WhatsApp and SMS cannot", async () => {
    await turn(s, "sms", { isOn: false });
    await turn(s, "email", { isOn: true });
    await withSchool(s.ctx, (tx) => tx.guardian.update({ where: { id: s.father.id }, data: { email: "srinivas@example.com" } }));
    try {
      const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, typed(s)));
      expect(plan.rows.map((r) => [r.candidate.name, r.channel])).toEqual([["Srinivas Kumar", "email"]]);
      // Padma has no email: email works, so this is her missing address, not the school's setup.
      expect(plan.skipped).toEqual([expect.objectContaining({ reason: "No email address", names: ["Padma Reddy"] })]);
    } finally {
      await turn(s, "sms", { isOn: true });
      await turn(s, "email", { isOn: false });
    }
  });
});

describe("an event reminder that cannot go does not stop the others", () => {
  it("records it as Not sent on the event and carries on", async () => {
    const s = await makeCommSchool({ channelsOn: false, credits: 0 });
    const make = (name: string) => withSchool(s.ctx, (tx) => tx.event.create({ data: { schoolId: s.school.id, academicYearId: s.year.id, number: `EV-${randomUUID().slice(0, 6)}`, name, type: "Event", date: new Date("2026-10-16T00:00:00Z"), startMin: 600, audienceKind: "classes", classIds: [s.cls.id], audienceLabel: "Class 5" } }));
    const broken = await make("{Annual Day");
    const plain = await make("Sports Day");
    const sent = await withSchool(s.ctx, (tx) => sendDueReminders(tx, s.ctx, "2026-10-15", 19));
    expect(sent).toBe(1);
    const events = await withSchool(s.ctx, (tx) => tx.event.findMany({ where: { id: { in: [broken.id, plain.id] } }, include: { reminders: true } }));
    for (const e of events) expect(e.reminderSentAt).not.toBeNull();
    const b = events.find((e) => e.id === broken.id)!;
    expect(b.reminders[0].note).toMatch(/^Automatic reminder not sent: The message has a blank that cannot be filled: \{/);
    const p = events.find((e) => e.id === plain.id)!;
    expect(p.reminders[0]).toMatchObject({ people: 0 });
    expect(p.reminders[0].note).toMatch(/not sent it: WhatsApp, SMS and email are not connected/);
    const rows = await withSchool(s.ctx, (tx) => tx.messageRecipient.findMany({ where: { messageId: p.reminders[0].messageId! } }));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.status === "FAILED" && r.failReason!.startsWith(NOT_SENT))).toBe(true);
  });
});

describe("a real WhatsApp account: only approved templates", () => {
  let s: School;
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  beforeAll(async () => {
    s = await makeCommSchool();
    await goLive(s);
  });
  // Back to test mode, so no later test ever calls WhatsApp for this school.
  afterAll(() => turn(s, "whatsapp", { environment: "test", provider: "sandbox" }));
  const stubWhatsapp = () => vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST" && String(url).endsWith("/messages")) {
      sent.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ messages: [{ id: `wamid.${sent.length}` }] }), { status: 200 });
    }
    return new Response("{}", { status: 500 });
  }));

  it("an automatic message whose WhatsApp template is not approved goes by SMS, or is kept as Not sent", async () => {
    const event = { key: `attendance:2026-10-09:${s.ravi.id}`, label: "Absent on 09-10-2026" };
    const absent = () => withSchool(s.ctx, (tx) => sendAutomatic(tx, s.ctx, { rule: "absence", event, to: { guardiansOf: [s.ravi.id] }, perStudent: { [s.ravi.id]: {} } }));
    const first = await absent();
    expect(first.status).toBe("not-sent");
    if (first.status !== "not-sent") return;
    expect(first.reason).toMatch(/WhatsApp has not approved the template "Absent today" yet/);
    expect(first.reason).toMatch(/"Absent today \(SMS\)" has no DLT template ID/);
    const log = () => withSchool(s.ctx, (tx) => tx.automationLog.findFirstOrThrow({ where: { eventKey: event.key } }));
    expect(await log()).toMatchObject({ outcome: "not-sent", messageId: first.result!.messageId });
    // The same event again is not recorded twice.
    const count = () => withSchool(s.ctx, (tx) => tx.message.count({ where: { ruleKey: "absence", trigger: event.label } }));
    expect(await count()).toBe(1);
    expect((await absent()).status).toBe("not-sent");
    expect(await count()).toBe(1);
    // With the SMS template's DLT template ID, the same event reaches the parent by SMS.
    await addDlt(s.ctx, "absence");
    const second = await absent();
    expect(second.status).toBe("sent");
    if (second.status !== "sent") return;
    const rows = await withSchool(s.ctx, (tx) => tx.messageRecipient.findMany({ where: { messageId: second.result.messageId } }));
    expect(rows.map((r) => r.channel)).toEqual(["sms"]);
    expect(await log()).toMatchObject({ outcome: "sent", messageId: second.result.messageId });
  });

  it("an approved template goes as a WhatsApp template message", async () => {
    stubWhatsapp();
    await approve(s, "absence", "absent_today_1");
    const r = await withSchool(s.ctx, (tx) => sendAutomatic(tx, s.ctx, { rule: "absence", event: { key: `attendance:2026-10-10:${s.ravi.id}`, label: "Absent on 10-10-2026" }, to: { guardiansOf: [s.ravi.id] }, perStudent: { [s.ravi.id]: {} } }));
    expect(r.status).toBe("sent");
    if (r.status !== "sent") return;
    await withSchool(s.ctx, (tx) => deliverMessage(tx, s.ctx, { messageId: r.result.messageId, round: "0", chunk: 0 }));
    const row = await withSchool(s.ctx, (tx) => tx.messageRecipient.findFirstOrThrow({ where: { messageId: r.result.messageId } }));
    expect(row).toMatchObject({ channel: "whatsapp", status: "SENT" });
    expect(sent.at(-1)!.body).toMatchObject({ type: "template", template: { name: "absent_today_1" } });
  });

  it("typed words ride the approved General announcement template, never plain text", async () => {
    stubWhatsapp();
    const input = { to: { guardiansOf: [s.ravi.id] }, channels: ["whatsapp" as const], text: `Dear Parent, school closes at noon today. - ${s.school.name}` };
    const before = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, input));
    expect(before.rows).toHaveLength(0);
    expect(before.skipped[0].reason).toMatch(/a typed WhatsApp message goes only in the "General announcement" template, which WhatsApp has not approved yet/);
    await approve(s, "general", "general_announcement_1");
    const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, input));
    expect(plan.rows[0].text).toBe(`Dear Srinivas Kumar, school closes at noon today. - ${s.school.name}`);
    expect(plan.rows[0].values.message).toBe("school closes at noon today.");
    const r = await withSchool(s.ctx, (tx) => sendMessage(tx, s.ctx, input));
    await withSchool(s.ctx, (tx) => deliverMessage(tx, s.ctx, { messageId: r.messageId, round: "0", chunk: 0 }));
    const body = sent.at(-1)!.body as { type: string; template: { name: string; components: { parameters: { text: string }[] }[] } };
    expect(body.type).toBe("template");
    expect(body.template.name).toBe("general_announcement_1");
    expect(body.template.components[0].parameters.map((p) => p.text)).toEqual(["Srinivas Kumar", "school closes at noon today.", s.school.name]);
  });
});

describe("no blank reaches a parent unfilled", () => {
  let s: School;
  beforeAll(async () => { s = await makeCommSchool(); });

  it("every ready template fills completely with known blanks", () => {
    for (const t of READY_TEMPLATES) {
      for (const [lang, text] of Object.entries(t.texts)) {
        expect(unknownVariables(text), `${t.name} (${lang})`).toEqual([]);
        const r = render(text, sampleValues);
        expect(r.ok, `${t.name} (${lang})`).toBe(true);
        if (r.ok) expect(strayBraces(r.text), `${t.name} (${lang})`).toEqual([]);
      }
      if (t.subject) expect(strayBraces((render(t.subject, sampleValues) as { text: string }).text)).toEqual([]);
    }
  });

  it("the class diary and certificate messages fill without stray braces", () => {
    const diary = render(diaryText("Meena Iyer", "UKG A"), { diary: "Ravi’s day, Mon 5 Oct: Clay modelling, enjoyed it." });
    expect(diary).toEqual({ ok: true, text: "Ravi’s day, Mon 5 Oct: Clay modelling, enjoyed it. – Meena Iyer, UKG A" });
    const cert = render(certificateText("Sunrise School"), { child: "Ravi", certificate: "an achievement certificate for Chess (1st)" });
    expect(cert.ok && strayBraces(cert.text)).toEqual([]);
    expect(cert.ok && cert.text).toContain("Ravi has been given an achievement certificate for Chess (1st)");
  });

  it("refuses a message with a blank that cannot be filled, naming it", async () => {
    const input = { to: { guardiansOf: [s.ravi.id] }, channels: ["whatsapp" as const], text: "Dear {Parent Name}, the bus is late." };
    const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, input));
    expect(plan.problems[0]).toMatch(/blank that cannot be filled: \{Parent Name\}/);
    await expect(withSchool(s.ctx, (tx) => sendMessage(tx, s.ctx, input))).rejects.toThrow(/\{Parent Name\}/);
    // A doubled blank leaves braces round the value: refused too.
    const doubled = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { ...input, text: "{{student_name}} was absent." }));
    expect(doubled.problems[0]).toMatch(/cannot be filled: \{\{student_name\}\}/);
  });

  it("skips a person whose title blank has no value, instead of sending the braces", async () => {
    const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { to: { guardiansOf: [s.ravi.id] }, channels: ["app", "whatsapp"], text: "Fees are due.", title: "Fees for {due_amount}" }));
    expect(plan.rows).toHaveLength(0);
    expect(plan.skipped[0].reason).toBe("Has no due amount");
  });
});

describe("one message per phone per send", () => {
  let s: School;
  beforeAll(async () => { s = await makeCommSchool(); });

  it("two guardian records with one number get one message", async () => {
    await withSchool(s.ctx, (tx) => tx.guardian.update({ where: { id: s.mother.id }, data: { phone: s.father.phone } }));
    try {
      const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { to: { guardiansOf: [s.ravi.id], allGuardians: true }, channels: ["whatsapp"], text: "Hello {guardian_name}, the PTM is on Saturday." }));
      expect(plan.rows.map((r) => r.text)).toEqual(["Hello Srinivas Kumar, the PTM is on Saturday."]);
      expect(plan.skipped).toEqual([expect.objectContaining({ reason: "Same number as Srinivas Kumar", names: ["Lakshmi Kumar"] })]);
      expect(plan.cost.whatsapp).toBe(1);
    } finally {
      await withSchool(s.ctx, (tx) => tx.guardian.update({ where: { id: s.mother.id }, data: { phone: "9123456781" } }));
    }
  });

  it("brothers and sisters on one phone get one message naming them all", async () => {
    const wa = await templateId(s.ctx, "result", "whatsapp");
    const r = await withSchool(s.ctx, (tx) => sendAutomatic(tx, s.ctx, {
      rule: "result", event: { key: `result:hy:${randomUUID()}`, label: "Half Yearly results" },
      to: { guardiansOf: [s.ravi.id, s.sita.id] }, values: { exam_name: "Half Yearly Exam" },
      perStudent: { [s.ravi.id]: { exam_name: "Half Yearly Exam" }, [s.sita.id]: { exam_name: "Half Yearly Exam" } },
    }));
    expect(r.status).toBe("sent");
    if (r.status !== "sent") return;
    const rows = await withSchool(s.ctx, (tx) => tx.messageRecipient.findMany({ where: { messageId: r.result.messageId } }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ studentId: null, templateVersionId: expect.any(String) });
    expect(rows[0].text).toContain("Ravi Kumar and Sita Kumar");
    const log = await withSchool(s.ctx, (tx) => tx.automationLog.findMany({ where: { messageId: r.result.messageId } }));
    expect(log.map((l) => l.recipientKey).sort()).toEqual([`guardian:${s.father.id}:${s.ravi.id}`, `guardian:${s.father.id}:${s.sita.id}`].sort());
    expect(wa).toBeTruthy();
  });

  it("each child's own amount still goes in its own message", async () => {
    const wa = await templateId(s.ctx, "fee-due", "whatsapp");
    const same = { due_amount: "₹5,000", due_date: "15-10-2026" };
    const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { to: { guardiansOf: [s.ravi.id, s.sita.id] }, channels: ["whatsapp"], templates: { whatsapp: wa }, perStudent: { [s.ravi.id]: same, [s.sita.id]: same } }));
    expect(plan.rows).toHaveLength(2);
    expect(plan.rows.map((r) => r.studentId).sort()).toEqual([s.ravi.id, s.sita.id].sort());
  });
});

describe("Messages not delivered on the Dashboard", () => {
  const currentFor = async (s: School, userId: string) => {
    const access = await accessIn(userId, s.school.id);
    return { ...access!, ctx: { schoolId: s.school.id, userId }, user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null } as unknown as Current;
  };
  const attention = async (s: School, userId: string) => (await buildHome(await currentFor(s, userId), { now: new Date() })).attention.map((a) => a.id);

  it("shows the Principal this school's undelivered messages only, and not a teacher", async () => {
    const s = await makeCommSchool({ channelsOn: false, credits: 0 });
    const other = await makeCommSchool({ channelsOn: false, credits: 0 });
    // Only the other school has a message that could not go.
    await withSchool(other.ctx, (tx) => sendMessage(tx, other.ctx, { to: { guardiansOf: [other.ravi.id] }, channels: "preferred", text: "Sports day on Friday.", onNobody: "record" }));
    expect((await withSchool(s.ctx, (tx) => notDeliveredCount(tx, new Date()))).count).toBe(0);
    expect(await attention(s, s.principal.id)).not.toContain("communication.not-delivered");
    expect((await withSchool(other.ctx, (tx) => notDeliveredCount(tx, new Date()))).count).toBe(1);
    expect(await attention(other, other.principal.id)).toContain("communication.not-delivered");
    // A class teacher cannot fix channels or resend for the school: not on their home.
    expect(await attention(other, other.teacher.id)).not.toContain("communication.not-delivered");
  });
});

describe("the sender hears when some of it was not delivered", () => {
  it("a provider refusal is a notification with a link to retry", async () => {
    const s = await makeCommSchool();
    // SMS on a real MSG91 account with no auth key: MSG91 is never called, the send is refused.
    await turn(s, "sms", { provider: "msg91", environment: "live", config: { senderId: "SUNSCH" } });
    await turn(s, "whatsapp", { isOn: false });
    await addDlt(s.ctx, "general");
    const ctx: SchoolContext = s.ctx;
    const r = await withSchool(ctx, (tx) => sendMessage(tx, ctx, { to: { guardiansOf: [s.priya.id] }, channels: "preferred", text: "Sports day on Friday." }));
    await runAll();
    const row = await withSchool(ctx, (tx) => tx.messageRecipient.findFirstOrThrow({ where: { messageId: r.messageId } }));
    expect(row).toMatchObject({ channel: "sms", status: "FAILED" });
    expect(row.failReason).toMatch(/MSG91 auth key is missing/);
    const note = await withSchool(ctx, (tx) => tx.notification.findFirstOrThrow({ where: { userLoginId: s.principal.id, type: "message-failed" } }));
    expect(note.text).toMatch(/^1 of 1 not delivered/);
    expect(note.link).toBe(`/communication/history/${r.messageId}`);
    expect((await withSchool(ctx, (tx) => retryableFailures(tx, ctx, r.messageId))).rows).toHaveLength(1);
    expect((await withSchool(ctx, (tx) => notDeliveredCount(tx, new Date()))).count).toBeGreaterThanOrEqual(1);
  });
});
