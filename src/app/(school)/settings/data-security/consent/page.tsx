import type { Metadata } from "next";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { consentTexts, LANGUAGE_NAMES, READY_TEXTS } from "@/lib/data-security/consent";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConsentForm } from "./form";

export const metadata: Metadata = { title: "Consent · Data Backup & Security" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ConsentPage({ searchParams }: Search) {
  const current = await requirePage("settings");
  const sp = await searchParams;
  const tz = current.school.timeZone;
  const data = await withSchool(current.ctx, async (tx) => {
    const school = await tx.school.findUnique({ where: { id: current.ctx.schoolId }, select: { languages: true, defaultLanguage: true } });
    const people = await tx.schoolAccess.findMany({ select: { userLogin: { select: { id: true, displayName: true } } } });
    return { types: await consentTexts(tx), school, names: new Map(people.map((p) => [p.userLogin.id, p.userLogin.displayName])) };
  });
  const langs = [...new Set([data.school?.defaultLanguage ?? "en", ...(data.school?.languages ?? ["en"])])];
  const canEdit = can(current.permissions, "settings", "edit");
  const starts = Object.fromEntries(data.types.map((t) => [t.key, t.current
    ? { title: t.current.title, text: t.current.text as Record<string, string>, askedOnAdmission: t.current.askedOnAdmission }
    : { title: READY_TEXTS[t.key]?.title ?? "", text: READY_TEXTS[t.key] ? { en: READY_TEXTS[t.key].en } : {}, askedOnAdmission: t.key === "data-processing" || t.key === "photo" }]));
  const chosen = typeof sp.type === "string" && data.types.some((t) => t.key === sp.type) ? sp.type : data.types[0]?.key ?? "data-processing";

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <h2 className="sr-only">Consent</h2>
      <div className="space-y-4">
        {data.types.map((t) => (
          <Card key={t.key} id={`type-${t.key}`}>
            <CardHeader title={t.label}
              description={t.current ? `Version ${t.current.version} since ${formatDate(t.current.createdAt, tz)}${t.current.askedOnAdmission ? " · asked on the admission form" : ""}` : "No text yet. Guardians are not asked for this."}
              action={t.current ? <Badge tone="success">In use</Badge> : <Badge>Not set up</Badge>} />
            {t.current && (
              <CardBody className="space-y-3">
                <p className="font-medium">{t.current.title}</p>
                <p className="whitespace-pre-line text-ink-2">{(t.current.text as Record<string, string>)[langs[0]] ?? Object.values(t.current.text as Record<string, string>)[0]}</p>
                {t.versions.length > 1 && (
                  <details>
                    <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-brand-text">Earlier versions ({t.versions.length - 1})</summary>
                    <ol className="mt-2 space-y-3 border-l-2 border-line pl-4">
                      {t.versions.filter((v) => !v.isCurrent).map((v) => (
                        <li key={v.id}>
                          <p className="text-sm font-medium">Version {v.version} · {formatDate(v.createdAt, tz)}{v.createdById ? ` · ${data.names.get(v.createdById) ?? "someone"}` : ""}</p>
                          <p className="whitespace-pre-line text-sm text-ink-2">{(v.text as Record<string, string>)[langs[0]] ?? Object.values(v.text as Record<string, string>)[0]}</p>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </CardBody>
            )}
          </Card>
        ))}
        <Card>
          <CardHeader title="Who has agreed" />
          <CardBody>
            <p className="text-ink-2">Each guardian&apos;s consent, given on the admission form or through Parent Link and confirmed by a one-time code, is kept on the guardian in Student Management, with the version agreed to. The log by consent type and class (given, not given, withdrawn) appears here once Student Management records consents.</p>
          </CardBody>
        </Card>
      </div>
      <div>
        <Card className="xl:sticky xl:top-4">
          <CardHeader title={canEdit ? "Change a text or add a type" : "Consent texts"} />
          <CardBody>
            {canEdit ? (
              <ConsentForm initialType={chosen} starts={starts}
                types={data.types.map((t) => ({ value: t.key, label: t.label }))}
                languages={langs.map((code) => ({ code, name: LANGUAGE_NAMES[code] ?? code }))} />
            ) : <p className="text-ink-2">Your role can read the consent texts but not change them.</p>}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
