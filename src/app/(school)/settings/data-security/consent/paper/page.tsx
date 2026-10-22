import type { Metadata } from "next";
import Link from "next/link";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { currentYearIds } from "@/lib/academic/years";
import { currentConsentTexts } from "@/lib/parent-link/consent";
import { paperFormSheet } from "@/lib/students/paper-consent";
import { consentHowWords } from "@/lib/students/labels";
import { sectionOptions } from "@/app/(school)/student-management/_lib/queries";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ActionForm, FormText } from "@/components/students/action-form";
import { paperFormsAction } from "../actions";

export const metadata: Metadata = { title: "Paper forms received · Consent" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Paper forms received (gap list G42): for one class and one consent, tick
 * the students whose signed paper forms the office holds. Each is recorded
 * for the child's first parent on record, as given on the date of the forms,
 * marked "recorded from a paper form" with the person's name. Answers already
 * on record are shown and never replaced.
 */
export default async function PaperFormsPage({ searchParams }: Search) {
  const { current } = await requireSettingsPage("data-security");
  const sp = await searchParams;
  const may = can(current.permissions, "student-management", "create");
  const tz = current.school.timeZone;
  const sectionId = typeof sp.section === "string" && /^[0-9a-f-]{36}$/i.test(sp.section) ? sp.section : "";
  const data = await withSchool(current.ctx, async (tx) => {
    const sections = may ? await sectionOptions(tx, current, await currentYearIds(tx, current.ctx)) : [];
    const texts = await currentConsentTexts(tx, current.ctx);
    const type = typeof sp.type === "string" && texts.some((t) => t.consentType === sp.type) ? sp.type : texts[0]?.consentType ?? "";
    const section = sections.find((s) => s.value === sectionId) ?? null;
    const sheet = may && section && type ? await paperFormSheet(tx, current.ctx, { sectionId: section.value, consentType: type, campusId: current.campusId }) : [];
    return { sections, texts, type, section, sheet };
  });
  const text = data.texts.find((t) => t.consentType === data.type);
  const today = new Date().toISOString().slice(0, 10);
  const open = data.sheet.filter((s) => s.parent && s.state !== "given");

  return (
    <div className="grid max-w-3xl gap-4">
      <h2 className="text-lg font-semibold">Paper forms received</h2>
      <p className="max-w-prose text-ink-2">For consent forms parents already signed on paper. Tick the students whose signed form you hold; each is recorded for the child&apos;s first parent on record, as given on the date of the forms, and kept as recorded from a paper form with your name. For a whole school, a parent who said no, or another parent who signed, use Student Management, Import students, Consent from paper forms.</p>
      {!may ? (
        <EmptyState title="Your role cannot record consent forms">Recording consent is Student Management work. Ask the School Admin or the office.</EmptyState>
      ) : data.texts.length === 0 ? (
        <EmptyState title="No consent texts yet">Add the consent texts on the Consent page first, so each form is kept with the version it carried.</EmptyState>
      ) : (
        <>
          <Card>
            <CardHeader title="Which class and consent" />
            <CardBody>
              <form method="get" className="flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 basis-52">
                  <span className="mb-1 block text-[13px] font-semibold text-ink2">Class</span>
                  <select name="section" defaultValue={sectionId} className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-base">
                    <option value="">Choose</option>
                    {data.sections.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </label>
                <label className="min-w-0 flex-1 basis-52">
                  <span className="mb-1 block text-[13px] font-semibold text-ink2">Consent</span>
                  <select name="type" defaultValue={data.type} className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-base">
                    {data.texts.map((t) => <option key={t.consentType} value={t.consentType}>{t.title} (version {t.version})</option>)}
                  </select>
                </label>
                <button type="submit" className={buttonClass("secondary")}>Show students</button>
              </form>
            </CardBody>
          </Card>
          {data.section && text && (
            data.sheet.length === 0 ? <EmptyState title="No students in this class">Choose another class.</EmptyState> : (
              <Card>
                <CardHeader title={`${data.section.label}: ${text.title}`} description={`Version ${text.version} · ${open.length} of ${data.sheet.length} students have no consent on record`} />
                <CardBody>
                  <ActionForm action={paperFormsAction} submitLabel="Record the ticked forms" pendingText="Recording…" className="grid gap-4">
                    <input type="hidden" name="sectionId" value={data.section.value} />
                    <input type="hidden" name="consentType" value={data.type} />
                    <FormText name="formDate" label="Date on the forms" type="date" required max={today} defaultValue={today} help="The date the parents signed. If the dates differ, use the import instead." />
                    <fieldset>
                      <legend className="mb-2 text-[13px] font-semibold text-ink2">Signed forms received</legend>
                      <ul className="divide-y divide-line/70 rounded-xl border border-line">
                        {data.sheet.map((s) => {
                          const done = s.state === "given";
                          return (
                            <li key={s.studentId} className="flex min-h-11 items-center gap-3 px-3 py-2">
                              <input id={`p-${s.studentId}`} type="checkbox" name="student" value={s.studentId} disabled={done || !s.parent} defaultChecked={false} className="size-[18px] accent-[var(--color-brand)]" />
                              <label htmlFor={`p-${s.studentId}`} className="min-w-0 flex-1 text-[14px]">
                                <span className="font-medium">{s.rollNo ? `${s.rollNo}. ` : ""}{s.name}</span>
                                <span className="block text-[12.5px] text-ink3">{s.parent ? s.parent.name : "No parent on record who can give consent"}</span>
                              </label>
                              {s.state === "given" && <Pill tone="ok">Given{s.on ? ` ${formatDate(s.on, s.how === "paper-form" ? "UTC" : tz)}` : ""} · {consentHowWords(s.how)}</Pill>}
                              {s.state === "refused" && <Pill tone="bad">Refused on paper</Pill>}
                              {s.state === "withdrawn" && <Pill tone="bad">Withdrawn</Pill>}
                            </li>
                          );
                        })}
                      </ul>
                    </fieldset>
                  </ActionForm>
                </CardBody>
              </Card>
            )
          )}
        </>
      )}
      <p><Link href="/settings/data-security/consent" className="font-medium text-brand-text underline-offset-2 hover:underline">Back to Consent</Link></p>
    </div>
  );
}
