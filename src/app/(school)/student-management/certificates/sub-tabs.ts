// The two tabs inside Certificates & ID Cards.
import { withSchool } from "@/lib/db";
import { campusFilter } from "@/lib/campus-scope";
import type { Tab } from "@/components/ui/tabs";
import { BASE, studentPage } from "../_lib/page";

export async function certificateTabs(): Promise<Tab[]> {
  const { current } = await studentPage();
  const C = `${BASE}/certificates`;
  // A person kept to one campus counts that campus's students' certificates only, as the list shows them.
  const count = await withSchool(current.ctx, async (tx) => tx.certificate.count({ where: await campusFilter(tx, "Certificate", current) }));
  return [
    { href: C, label: "Certificates", exact: true, also: [`${C}/new`], count },
    { href: `${C}/id-cards`, label: "ID cards" },
  ];
}
