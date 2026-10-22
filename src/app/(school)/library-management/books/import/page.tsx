import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PLACES } from "@/lib/imports/places";
import { ImportHome } from "@/components/import/import-home";
import { LibHead } from "../../_components/head";
import { BASE, libGuard } from "../../_lib/page";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Import books · Library Management") };
}

const ABOUT = {
  "library-catalogue": "One row per book, with its copies. Each book is checked as if typed on Add book: the ISBN, the authors and the accession numbers.",
};

/** The catalogue from old software or a spreadsheet (13 Books, P10), on the same engine as Switching to School OS. */
export default async function ImportBooksPage() {
  const p = await libGuard("books");
  if (!p.can.catalogue) redirect(`${BASE}/books`);
  return (
    <>
      <LibHead pageName="Import books" href={`${BASE}/books/import`} mode={p.mode} sub={<Link href={`${BASE}/books`} className="hover:underline"><Words k="Books" /></Link>} />
      <ImportHome current={p.current} place={PLACES.library} about={ABOUT} />
    </>
  );
}
