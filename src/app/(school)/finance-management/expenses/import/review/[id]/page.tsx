import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PLACES } from "@/lib/imports/places";
import { FileReview } from "@/components/import/file-review";
import { FinanceHead } from "../../../../_components/finance-head";
import { BASE, financePage } from "../../../../_lib/page";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Check a file · Import past expenses" };

/** One file of past expenses: match, fix, check every row and bring in the good ones. */
export default async function ExpenseImportFilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await financePage();
  if (!p.may("expenses") || !p.can.create) redirect(`${BASE}/expenses`);
  return (
    <>
      <FinanceHead pageName="Import past expenses" href={`${BASE}/expenses/import`}
        sub={<Link href={`${BASE}/expenses`} className="font-semibold text-brand hover:underline"><Words k="Expenses" /></Link>} />
      <FileReview current={p.current} place={PLACES.finance} id={(await params).id} sp={await searchParams} />
    </>
  );
}
