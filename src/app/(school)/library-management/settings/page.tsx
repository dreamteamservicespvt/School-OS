// Library Settings (13 §6): borrowing limits, loan days, fine rates, the
// lost and damaged charge rule and the approval amount, renewals, the queue
// order, categories and shelves, accession numbers and reminders. The
// Librarian and the School Admin change them; the Principal reads them.
import Link from "next/link";
import type { Metadata } from "next";
import { FolderTree, Plus } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Stack } from "@/components/money/kit";
import { nextAccessionPreview, ACCESSION_KEY } from "@/lib/library/settings";
import { paiseToRupees } from "@/lib/library/words";
import { LibHead } from "../_components/head";
import { ActButton } from "../_components/client";
import { CategorySheet } from "../_components/sheets";
import { BASE, libGuard, one, UUID, type SearchParams } from "../_lib/page";
import { archiveCategoryAction } from "../actions";
import { SettingsForm } from "./settings-form";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Library Settings · Library Management") };
}

export default async function LibrarySettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const p = await libGuard("settings");
  const { current, settings: s, can, tz } = p;
  const d = await withSchool(current.ctx, async (tx) => {
    const [cats, counts, preview, seq, who] = await Promise.all([
      tx.libraryCategory.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      tx.book.groupBy({ by: ["categoryId"], where: { archivedAt: null }, _count: { _all: true } }),
      nextAccessionPreview(tx, current.ctx, s),
      tx.numberSequence.findUnique({ where: { schoolId_key: { schoolId: current.ctx.schoolId, key: ACCESSION_KEY } } }),
      s.updatedById ? tx.userLogin.findFirst({ where: { id: s.updatedById }, select: { displayName: true } }) : Promise.resolve(null),
    ]);
    return { cats, counts, preview, next: seq?.nextValue ?? 1, who };
  });
  const base = `${BASE}/settings`;
  const catParam = one(sp.cat);
  const editing = can.settings ? (catParam === "new" ? "new" : UUID.test(catParam) ? d.cats.find((c) => c.id === catParam) ?? null : null) : null;
  const used = (id: string) => d.counts.find((x) => x.categoryId === id)?._count._all ?? 0;

  return (
    <>
      <LibHead pageName="Library Settings" href={base} mode={p.mode} sub={d.who ? `Last changed by ${d.who.displayName} on ${formatDateTime(s.updatedAt, tz)}` : undefined} />
      <Stack>
        <SettingsForm readOnly={!can.settings} start={{
          rules: s.rules, studentBooks: s.studentBooks, studentLoanDays: s.studentLoanDays, staffBooks: s.staffBooks, staffLoanDays: s.staffLoanDays, moveDueOffHolidays: s.moveDueOffHolidays,
          finePerDay: String(paiseToRupees(s.finePerDayPaise)), maxFine: String(paiseToRupees(s.maxFinePaise)), graceDays: s.graceDays, blockAbove: String(paiseToRupees(s.blockFinesAbovePaise)), finesToFees: s.finesToFees,
          lostCharge: s.lostCharge, lostExtra: String(paiseToRupees(s.lostExtraPaise)), approvalAbove: String(paiseToRupees(s.approvalAbovePaise)), maxRenewals: s.maxRenewals, queueOrder: s.queueOrder, labelType: s.labelType,
          accessionPrefix: s.accessionPrefix, accessionWidth: s.accessionWidth, nextAccession: d.next, nextPreview: d.preview,
          remindDueTomorrow: s.remindDueTomorrow, remindOverdue: s.remindOverdue, remindReservation: s.remindReservation,
        }} />
        <Card>
          <CardHeader title="Categories and shelves" icon={FolderTree} description="Reference categories are read in the library and not lent. A category's loan days come before the member's." divided
            action={can.settings ? <ButtonLink href={`${base}?cat=new`} size="sm" icon={Plus} scroll={false}><Words k="Add category" /></ButtonLink> : undefined} />
          <ul className="divide-y divide-line/70">
            {d.cats.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-5 py-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[14px]">{c.name}</p>
                  <p className="text-[12.5px] text-ink3">{c.shelf ? `Shelf ${c.shelf}` : "No shelf"} · {c.loanDays ? `${c.loanDays} loan days` : "member's loan days"} · {used(c.id)} <Words k="book" />{used(c.id) === 1 ? "" : "s"}</p>
                </div>
                {!c.forLoan && <Pill tone="info"><Words k="Not lent" /></Pill>}
                {can.settings && (
                  <span className="flex items-center gap-3">
                    <Link href={`${base}?cat=${c.id}`} scroll={false} className="text-[13px] font-semibold text-brand hover:underline"><Words k="Change" /></Link>
                    {used(c.id) === 0 && <ActButton action={archiveCategoryAction} fields={{ categoryId: c.id }} label="Remove" variant="ghost" ariaLabel={`Remove ${c.name}`} />}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </Stack>
      {editing && (
        <CategorySheet closeHref={base} start={editing === "new" ? null : { id: editing.id, name: editing.name, shelf: editing.shelf ?? "", loanDays: editing.loanDays ? String(editing.loanDays) : "", forLoan: editing.forLoan }} />
      )}
    </>
  );
}
