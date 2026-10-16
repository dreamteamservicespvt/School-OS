import { requireSettingsPage } from "@/lib/settings/page-access";
import { PageHeader } from "@/components/shell/page-header";
import { Tabs } from "@/components/ui/tabs";

const DATA_SECURITY_TABS = [
  { href: "/settings/data-security", label: "Overview", exact: true },
  { href: "/settings/data-security/imports", label: "Imports" },
  { href: "/settings/data-security/audit-log", label: "Audit log" },
  { href: "/settings/data-security/login-history", label: "Login history" },
  { href: "/settings/data-security/export-log", label: "Export log" },
  { href: "/settings/data-security/privacy", label: "Privacy" },
  { href: "/settings/data-security/consent", label: "Consent" },
];

export default async function DataSecurityLayout({ children }: { children: React.ReactNode }) {
  const { current } = await requireSettingsPage("data-security");
  return (
    <>
      <PageHeader title="Data Backup & Security" href="/settings/data-security" userId={current.user.id} />
      <Tabs label="Data Backup & Security sections" tabs={DATA_SECURITY_TABS} />
      {children}
    </>
  );
}
