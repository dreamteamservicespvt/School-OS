// A mention of a Settings page ("Settings, Document Designs") that is a link
// for people who may open Settings, and plain words for everyone else (so
// nobody is sent to a page they cannot open).
import Link from "next/link";
import { getCurrent } from "@/lib/current";
import { can } from "@/lib/permissions";

export async function SettingsLink({ href, children }: { href: string; children: React.ReactNode }) {
  const current = await getCurrent();
  if (!current || !can(current.permissions, "settings", "view")) return <>{children}</>;
  return <Link href={href} className="font-medium text-brand-text underline">{children}</Link>;
}
