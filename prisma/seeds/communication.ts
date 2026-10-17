// Communication demo: channels in test mode with credits, the ready
// templates (SMS ones with DLT template IDs, one left without to show the
// warning), sent and scheduled messages with delivered, read and failed
// people, notices, queries, consent texts and Parent Links for Class 5 A.
import { withSchool } from "../../src/lib/db";
import { encryptSecrets } from "../../src/lib/messaging/channels";
import { ensureReadyTemplates, templateByKey } from "../../src/lib/messaging/templates";
import { sendMessage } from "../../src/lib/messaging/send";
import { deliverMessage } from "../../src/lib/messaging/deliver";
import { setOptOut } from "../../src/lib/messaging/optout";
import { saveNotice } from "../../src/lib/communication/notices";
import { ensureTopics, logQuery, addInternalNote, replyToQuery, setQueryStatus } from "../../src/lib/communication/queries";
import { createLink, sendLinks } from "../../src/lib/parent-link/links";
import { assignChat, recordIncoming, replyToChat, setResolved } from "../../src/lib/communication/inbox";
import { audienceOptions, closeSurvey, saveSurvey, sendSurvey, submitAnswers, SURVEY_EXAMPLES } from "../../src/lib/communication/surveys";
import { surveyTokenFor } from "../../src/lib/parent-link/token";
import type { SeedSchool } from "./types";

const DLT = (n: number) => `11071600000${String(10000000 + n)}`;

export async function seedCommunication(school: SeedSchool) {
  const { schoolId } = school;
  const sys = { schoolId, userId: null };
  const principalCtx = { schoolId, userId: school.users.principal ?? null };

  const ids = await withSchool(sys, async (tx) => {
    await tx.school.update({ where: { id: schoolId }, data: { smsDltEntityId: "1201159000000012345", smsSenderHeader: school.code === "SPS" ? "SUNSPS" : "GVSWGL", phone: school.code === "SPS" ? "04023456789" : "08702456789" } });
    for (const channel of ["whatsapp", "sms", "email"] as const) {
      if (!school.full && channel === "email") continue;
      await tx.messagingChannel.upsert({
        where: { schoolId_channel: { schoolId, channel } },
        create: { schoolId, channel, provider: "sandbox", isOn: true, environment: "test", ...(channel === "whatsapp" ? encryptSecrets({ verifyToken: `verify-${school.code.toLowerCase()}-demo` }) : {}) },
        update: {},
      });
    }
    await tx.creditLedgerEntry.create({ data: { schoolId, channel: "whatsapp", amount: school.full ? 5000 : 800, note: "Demo top-up" } });
    await tx.creditLedgerEntry.create({ data: { schoolId, channel: "sms", amount: school.full ? 3000 : 120, note: "Demo top-up" } });
    await ensureReadyTemplates(tx, sys);
    // DLT template IDs for SMS templates, except "Exam reminder" (shows "Missing").
    const sms = await tx.template.findMany({ where: { schoolId, channel: "sms" }, include: { versions: true } });
    let n = 0;
    for (const t of sms) {
      if (t.key === "exam-reminder") continue;
      for (const v of t.versions) await tx.templateVersion.update({ where: { id: v.id }, data: { dltTemplateId: DLT(++n) } });
    }
    await tx.templateVersion.updateMany({ where: { schoolId, template: { channel: "whatsapp", key: { in: ["absence", "fee-due", "fee-paid", "parent-link", "parent-link-code", "notice", "general"] } } }, data: { whatsappStatus: "APPROVED" } });
    await ensureTopics(tx, sys);
    if (!(await tx.consentText.count({ where: { schoolId } }))) {
      await tx.consentText.create({ data: { schoolId, consentType: "data-processing", title: "Data processing consent", version: 1, text: { en: `${school.name} keeps your child's details (name, date of birth, class, attendance, marks, fees and health notes) to run the school and to meet government rules. Only staff who need them can see them. You can ask to see or correct them at any time. We keep them for as long as the law requires.`, te: "మీ పిల్లల వివరాలను పాఠశాల నిర్వహణ కోసం మాత్రమే ఉపయోగిస్తాము." } } });
      await tx.consentText.create({ data: { schoolId, consentType: "photo", title: "Photo consent", version: 1, text: { en: "We may use photos of your child taken at school events in the school magazine, notice boards and the school's social media pages. No photo will show your child's full name." } } });
    }
    const year = await tx.academicYear.findUniqueOrThrow({ where: { id: school.yearId } });
    const c5 = await tx.schoolClass.findFirst({ where: { schoolId, name: "Class 5" } });
    const sections = c5 ? await tx.section.findMany({ where: { schoolId, classId: c5.id, academicYearId: year.id }, orderBy: { name: "asc" } }) : [];
    const guardians = sections[0] ? await tx.studentGuardian.findMany({ where: { schoolId, isPrimary: true, student: { enrolments: { some: { sectionId: sections[0].id, academicYearId: year.id } } } }, select: { guardianId: true, studentId: true }, take: 40 }) : [];
    const accounts = await tx.department.findFirst({ where: { schoolId, name: "Accounts" } });
    const transport = await tx.department.findFirst({ where: { schoolId, name: "Transport" } });
    if (accounts) await tx.queryTopic.updateMany({ where: { schoolId, name: "Fees" }, data: { defaultDepartmentId: accounts.id } });
    if (transport) await tx.queryTopic.updateMany({ where: { schoolId, name: "Transport" }, data: { defaultDepartmentId: transport.id } });
    return { c5, sections, guardians };
  });
  if (!ids.c5 || !ids.sections.length || !school.users.principal) return;
  const [a, b] = ids.sections;

  // Two parents opted out of general messages.
  await withSchool(principalCtx, async (tx) => {
    for (const g of ids.guardians.slice(-2)) await setOptOut(tx, principalCtx, g.guardianId, true, "Phone call", "Asked for calls only");
  });

  // A WhatsApp message to parents of Class 5, delivered; some failed, some read.
  const sent = await withSchool(principalCtx, async (tx) => {
    const general = await templateByKey(tx, principalCtx, "general", "whatsapp");
    const ptm = await sendMessage(tx, principalCtx, {
      to: { kinds: ["parents"], classIds: [ids.c5!.id] },
      channels: ["whatsapp"],
      templates: { whatsapp: general!.id },
      values: { message: "The parent-teacher meeting for Class 5 is on Saturday 17 October, 9 AM to 12 noon. Please bring the report book." },
      title: "PTM on Saturday",
    });
    const staff = await sendMessage(tx, principalCtx, { to: { kinds: ["staff"] }, channels: ["app"], title: "Staff meeting today", text: "Staff meeting in the library at 3:30 PM today. Please bring your lesson plans." });
    return { ptm, staff };
  });
  for (const id of [sent.ptm.messageId, sent.staff.messageId]) {
    await withSchool(sys, (tx) => deliverMessage(tx, sys, { messageId: id, round: "0", chunk: 0 }));
  }
  await withSchool(sys, async (tx) => {
    const rows = await tx.messageRecipient.findMany({ where: { messageId: sent.ptm.messageId }, orderBy: { name: "asc" } });
    const now = Date.now();
    for (const [i, r] of rows.entries()) {
      if (i % 9 === 0) {
        await tx.messageRecipient.update({ where: { id: r.id }, data: { status: "FAILED", failReason: i % 2 ? "Number not on WhatsApp" : "Phone switched off for too long", failedAt: new Date(now - 3600_000), deliveredAt: null } });
      } else if (i % 3 === 0) {
        await tx.messageRecipient.update({ where: { id: r.id }, data: { status: "READ", readAt: new Date(now - 1800_000) } });
      }
    }
  });

  // A scheduled reminder for tomorrow morning (can be cancelled).
  await withSchool(principalCtx, async (tx) => {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(2, 0, 0, 0); // 07:30 in India
    await sendMessage(tx, principalCtx, { to: { kinds: ["parents"], sectionIds: [b?.id ?? a.id] }, channels: ["app", "whatsapp"], title: "Sports day tomorrow", text: "Sports day is tomorrow. Children should come in house colours by 8 AM.", scheduledAt: tomorrow });
  });

  // Notices.
  await withSchool(principalCtx, async (tx) => {
    const base = { attachmentFileIds: [], askAck: false, publishAt: null, expiresOn: null };
    await saveNotice(tx, principalCtx, { ...base, title: "Diwali holidays", body: "The school is closed from 30 October to 3 November for Diwali. Classes start again on Tuesday 4 November.", audience: { parents: true, students: true, staff: true, roleKeys: [], classIds: [], sectionIds: [], campusIds: [] }, priority: "HIGH", channels: ["board", "app", "parent-link"] }, { action: "publish", fullAccess: true, criticalConfirmed: false });
    await saveNotice(tx, principalCtx, { ...base, title: "School closed tomorrow due to heavy rain", body: "Because of the heavy rain warning, the school will stay closed tomorrow. Online classes are not planned.", audience: { parents: true, students: false, staff: true, roleKeys: [], classIds: [], sectionIds: [], campusIds: [] }, priority: "CRITICAL", channels: ["board", "app", "parent-link"], expiresOn: new Date(Date.now() + 2 * 86400_000) }, { action: "publish", fullAccess: true, criticalConfirmed: true });
    await saveNotice(tx, principalCtx, { ...base, title: "Class 5 A field trip to the Science Centre", body: "Class 5 A visits the Science Centre on 22 October. Please send a packed lunch and water.", audience: { parents: true, students: true, staff: false, roleKeys: [], classIds: [], sectionIds: [a.id], campusIds: [] }, priority: "NORMAL", channels: ["board", "parent-link"] }, { action: "publish", fullAccess: true, criticalConfirmed: false });
    await saveNotice(tx, principalCtx, { ...base, title: "Teachers: submit question papers", body: "Please submit the half-yearly question papers to the exam cell by Friday.", audience: { parents: false, students: false, staff: true, roleKeys: [], classIds: [], sectionIds: [], campusIds: [] }, priority: "NORMAL", channels: ["board", "app"], askAck: true }, { action: "publish", fullAccess: true, criticalConfirmed: false });
    await saveNotice(tx, principalCtx, { ...base, title: "Annual day rehearsal timings", body: "Draft: rehearsal timings for annual day.", audience: { parents: true, students: true, staff: false, roleKeys: [], classIds: [], sectionIds: [], campusIds: [] }, priority: "NORMAL", channels: ["board"] }, { action: "draft", fullAccess: true, criticalConfirmed: false });
  });

  // Queries.
  if (school.full) {
    await withSchool(principalCtx, async (tx) => {
      const topics = await tx.queryTopic.findMany({ where: { schoolId } });
      const topic = (name: string) => topics.find((t) => t.name === name)?.id ?? null;
      const g = ids.guardians;
      const q1 = await logQuery(tx, principalCtx, { fromType: "guardian", fromId: g[0].guardianId, fromName: null, fromPhone: null, aboutStudentId: g[0].studentId, type: "complaint", topicId: topic("Transport"), details: "The school bus reached our stop 25 minutes late on three days this week.", priority: "high", ownerId: null, departmentId: null, cameBy: "phone" });
      await addInternalNote(tx, principalCtx, q1.query.id, "Driver says the new road works at Madhapur cause the delay. Check with the transport in-charge.");
      await replyToQuery(tx, principalCtx, q1.query.id, "Sorry for the trouble. We have changed the route timing from Monday, so the bus reaches your stop by 7:40 AM.", "whatsapp");
      const q2 = await logQuery(tx, principalCtx, { fromType: "guardian", fromId: g[1].guardianId, fromName: null, fromPhone: null, aboutStudentId: g[1].studentId, type: "query", topicId: topic("Fees"), details: "Can we pay the second term fee in two parts?", priority: "normal", ownerId: null, departmentId: null, cameBy: "whatsapp" });
      await setQueryStatus(tx, principalCtx, q2.query.id, "RESOLVED", "Explained the installment plan; parent will pay in two parts.");
      await logQuery(tx, principalCtx, { fromType: "other", fromId: null, fromName: "Walk-in visitor", fromPhone: "9848012345", aboutStudentId: null, type: "query", topicId: topic("Admission"), details: "Asked about admission for Class 3 next year and the documents needed.", priority: "low", ownerId: school.users.admin ?? school.users.principal, departmentId: null, cameBy: "visit" });
      await logQuery(tx, principalCtx, { fromType: "guardian", fromId: g[2].guardianId, fromName: null, fromPhone: null, aboutStudentId: g[2].studentId, type: "suggestion", topicId: topic("Food"), details: "Please add fruit to the Wednesday snack.", priority: "normal", ownerId: school.users.principal, departmentId: null, cameBy: "letter" });
    });
  }

  // Parent Links for Class 5 A (all but three families), sent in one message.
  await withSchool(principalCtx, async (tx) => {
    const links = [];
    for (const g of ids.guardians.slice(0, Math.max(0, ids.guardians.length - 3))) {
      if (await tx.parentLink.findFirst({ where: { guardianId: g.guardianId, status: "ACTIVE" } })) continue;
      links.push(await createLink(tx, principalCtx, g.guardianId));
    }
    if (links.length) await sendLinks(tx, principalCtx, links, { trigger: "Parent Links sent to existing families", audienceLabel: "Parents of Class 5 A" });
  });

  // WhatsApp Inbox (optional page, switched on for the full demo): a few chats from parents, one
  // from staff and one unknown number, some answered and given to someone.
  if (school.full) {
    await withSchool(principalCtx, async (tx) => {
      await tx.schoolFeature.upsert({ where: { schoolId_featureKey: { schoolId, featureKey: "whatsapp-inbox" } }, create: { schoolId, featureKey: "whatsapp-inbox", isOn: true }, update: {} });
      if (await tx.whatsappChat.count({ where: { schoolId } })) return;
      const people = await tx.guardian.findMany({ where: { id: { in: ids.guardians.slice(0, 4).map((g) => g.guardianId) } }, select: { id: true, phone: true } });
      const phone = (i: number) => people.find((p) => p.id === ids.guardians[i]?.guardianId)?.phone;
      const ago = (h: number) => new Date(Date.now() - h * 3600_000);
      const say = (from: string | undefined, text: string, h: number, name?: string) => (from ? recordIncoming(tx, principalCtx, { from, text, at: ago(h), name }) : Promise.resolve(null));
      const c1 = await say(phone(0), "Good morning sir. Is tomorrow a holiday for Dussehra?", 3);
      if (c1) await replyToChat(tx, principalCtx, true, c1, "Good morning. Yes, the school is closed tomorrow and opens again on Monday.", ago(2.5));
      await say(phone(0), "Thank you sir.", 2);
      const c2 = await say(phone(1), "My son forgot his lunch box in the bus today.", 1);
      if (c2 && school.users.admin) await assignChat(tx, principalCtx, c2, school.users.admin);
      await say(phone(2), "Please share the fee receipt for the first term.", 30);
      const c4 = await say(phone(3), "Sports day photos are lovely, thank you!", 52);
      if (c4) await setResolved(tx, principalCtx, true, c4, true);
      await say("919912345678", "Hello, are admissions open for Class 1?", 5, "Rahul Varma");
    });
  }

  // Surveys (optional page, switched on for the full demo): a parent survey open with answers,
  // an event survey closed, and a staff survey still a draft.
  if (school.full) {
    await withSchool(principalCtx, async (tx) => {
      await tx.schoolFeature.upsert({ where: { schoolId_featureKey: { schoolId, featureKey: "surveys" } }, create: { schoolId, featureKey: "surveys", isOn: true }, update: {} });
      if (await tx.survey.count({ where: { schoolId } })) return;
      const sch = await tx.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timeZone: true } });
      const tz = sch.timeZone;
      const labels = new Map((await audienceOptions(tx, principalCtx)).map((o) => [o.value, o.label]));
      const day = (d: number) => new Date(Date.now() + d * 86400_000);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const today = new Date(`${iso(new Date())}T00:00:00Z`);
      const ex = (k: string) => SURVEY_EXAMPLES.find((e) => e.key === k)!;
      const comments = ["More notice before events that cost money.", "The evening bus is often late.", "Please share homework on Parent Link as well.", "Very happy with the class teacher. Thank you.", "Canteen food could have more fruit.", ""];
      const answer = async (surveyId: string, share: number, at: (i: number) => Date, seed: number) => {
        const qs = await tx.surveyQuestion.findMany({ where: { surveyId, sortOrder: { gt: 0 } }, orderBy: { sortOrder: "asc" } });
        const invites = await tx.surveyInvite.findMany({ where: { surveyId }, orderBy: { createdAt: "asc" } });
        const n = Math.floor(invites.length * share);
        for (let i = 0; i < n; i++) {
          const r = (k: number) => (i * 7 + k * 3 + seed) % 10;
          const a: Record<string, string> = {};
          qs.forEach((q, k) => {
            if (q.kind === "rating") a[q.id] = String([5, 4, 5, 4, 3, 5, 4, 2, 4, 5][r(k)]);
            else if (q.kind === "choice") a[q.id] = q.options[[0, 0, 1, 0, 2, 1, 0, 3, 0, 1][r(k)] % q.options.length];
            else if (q.kind === "text") { const c = comments[(i + seed) % comments.length]; if (c) a[q.id] = c; }
          });
          await submitAnswers(tx, principalCtx, surveyTokenFor(invites[i].id), a, tz, at(i));
        }
      };
      const p = ex("parents");
      const open = await saveSurvey(tx, principalCtx, null, { title: "Parent satisfaction · Term 1", audience: "parents", anonymous: true, closesOn: iso(day(5)), questions: p.questions }, labels, today);
      await sendSurvey(tx, principalCtx, open.id, tz, day(-4));
      await answer(open.id, 0.6, (i) => day(-3 + (i % 4)), 1);
      const ev = ex("event");
      const cls = [...labels.keys()].find((k) => k.startsWith("class:")) ?? "parents";
      const closed = await saveSurvey(tx, principalCtx, null, { title: "Sports day feedback", audience: cls, anonymous: false, closesOn: iso(day(2)), questions: ev.questions }, labels, today);
      await sendSurvey(tx, principalCtx, closed.id, tz, day(-12));
      await answer(closed.id, 0.7, (i) => day(-11 + (i % 5)), 4);
      await closeSurvey(tx, principalCtx, closed.id);
      const st = ex("staff");
      await saveSurvey(tx, principalCtx, null, { title: "Staff feedback · Term 1", audience: "staff", anonymous: true, closesOn: null, questions: st.questions }, labels, today);
    }, { timeout: 120_000 });
  }
}
