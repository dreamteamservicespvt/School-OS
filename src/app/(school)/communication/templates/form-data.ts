import "server-only";

import type { SchoolContext } from "@/lib/db";
import { withSchool } from "@/lib/db";
import { CHANNELS, CHANNEL_LABEL } from "@/lib/messaging/channels";
import { LANGUAGES, TEMPLATE_CATEGORIES, VARIABLES } from "@/lib/messaging/templates";
import type { TemplateFormData } from "./template-form";

/** What the template form needs; null when the template is not found. */
export async function templateFormData(ctx: SchoolContext, id: string | null, schoolLanguage: string): Promise<TemplateFormData | null> {
  const base = {
    categories: TEMPLATE_CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
    channels: CHANNELS.map((c) => ({ key: c, label: CHANNEL_LABEL[c] })),
    languages: LANGUAGES,
    variables: VARIABLES,
  };
  if (!id) {
    const lang = LANGUAGES.some((l) => l.code === schoolLanguage) ? schoolLanguage : "en";
    return { ...base, id: null, name: "", category: "general", channel: "whatsapp", texts: [{ language: lang, subject: "", body: "", dltTemplateId: "", locked: false, saved: false }] };
  }
  const t = await withSchool(ctx, (tx) => tx.template.findFirst({ where: { id, schoolId: ctx.schoolId, archivedAt: null }, include: { versions: { where: { isCurrent: true }, orderBy: { language: "asc" } } } }));
  if (!t) return null;
  return {
    ...base,
    id: t.id,
    name: t.name,
    category: t.category,
    channel: t.channel,
    texts: t.versions.map((v) => ({ language: v.language, subject: v.subject ?? "", body: v.body, dltTemplateId: v.dltTemplateId ?? "", locked: v.whatsappStatus === "APPROVED", saved: true })),
  };
}
