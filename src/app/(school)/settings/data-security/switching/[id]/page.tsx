import type { Metadata } from "next";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { PLACES } from "@/lib/imports/places";
import { FileReview } from "@/components/import/file-review";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Check a file · Switching to School OS") };
}

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** One file of the move-in (workflow 15): the same steps as on every import page. */
export default async function MoveInFilePage({ params, searchParams }: Props) {
  const { current } = await requireSettingsPage("data-security");
  return <FileReview current={current} place={PLACES.settings} id={(await params).id} sp={await searchParams} />;
}
