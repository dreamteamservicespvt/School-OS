import type { Metadata } from "next";
import { requireCurrent } from "@/lib/current";
import { findModule } from "@/lib/modules";
import { EmptyState } from "@/components/empty-state";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "No access" };

export default async function NoAccess({ searchParams }: { searchParams: Promise<{ m?: string; off?: string }> }) {
  const current = await requireCurrent();
  const { m, off } = await searchParams;
  const mod = findModule(m ?? "");
  const name = mod?.name ?? "this page";
  return (
    <EmptyState title={off ? `${name} is switched off for ${current.school.name}` : `Your role does not include ${name}`}>
      <p>{off ? "Your School Admin can switch it on in Settings, Modules On/Off. Nothing is lost while it is off." : "Ask your School Admin if you need it. Roles are set in Settings, Users & Permissions."}</p>
      <div className="mt-4"><ButtonLink href="/dashboard">Go to the Dashboard</ButtonLink></div>
    </EmptyState>
  );
}
