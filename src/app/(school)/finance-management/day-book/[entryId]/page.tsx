import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { dayBookSourceLink } from "@/lib/finance/source-link";
import { PAY_SECTIONS, PAY_SOURCES } from "@/lib/finance/access";
import { financePage } from "../../_lib/page";
import { sourceLinkAccess } from "../../_lib/source-link";

const UUID = /^[0-9a-f-]{36}$/i;
/** Entries the Day Book lists: everything except opening balances and money moved between accounts. */
const NOT_LISTED_SECTIONS = ["opening", "transfer"];
const NOT_LISTED_SOURCES = ["transfer", "transfer-cancel"];

/**
 * Ledger lines link here. An entry the Day Book lists opens there on its own
 * date, with where it came from; an opening balance or a money move (not in
 * the Day Book's income and expense) opens in Cash & Bank.
 */
export default async function DayBookEntryLink({ params }: { params: Promise<{ entryId: string }> }) {
  const p = await financePage();
  const { entryId } = await params;
  const e = UUID.test(entryId)
    ? await withSchool(p.current.ctx, (tx) => tx.dayBookEntry.findFirst({ where: { id: entryId }, select: { id: true, date: true, section: true, sourceType: true, sourceId: true, accountId: true, accountHeadId: true } }))
    : null;
  if (!e) redirect("/finance-management/day-book");
  // Staff pay stays hidden from people who may not see it (src/lib/finance/access.ts).
  const isPay = PAY_SECTIONS.includes(e.section) || PAY_SOURCES.includes(e.sourceType) || Boolean(p.payHeads && e.accountHeadId && p.payHeads.includes(e.accountHeadId));
  if (p.payHeads && isPay) redirect("/finance-management/day-book");
  if (NOT_LISTED_SECTIONS.includes(e.section) || NOT_LISTED_SOURCES.includes(e.sourceType)) {
    const link = dayBookSourceLink(e, sourceLinkAccess(p.current));
    if (link) redirect(link[1]);
  }
  const d = e.date.toISOString().slice(0, 10);
  redirect(`/finance-management/day-book?period=custom&from=${d}&to=${d}&e=${e.id}`);
}
