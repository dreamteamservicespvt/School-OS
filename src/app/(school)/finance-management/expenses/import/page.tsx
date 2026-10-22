import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PLACES } from "@/lib/imports/places";
import { ImportHome } from "@/components/import/import-home";
import { FinanceHead } from "../../_components/finance-head";
import { BASE, financePage } from "../../_lib/page";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Import past expenses · Finance Management" };

const ABOUT = {
  "finance-past-expenses": "One row per expense paid this financial year before School OS, with its expense head (Finance Settings). They are kept as Brought in, so expense reports cover the whole year; they never reach the Day Book or the cash and bank books, because the opening balances already include them.",
};

/** Workflow 15, step 8: past expenses of this financial year, brought in by the Accountant from Finance Management. */
export default async function ExpenseImportPage() {
  const p = await financePage();
  if (!p.may("expenses") || !p.can.create) redirect(`${BASE}/expenses`);
  return (
    <>
      <FinanceHead pageName="Import past expenses" href={`${BASE}/expenses/import`}
        sub={<><Words k="Moving from old software or registers." /> <Link href={`${BASE}/expenses`} className="font-semibold text-brand hover:underline"><Words k="Expenses" /></Link></>} />
      <ImportHome current={p.current} place={PLACES.finance} about={ABOUT} />
    </>
  );
}
