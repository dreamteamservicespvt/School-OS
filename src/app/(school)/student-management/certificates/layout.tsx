import { certificatesPage } from "../_lib/page";

/** Certificates & ID Cards (03 §2): two tabs, drawn by each page (sub-tabs.ts). */
export default async function CertificatesLayout({ children }: { children: React.ReactNode }) {
  await certificatesPage();
  return <>{children}</>;
}
