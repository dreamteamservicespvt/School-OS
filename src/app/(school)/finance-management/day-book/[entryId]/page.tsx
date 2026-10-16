import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { financePage } from "../../_lib/page";

const UUID = /^[0-9a-f-]{36}$/i;

/** Ledger lines link here: the entry opens in the Day Book on its own date. */
export default async function DayBookEntryLink({ params }: { params: Promise<{ entryId: string }> }) {
  const p = await financePage();
  const { entryId } = await params;
  const e = UUID.test(entryId) ? await withSchool(p.current.ctx, (tx) => tx.dayBookEntry.findFirst({ where: { id: entryId }, select: { id: true, date: true } })) : null;
  if (!e) redirect("/finance-management/day-book");
  const d = e.date.toISOString().slice(0, 10);
  redirect(`/finance-management/day-book?period=custom&from=${d}&to=${d}&e=${e.id}`);
}
