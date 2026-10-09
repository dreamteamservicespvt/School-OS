import { requirePage } from "@/lib/current";
import { Tabs } from "@/components/ui/tabs";
import { SETTINGS_PAGES } from "@/lib/settings-pages";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requirePage("settings");
  return (
    <>
      <Tabs label="Settings pages" tabs={[{ href: "/settings", label: "Overview", exact: true }, ...SETTINGS_PAGES.map((p) => ({ href: p.href, label: p.label }))]} />
      {children}
    </>
  );
}
