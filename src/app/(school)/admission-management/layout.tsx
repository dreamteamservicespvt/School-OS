import { admissionPage } from "@/lib/admission/page";

/** Admission Management checks the person's reach once for every page; each page draws its own title and tabs. */
export default async function AdmissionLayout({ children }: { children: React.ReactNode }) {
  await admissionPage();
  return <>{children}</>;
}
