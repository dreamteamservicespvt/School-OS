import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { currentYear } from "@/lib/academic/years";
import { channelSetups, preferredChannel, CHANNEL_LABEL, type Channel } from "@/lib/messaging/channels";
import { creditBalances } from "@/lib/messaging/credits";
import { messageSettings } from "@/lib/messaging/settings";
import { ensureReadyTemplates, categoryLabel } from "@/lib/messaging/templates";
import { PageHeader } from "@/components/shell/page-header";
import { Alert } from "@/components/ui/alert";
import { SendForm, type SendFormData } from "./send-form";

export const metadata: Metadata = { title: "Send Message" };

export default async function SendMessagePage() {
  const access = await commPage();
  const { current, scope } = access;
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
    const classes = [...new Map(sections.map((s) => [s.classId, { id: s.classId, name: s.schoolClass.name }])).values()];
    const setups = await channelSetups(tx, current.ctx);
    const on: Channel[] = ["app", ...(["whatsapp", "sms", "email"] as const).filter((c) => setups[c].isOn)];
    const templates = await tx.template.findMany({
      where: { schoolId: current.ctx.schoolId, archivedAt: null },
      include: { versions: { where: { isCurrent: true }, orderBy: { language: "asc" } } },
      orderBy: { name: "asc" },
    });
    const roles = scope.staff ? await tx.role.findMany({ where: { schoolId: current.ctx.schoolId, archivedAt: null, isEnabled: true }, select: { key: true, name: true }, orderBy: { name: "asc" } }) : [];
    const departments = scope.staff ? await tx.department.findMany({ where: { schoolId: current.ctx.schoolId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
    const groups = await tx.recipientGroup.findMany({ where: { schoolId: current.ctx.schoolId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    const settings = await messageSettings(tx, current.ctx);
    const school = await tx.school.findUniqueOrThrow({ where: { id: current.ctx.schoolId }, select: { smsDltEntityId: true, smsSenderHeader: true } });
    return {
      year: year?.name ?? null,
      classes,
      sections: sections.map((s) => ({ id: s.id, classId: s.classId, label: `${s.schoolClass.name} ${s.name}` })),
      on,
      preferred: on.includes(await preferredChannel(tx, current.ctx)) ? await preferredChannel(tx, current.ctx) : "app",
      templates: templates
        .filter((t) => t.versions.length && t.key !== "parent-link" && t.key !== "parent-link-code")
        .map((t) => {
          const en = t.versions.find((v) => v.language === "en") ?? t.versions[0];
          return {
            id: t.id,
            name: t.name,
            category: categoryLabel(t.category),
            channel: t.channel as Channel,
            body: en.body,
            subject: en.subject,
            languages: t.versions.map((v) => v.language),
            // Rule 34: SMS only from a template with a DLT template ID.
            usable: t.channel !== "sms" || t.versions.some((v) => v.dltTemplateId),
            locked: t.channel === "sms" || (t.channel === "whatsapp" && t.versions.some((v) => v.whatsappStatus === "APPROVED")),
          };
        }),
      roles: roles.filter((r) => r.key).map((r) => ({ key: r.key!, name: r.name })),
      departments,
      groups,
      balances: await creditBalances(tx, current.ctx),
      backupDefaults: Object.fromEntries(Object.entries(settings.smsBackup).map(([k, v]) => [k, v.on])) as Record<string, boolean>,
      smsReady: Boolean(school.smsDltEntityId && school.smsSenderHeader),
    };
  });

  const form: SendFormData = {
    ...data,
    scopeLabel: scope.label,
    staffAllowed: scope.staff,
    wholeSchool: scope.sectionIds === "all",
    canEmergency: access.canEmergency,
    canSend: access.canChange,
    sendKey: randomUUID(),
    timeZone: current.school.timeZone,
    channelLabels: CHANNEL_LABEL,
  };

  return (
    <>
      <PageHeader title="Send Message" href="/communication" userId={current.user.id} />
      {!data.year && (
        <Alert tone="warning" className="mb-4" title="No academic year is open">
          Parents and students are chosen by class and section of the current year. Open the year in{" "}
          <Link className="underline" href="/academic-management">Academic Management</Link>, or send to staff or chosen people for now.
        </Alert>
      )}
      {scope.sectionIds !== "all" && data.sections.length === 0 && (
        <Alert tone="info" className="mb-4">You are not the teacher of any section this year, so you can send only to chosen people. Ask the office to send to a class.</Alert>
      )}
      <SendForm data={form} />
    </>
  );
}
