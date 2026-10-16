import { requirePage } from "@/lib/current";
import { Tabs } from "@/components/ui/tabs";
import { settingsPagesFor } from "@/lib/settings-pages";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const current = await requirePage("settings");
  return (
    <>
      <Tabs label="Settings pages" tabs={[{ href: "/settings", label: "Overview", exact: true }, ...settingsPagesFor(current).map((p) => ({ href: p.href, label: p.label }))]} />
      {children}
    </>
  );
}
