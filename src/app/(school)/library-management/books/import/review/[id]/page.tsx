import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PLACES } from "@/lib/imports/places";
import { FileReview } from "@/components/import/file-review";
import { LibHead } from "../../../../_components/head";
import { BASE, libGuard } from "../../../../_lib/page";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Check a file · Import books" };

/** One catalogue file: match, fix, check every row and bring in the good ones. */
export default async function BooksImportFilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await libGuard("books");
  if (!p.can.catalogue) redirect(`${BASE}/books`);
  return (
    <>
      <LibHead pageName="Import books" href={`${BASE}/books/import`} mode={p.mode} sub={<Link href={`${BASE}/books`} className="hover:underline"><Words k="Books" /></Link>} />
      <FileReview current={p.current} place={PLACES.library} id={(await params).id} sp={await searchParams} />
    </>
  );
}
