import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ImportPage } from "../../_components/import-page";
import { BASE, invGuard } from "../../_lib/page";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Import assets · Inventory Management") };
}

export default async function ImportAssetsPage() {
  const p = await invGuard("assets");
  if (!p.can.assets) redirect(`${BASE}/assets`);
  return <ImportPage p={p} kind="assets" />;
}
