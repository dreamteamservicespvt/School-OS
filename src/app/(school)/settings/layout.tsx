import { requirePage } from "@/lib/current";
import { Tabs } from "@/components/ui/tabs";
import { PageTabs } from "@/components/shell/page-header";
import { settingsPagesFor } from "@/lib/settings-pages";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const current = await requirePage("settings");
  // The tabs show under each page's title (PageHeader), as in every other module (layman loop 5).
  return (
    <PageTabs tabs={<Tabs label="Settings pages" tabs={[{ href: "/settings", label: "Overview", exact: true }, ...settingsPagesFor(current).map((p) => ({ href: p.href, label: p.label }))]} />}>
      {children}
    </PageTabs>
  );
}
