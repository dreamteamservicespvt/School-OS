import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { redirect } from "next/navigation";
import { requireCurrent } from "@/lib/current";
import { reachFor } from "@/lib/permissions";
import { cleanAccent, cleanTextSize, cleanTheme } from "@/lib/theme";
import { PageHeader } from "@/components/shell/page-header";
import { Appearance } from "../appearance";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Colours and text size") };
}

export default async function AppearancePage() {
  const current = await requireCurrent();
  if (current.support) redirect("/dashboard");
  const u = current.user;
  return (
    <div className="max-w-4xl">
      <PageHeader title="Colours and text size" href="/profile/appearance" userId={u.id}
        sub="Make School OS comfortable for your eyes. Saved to your login, so it follows you to every device."
        crumbs={<><Link href="/profile" className="hover:text-ink hover:underline"><Words k="My profile" /></Link><ChevronRight size={13} aria-hidden="true" /><span><Words k="Appearance" /></span></>} />
      <Appearance
        theme={cleanTheme(u.theme)} accent={cleanAccent(u.accent)} textSize={cleanTextSize(u.textSize)}
        schoolAccent={current.school.accent ? cleanAccent(current.school.accent) : null}
        schoolName={current.school.name}
        canSetForAll={reachFor(current.permissions, "settings", "edit") !== "none"}
        sampleName={u.displayName} />
    </div>
  );
}
