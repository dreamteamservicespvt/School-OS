import type { Metadata } from "next";
import * as I from "lucide-react";
import { requireCurrent } from "@/lib/current";
import { findModule } from "@/lib/modules";
import { EmptyState } from "@/components/empty-state";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "No access" };

/** Where a page the person's roles do not include sends them (main.jsx NoAccess). */
export default async function NoAccess({ searchParams }: { searchParams: Promise<{ m?: string; off?: string }> }) {
  const current = await requireCurrent();
  const { m, off } = await searchParams;
  const mod = findModule(m ?? "");
  const name = mod?.name ?? "This page";
  const roles = current.roles.map((r) => r.name).join(" and ") || "your role";
  return (
    <div className="max-w-xl mx-auto mt-4 md:mt-10">
      <EmptyState Icon={off ? I.PowerOff : I.Lock}
        title={off ? `${name} is switched off for ${current.school.name}` : `${name} is not in your menu`}
        action={<ButtonLink href="/dashboard" variant="secondary" icon={I.House} className="mt-2">Go to your home</ButtonLink>}>
        {off
          ? "The School Admin can switch it on in Settings, Modules On/Off. Nothing is lost while it is off."
          : `As ${roles}, you do not have this module. The School Admin can change roles in Settings, Users & Permissions.`}
      </EmptyState>
    </div>
  );
}
