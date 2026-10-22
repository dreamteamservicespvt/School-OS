import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ImportPage } from "../../../../_components/import-page";
import { BASE, invGuard } from "../../../../_lib/page";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Check a file · Import items") };
}

/** One file of items: match, fix, check every row and bring in the good ones. */
export default async function ItemsImportFilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await invGuard("items");
  if (!p.can.stock) redirect(`${BASE}/items`);
  return <ImportPage p={p} kind="items" file={{ id: (await params).id, sp: await searchParams }} />;
}
