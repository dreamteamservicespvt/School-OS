import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { currentYear } from "@/lib/academic/years";
import { channelSetups, preferredChannel, CHANNEL_LABEL, type Channel } from "@/lib/messaging/channels";
import { creditBalances } from "@/lib/messaging/credits";
import { messageSettings } from "@/lib/messaging/settings";
import { ensureReadyTemplates, categoryLabel } from "@/lib/messaging/templates";
import { sectionLabel } from "@/lib/people";
import { Banner } from "@/components/ui/banner";
import { CommHead } from "./_components/comm-head";
import { SendForm, type Person, type SendFormData } from "./send-form";
import { SendHeadActions } from "./send-head-actions";

export const metadata: Metadata = { title: "Send Message" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SendMessagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await commPage();
  const { current, scope } = access;
  // Someone who may only read messages starts on Message History; Send Message is not offered (05-roles.md).
  if (!access.canChange) redirect("/communication/history");
  // Students chosen on the Student List ("Send message"): their parents are added as recipients.
  const sp = await searchParams;
  const rawIds = typeof sp.ids === "string" && sp.for === "students" ? sp.ids.split(",").filter((x) => UUID.test(x)) : [];
  const chosenIds = [...new Set(rawIds)].slice(0, 500);
  const groupParam = typeof sp.group === "string" && UUID.test(sp.group) ? sp.group : null;
  const data = await withSchool(current.ctx, async (tx) => {
    await ensureReadyTemplates(tx, current.ctx);
    const year = await currentYear(tx, current.ctx);
    const sections = year
      ? await tx.section.findMany({
          where: { schoolId: current.ctx.schoolId, academicYearId: year.id, archivedAt: null, ...(scope.sectionIds === "all" ? {} : { id: { in: scope.sectionIds } }) },
          select: { id: true, name: true, classId: true, schoolClass: { select: { name: true, sortOrder: true } } },
        })
      : [];
    sections.sort((a, b) => a.schoolClass.sortOrder - b.schoolClass.sortOrder || a.name.localeCompare(b.name));
    // Students studying in each section, shown on the class and section buttons.
    const counts = year && sections.length
      ? await tx.enrolment.groupBy({ by: ["sectionId"], where: { schoolId: current.ctx.schoolId, academicYearId: year.id, archivedAt: null, status: "STUDYING", sectionId: { in: sections.map((s) => s.id) }, student: { archivedAt: null } }, _count: { _all: true } })
      : [];
    const perSection = new Map(counts.map((c) => [c.sectionId, c._count._all]));
    const classes = [...new Map(sections.map((s) => [s.classId, { id: s.classId, name: s.schoolClass.name, count: 0 }])).values()];
    for (const c of classes) c.count = sections.filter((s) => s.classId === c.id).reduce((n, s) => n + (perSection.get(s.id) ?? 0), 0);
    const setups = await channelSetups(tx, current.ctx);
    const on: Channel[] = ["app", ...(["whatsapp", "sms", "email"] as const).filter((c) => setups[c].isOn)];
    const templates = await tx.template.findMany({
      where: { schoolId: current.ctx.schoolId, archivedAt: null },
      include: { versions: { where: { isCurrent: true }, orderBy: { language: "asc" } } },
      orderBy: { name: "asc" },
    });
    const roles = scope.staff ? await tx.role.findMany({ where: { schoolId: current.ctx.schoolId, archivedAt: null, isEnabled: true }, select: { key: true, name: true }, orderBy: { name: "asc" } }) : [];
    const departments = scope.staff
      ? await tx.department.findMany({ where: { schoolId: current.ctx.schoolId, archivedAt: null }, select: { id: true, name: true, _count: { select: { staff: { where: { archivedAt: null, status: "ACTIVE" } } } } }, orderBy: { name: "asc" } })
      : [];
    const staffCount = scope.staff ? await tx.staff.count({ where: { schoolId: current.ctx.schoolId, archivedAt: null, status: "ACTIVE" } }) : 0;
    const groups = await tx.recipientGroup.findMany({ where: { schoolId: current.ctx.schoolId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    const settings = await messageSettings(tx, current.ctx);
    const school = await tx.school.findUniqueOrThrow({ where: { id: current.ctx.schoolId }, select: { smsDltEntityId: true, smsSenderHeader: true, email: true } });
    let initialPeople: Person[] = [];
    let initialNote: string | null = null;
    if (chosenIds.length && year) {
      const enrolled = await tx.enrolment.findMany({
        where: { schoolId: current.ctx.schoolId, academicYearId: year.id, archivedAt: null, status: "STUDYING", studentId: { in: chosenIds }, student: { archivedAt: null } },
        select: { sectionId: true, student: { select: { id: true, fullName: true } } },
      });
      const names = new Map(sections.map((s) => [s.id, sectionLabel(s.schoolClass.name, s.name)]));
      const reachable = enrolled.filter((e) => scope.sectionIds === "all" || scope.sectionIds.includes(e.sectionId));
      reachable.sort((a, b) => a.student.fullName.localeCompare(b.student.fullName));
      initialPeople = reachable.map((e) => ({ type: "parentsOf" as const, id: e.student.id, name: `Parents of ${e.student.fullName}`, detail: names.get(e.sectionId) ?? "" }));
      const left = chosenIds.length - reachable.length;
      if (left > 0) initialNote = `${left} chosen student${left === 1 ? " is" : "s are"} left out: not studying this year${scope.sectionIds === "all" ? "" : ", or not in your classes"}.`;
    }
    const wa = setups.whatsapp;
    const sms = setups.sms;
    const email = setups.email;
    const preferred = await preferredChannel(tx, current.ctx);
    return {
      initialPeople,
      initialNote,
      year: year?.name ?? null,
      classes,
      sections: sections.map((s) => ({ id: s.id, classId: s.classId, label: `${s.schoolClass.name} ${s.name}`, count: perSection.get(s.id) ?? 0 })),
      on,
      preferred: on.includes(preferred) ? preferred : "app",
      channelNotes: {
        whatsapp: wa.isOn ? `${wa.environment === "test" || wa.provider === "sandbox" ? "Test mode" : "Connected"}${wa.config.displayNumber ? ` · ${wa.config.displayNumber}` : ""}` : "Not connected",
        sms: sms.isOn ? `${school.smsSenderHeader ? `Header ${school.smsSenderHeader}` : "No sender header yet"} · needs a DLT template` : "Not connected",
        email: email.isOn ? `${email.config.fromAddress || school.email || "Email"} · free` : "Not connected",
        app: "Staff logins and Parent Link · free",
      } as Record<Channel, string>,
      templates: templates
        // Templates whose blanks only the software can fill (personal links and codes) are not offered here.
        .filter((t) => t.versions.length && !["parent-link", "parent-link-code", "staff-invite", "sign-in-code"].includes(t.key ?? ""))
        .map((t) => {
          const en = t.versions.find((v) => v.language === "en") ?? t.versions[0];
          const dlt = t.versions.find((v) => v.dltTemplateId)?.dltTemplateId ?? null;
          return {
            id: t.id,
            name: t.name,
            category: categoryLabel(t.category),
            channel: t.channel as Channel,
            body: en.body,
            subject: en.subject,
            version: en.version,
            languages: t.versions.map((v) => v.language),
            dlt,
            // Rule 34: SMS only from a template with a DLT template ID.
            usable: t.channel !== "sms" || Boolean(dlt),
            locked: t.channel === "sms" || (t.channel === "whatsapp" && t.versions.some((v) => v.whatsappStatus === "APPROVED")),
          };
        }),
      roles: roles.filter((r) => r.key).map((r) => ({ key: r.key!, name: r.name })),
      departments: departments.map((d) => ({ id: d.id, name: d.name, count: d._count.staff })),
      staffCount,
      groups,
      balances: await creditBalances(tx, current.ctx),
      backupDefaults: Object.fromEntries(Object.entries(settings.smsBackup).map(([k, v]) => [k, v.on])) as Record<string, boolean>,
      backupWait: Object.fromEntries(Object.entries(settings.smsBackup).map(([k, v]) => [k, v.waitMinutes])) as Record<string, number>,
      smsReady: Boolean(school.smsDltEntityId && school.smsSenderHeader),
    };
  });

  const form: SendFormData = {
    ...data,
    scopeLabel: scope.label,
    staffAllowed: scope.staff,
    wholeSchool: scope.sectionIds === "all",
    full: access.full,
    canEmergency: access.canEmergency,
    canSend: access.canChange,
    sendKey: randomUUID(),
    timeZone: current.school.timeZone,
    channelLabels: CHANNEL_LABEL,
    initialGroup: groupParam && data.groups.some((g) => g.id === groupParam) ? groupParam : null,
  };

  return (
    <>
      <CommHead access={access} page="Send Message" href="/communication"
        sub={access.full ? "By class, section, bus route or group. Count and cost shown before anything goes." : `Only the people you may message: ${scope.label}.`}
        actions={<SendHeadActions full={access.full} groups={data.groups} canEmergency={access.canEmergency} />} />
      {!data.year && (
        <Banner tone="warn" className="mb-5" title="No academic year is open.">
          Parents and students are chosen by class and section of the current year. Open the year in{" "}
          <Link className="underline font-semibold" href="/academic-management">Academic Management</Link>, or send to staff or chosen people for now.
        </Banner>
      )}
      {scope.sectionIds !== "all" && data.year && data.sections.length === 0 && (
        <Banner tone="info" className="mb-5">You are not the teacher of any section this year, so you can send only to chosen people. Ask the office to send to a class.</Banner>
      )}
      <SendForm data={form} />
    </>
  );
}
