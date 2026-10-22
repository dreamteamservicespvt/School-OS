import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ImportPage } from "../../../../_components/import-page";
import { BASE, invGuard } from "../../../../_lib/page";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Check a file · Import assets") };
}

/** One file of assets: match, fix, check every row and bring in the good ones. */
export default async function AssetsImportFilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await invGuard("assets");
  if (!p.can.assets) redirect(`${BASE}/assets`);
  return <ImportPage p={p} kind="assets" file={{ id: (await params).id, sp: await searchParams }} />;
}
