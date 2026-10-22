import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/current";
import { PageHeader } from "@/components/shell/page-header";
import { settingsPagesFor } from "@/lib/settings-pages";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsHome() {
  const current = await requirePage("settings");
  const t = await getT();
  return (
    <>
      <PageHeader title="Settings" href="/settings" userId={current.user.id} />
      <p className="-mt-3 mb-5 text-ink-2">{t("School-wide settings. Each module keeps its own rules on its last page.")}</p>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {settingsPagesFor(current).map((p) => (
          <li key={p.href}>
            <Link href={p.href} className="block h-full rounded-2xl border border-line bg-surface p-5 shadow-card hover:border-brand">
              <h2 className="font-semibold">{t.any(p.label)}</h2>
              <p className="mt-1 text-sm text-ink-2">{t.any(p.about)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
