import type { Metadata } from "next";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { consentTexts, LANGUAGE_NAMES, READY_TEXTS } from "@/lib/data-security/consent";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { can } from "@/lib/permissions";
import { consentLog, type ConsentCounts } from "@/lib/students/consent-log";
import { goLiveConsentStatus } from "@/lib/parent-link/consent";
import { ConsentForm } from "./form";

const n = (x: number) => x.toLocaleString("en-IN");
/** "212 of 318 given (40 from paper forms) · 61 waiting · 3 refused · 2 withdrawn · 40 not asked" */
function counts(c: ConsentCounts) {
  const parts = [`${n(c.given)} of ${n(c.total)} given${c.fromPaper ? ` (${n(c.fromPaper)} from paper forms)` : ""}`];
  if (c.waiting) parts.push(`${n(c.waiting)} waiting`);
  if (c.refused) parts.push(`${n(c.refused)} refused`);
  if (c.withdrawn) parts.push(`${n(c.withdrawn)} withdrawn`);
  if (c.notAsked) parts.push(`${n(c.notAsked)} not asked`);
  return parts.join(" · ");
}

export const metadata: Metadata = { title: "Consent · Data Backup & Security" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ConsentPage({ searchParams }: Search) {
  const { current, may } = await requireSettingsPage("data-security");
  const sp = await searchParams;
  const tz = current.school.timeZone;
  const data = await withSchool(current.ctx, async (tx) => {
    const school = await tx.school.findUnique({ where: { id: current.ctx.schoolId }, select: { languages: true, defaultLanguage: true } });
    const people = await tx.schoolAccess.findMany({ select: { userLogin: { select: { id: true, displayName: true } } } });
    return { types: await consentTexts(tx), school, names: new Map(people.map((p) => [p.userLogin.id, p.userLogin.displayName])), log: await consentLog(tx, current.ctx, { campusId: current.campusId }), goLive: await goLiveConsentStatus(tx, current.ctx) };
  });
  const langs = [...new Set([data.school?.defaultLanguage ?? "en", ...(data.school?.languages ?? ["en"])])];
  const canEdit = may.edit;
  const mayRecord = can(current.permissions, "student-management", "create");
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
        {data.goLive && (
          <Card id="asked-on-go-live">
            <CardHeader title="Asked on going live" description="The consent request sent with each parent's Parent Link when the school went live on School OS." />
            <CardBody className="space-y-2">
              <p className="tnum"><strong>{n(data.goLive.asked)}</strong> {data.goLive.asked === 1 ? "parent" : "parents"} asked · <strong>{n(data.goLive.answered)}</strong> answered · <strong>{n(data.goLive.waiting)}</strong> waiting</p>
              <ul className="space-y-1 text-[13.5px] text-ink-2 tnum">
                {data.goLive.byType.map((t) => (
                  <li key={t.consentType}>{data.types.find((x) => x.key === t.consentType)?.label ?? t.consentType}: {n(t.given)} of {n(t.asked)} given · {n(t.waiting)} waiting{t.refused ? ` · ${n(t.refused)} refused` : ""}{t.withdrawn ? ` · ${n(t.withdrawn)} withdrawn` : ""}</li>
                ))}
              </ul>
              <p className="text-[13.5px] text-ink-2">Remind those waiting from Communication, Parent Link, Consent forms.</p>
            </CardBody>
          </Card>
        )}
        <Card id="who-agreed">
          <CardHeader title="Who has agreed" description="This year's students, by consent and class. A student counts as given while a parent on record has agreed (in Parent Link, on the application form or on a signed paper form)."
            action={mayRecord ? <ButtonLink href="/settings/data-security/consent/paper" size="sm" variant="secondary">Paper forms received</ButtonLink> : undefined} />
          <CardBody className="space-y-5">
            {data.log.length === 0 ? <p className="text-ink-2">No consent texts yet, so nobody has been asked.</p> : data.log.map((t) => (
              <section key={t.consentType} aria-labelledby={`log-${t.consentType}`} className="space-y-2">
                <h3 id={`log-${t.consentType}`} className="font-semibold">{t.title} <span className="font-normal text-ink-2">· version {t.version}</span></h3>
                <p className="text-[13.5px] tnum">{counts(t.totals)}</p>
                {t.classes.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-[13px] tnum">
                      <caption className="sr-only">{t.title} by class</caption>
                      <thead><tr className="text-left text-ink-2"><th scope="col" className="py-1 pr-2 font-medium">Class</th><th scope="col" className="px-2 font-medium">Given</th><th scope="col" className="px-2 font-medium">From paper</th><th scope="col" className="px-2 font-medium">Waiting</th><th scope="col" className="px-2 font-medium">Refused</th><th scope="col" className="px-2 font-medium">Withdrawn</th><th scope="col" className="px-2 font-medium">Not asked</th></tr></thead>
                      <tbody>
                        {t.classes.map((c) => (
                          <tr key={c.classId} className="border-t border-line/70"><th scope="row" className="py-1 pr-2 text-left font-medium">{c.className}</th><td className="px-2">{c.given} of {c.total}</td><td className="px-2">{c.fromPaper}</td><td className="px-2">{c.waiting}</td><td className="px-2">{c.refused}</td><td className="px-2">{c.withdrawn}</td><td className="px-2">{c.notAsked}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))}
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
