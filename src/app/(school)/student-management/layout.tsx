import { studentPage } from "./_lib/page";

/** Student Management (03). Each page draws its own header and the module's pages as tabs (_lib/head.tsx). */
export default async function StudentManagementLayout({ children }: { children: React.ReactNode }) {
  await studentPage();
  return <>{children}</>;
}
