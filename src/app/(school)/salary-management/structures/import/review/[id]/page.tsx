import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PLACES } from "@/lib/imports/places";
import { FileReview } from "@/components/import/file-review";
import { SalaryHead } from "../../../../_components/salary-head";
import { BASE, salaryGuard } from "../../../../_lib/page";

export const metadata: Metadata = { title: "Check a file · Import salary" };

/** One file of salary structures: match, fix, check every row and bring in the good ones. */
export default async function StructuresImportFilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await salaryGuard("structures");
  if (!p.change) redirect(`${BASE}/structures`);
  return (
    <>
      <SalaryHead pageName="Import salary" href={`${BASE}/structures/import`} sub={<Link href={`${BASE}/structures`} className="font-semibold text-brand hover:underline">Salary Structures</Link>} />
      <FileReview current={p.current} place={PLACES.salary} id={(await params).id} sp={await searchParams} />
    </>
  );
}
