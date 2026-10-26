import type { Metadata } from "next";
import { settingsMay } from "@/lib/settings/page-access";
import * as I from "lucide-react";
import { requireCurrent, type Current } from "@/lib/current";
import { findModule, type ModuleKey } from "@/lib/modules";
import { reachFor } from "@/lib/permissions";
import { withSchool } from "@/lib/db";
import { noAccessWords } from "@/lib/no-access";
import { loadSettings } from "@/lib/admission/settings";
import { EmptyState } from "@/components/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { admissionTabs } from "../admission-management/_components/head";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("No access") };
}

type Page = { href: string; label: string };

/** The pages of a module the person can use, for modules that list them. */
async function usablePages(module: ModuleKey, current: Current): Promise<Page[]> {
  if (module === "admission-management") {
    const reach = current.permissions["admission-management"];
    const settings = await withSchool(current.ctx, (tx) => loadSettings(tx, current.ctx));
    return admissionTabs(reach, settings).map((t) => ({ href: t.href, label: t.label }));
  }
  return [];
}

/** Where a page the person's roles do not include sends them (main.jsx NoAccess). */
export default async function NoAccess({ searchParams }: { searchParams: Promise<{ m?: string; off?: string }> }) {
  const current = await requireCurrent();
  const { m, off } = await searchParams;
  const mod = findModule(m ?? "");
  const key = mod?.key as ModuleKey | undefined;
  const hasModule = Boolean(key && !off && reachFor(current.permissions, key, "view") !== "none");
  const pages = hasModule && key ? await usablePages(key, current) : [];
  const words = noAccessWords({
    name: mod?.name ?? "This page", schoolName: current.school.name, roles: current.roles.map((r) => r.name).join(" and ") || "your role",
    off: Boolean(off), hasModule, pages: pages.map((p) => p.label), turnsOn: settingsMay(current, "modules").edit,
  });
  return (
    <div className="max-w-xl mx-auto mt-4 md:mt-10">
      <EmptyState Icon={off ? I.PowerOff : I.Lock} title={words.title}
        action={(
          <div className="flex flex-wrap justify-center gap-2 mt-2">
            {pages.map((p, i) => <ButtonLink key={p.href} href={p.href} variant={i === 0 ? "primary" : "secondary"}>{p.label}</ButtonLink>)}
            <ButtonLink href="/dashboard" variant="secondary" icon={I.House}>Go to your home</ButtonLink>
          </div>
        )}>
        {words.body}
      </EmptyState>
    </div>
  );
}
