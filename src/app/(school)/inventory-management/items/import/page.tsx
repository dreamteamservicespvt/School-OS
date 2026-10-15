import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ImportPage } from "../../_components/import-page";
import { BASE, invGuard } from "../../_lib/page";

export const metadata: Metadata = { title: "Import items · Inventory Management" };

export default async function ImportItemsPage() {
  const p = await invGuard("items");
  if (!p.can.stock) redirect(`${BASE}/items`);
  return <ImportPage p={p} kind="items" />;
}
