import { staffPage } from "@/lib/staff/page";

/** Staff & HR Management (09). Each page draws its own header and the module's pages as tabs (_components/head.tsx). */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  await staffPage();
  return <>{children}</>;
}
