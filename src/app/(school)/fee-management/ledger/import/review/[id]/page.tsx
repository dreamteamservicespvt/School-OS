import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PLACES } from "@/lib/imports/places";
import { FileReview } from "@/components/import/file-review";
import { FeeHead } from "../../../../_components/fee-head";
import { BASE, feeGuard, type SearchParams } from "../../../../_lib/page";

export const metadata: Metadata = { title: "Check a file · Import old dues and receipts" };

/** One file of old dues or past receipts: match, fix, check every row and bring in the good ones. */
export default async function FeeImportFilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const p = await feeGuard("ledger");
  if (!p.can.change) redirect(`${BASE}/ledger`);
  return (
    <>
      <FeeHead pageName="Import old dues and receipts" href={`${BASE}/ledger/import`}
        sub={<Link href={`${BASE}/ledger`} className="font-semibold text-brand hover:underline">Student Fee Ledger</Link>} />
      <FileReview current={p.current} place={PLACES.fees} id={(await params).id} sp={await searchParams} />
    </>
  );
}
