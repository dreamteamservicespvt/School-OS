import { redirect } from "next/navigation";
import { BASE, studentPage } from "../_lib/page";

/** Certificates & ID Cards (03 §2): two tabs, drawn by each page (sub-tabs.ts). */
export default async function CertificatesLayout({ children }: { children: React.ReactNode }) {
  const { can } = await studentPage();
  if (can.reach !== "all" || can.lookupOnly) redirect(BASE);
  return <>{children}</>;
}
