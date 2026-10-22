import type { Metadata } from "next";
import Link from "next/link";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { lastBackup } from "@/lib/data-security/privacy";
import { exportExpired, EXPORT_LINK_HOURS } from "@/lib/data-security/data-export";
import { daysAgo, securityAlerts, TWO_STEP_FEATURE } from "@/lib/data-security/alerts";
import { describeDevice } from "@/lib/data-security/audit-view";
import { codeChannels } from "@/lib/auth/two-step";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ExportButton, TwoStepSwitch, AutoRefresh } from "./parts";
import { REMEMBER_DAYS } from "@/lib/auth/remembered";
import { schoolRoles } from "@/lib/school-roles";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Data Backup & Security") };
}

function backupWords(at: Date, tz: string, now = new Date()) {
  const day = formatDate(at, tz);
  const today = formatDate(now, tz);
  const yesterday = formatDate(new Date(now.getTime() - 86_400_000), tz);
  return `${day === today ? "today" : day === yesterday ? "yesterday" : day}, ${formatTime(at, tz)}`;
}

export default async function DataSecurityPage() {
  const { current, may } = await requireSettingsPage("data-security");
  const tz = current.school.timeZone;
  const since = daysAgo(30);
  const [backup, data] = await Promise.all([
    lastBackup(),
    withSchool(current.ctx, async (tx) => {
      const exports = await tx.dataExport.findMany({ orderBy: { createdAt: "desc" }, take: 5 });
      const jobs = await tx.backgroundJob.findMany({ where: { idempotencyKey: { in: exports.map((e) => `data-export:${e.id}`) } }, select: { idempotencyKey: true, status: true } });
      const alerts = await securityAlerts(tx, since);
      const ids = [...new Set([...exports.map((e) => e.requestedById), ...alerts.map((a) => a.userLoginId)].filter((x): x is string => Boolean(x)))];
      const people = ids.length ? await tx.schoolAccess.findMany({ where: { userLoginId: { in: ids } }, select: { userLogin: { select: { id: true, displayName: true } } } }) : [];
      const twoStep = await tx.schoolFeature.findUnique({ where: { schoolId_featureKey: { schoolId: current.ctx.schoolId, featureKey: TWO_STEP_FEATURE } } });
      const twoStepRoles = await schoolRoles(tx, current.ctx, { where: { requiresTwoStep: true, isEnabled: true, archivedAt: null }, select: { name: true } });
      // The people those roles cover, to say who no code can reach yet.
      const sensitive = await tx.schoolAccess.findMany({
        where: { archivedAt: null, userLogin: { status: "ACTIVE", archivedAt: null }, roles: { some: { role: { requiresTwoStep: true, isEnabled: true, archivedAt: null } } } },
        select: { userLogin: { select: { id: true, displayName: true, email: true, phone: true } } },
      });
      return { exports, jobStatus: new Map(jobs.map((j) => [j.idempotencyKey, j.status])), alerts, names: new Map(people.map((p) => [p.userLogin.id, p.userLogin.displayName])), twoStepOn: twoStep?.isOn ?? false, twoStepRoles: [...new Set(twoStepRoles.map((r) => r.name))], sensitive: sensitive.map((s) => s.userLogin) };
    }),
  ]);
  const unreachable: { id: string; displayName: string }[] = [];
  if (data.twoStepOn) {
    for (const p of data.sensitive) {
      const can = await codeChannels(p, current.ctx.schoolId);
      if (!can.email && !can.phone) unreachable.push(p);
    }
  }
  const canExport = may.export;
  const canEdit = may.edit;
  const preparing = data.exports.some((e) => e.status === "preparing" && data.jobStatus.get(`data-export:${e.id}`) !== "failed");

  return (
    <>
      <h2 className="sr-only"><Words k="Overview" /></h2>
      {preparing && <AutoRefresh seconds={8} />}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Backups" />
          <CardBody className="space-y-3">
            {backup.at ? (
              <p className="text-xl font-semibold"><Words k="Last backup:" /> {backupWords(backup.at, tz)}</p>
            ) : (
              <Alert tone="warning" title="No backup has been recorded on this server yet">
                <Words k="On the live service a full copy is made every night and the database is backed up continuously. This server has not recorded one yet; DREAM TEAM sets this up before a school's real data goes in." />
              </Alert>
            )}
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
              <li><Words k="The database is backed up continuously, with a full copy every night; files every night." /></li>
              <li><Words k="Copies are kept in a second, separate place in India: any moment of the last 7 days, nightly copies for 30 days, monthly copies for 1 year." /></li>
              <li><Words k="A restore is tested every month" />{backup.restoreTestedAt ? `; the last one passed on ${formatDate(backup.restoreTestedAt, tz)}` : ""}.</li>
              <li><Words k="To bring back your school's data as it was at a chosen moment, ask DREAM TEAM through Support. Other schools are not touched." /></li>
            </ul>
          </CardBody>
        </Card>

        <Card id="export">
          <CardHeader title="Export all school data" description={`A ZIP with one spreadsheet (CSV) for each kind of record you may see. It is prepared in the background; the download link works for ${EXPORT_LINK_HOURS} hours.`} />
          <CardBody className="space-y-4">
            {canExport && <ExportButton disabled={preparing} />}
            {data.exports.length > 0 && (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {data.exports.map((e) => {
                  const job = data.jobStatus.get(`data-export:${e.id}`);
                  const mine = e.requestedById === current.user.id;
                  const expired = e.status === "ready" && exportExpired(e.readyAt);
                  return (
                    <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                      <div>
                        <p className="font-medium">{formatDateTime(e.createdAt, tz)}</p>
                        <p className="text-sm text-ink-2"><Words k="Asked by" /> {e.requestedById ? data.names.get(e.requestedById) ?? "someone" : "School OS"}</p>
                      </div>
                      {e.status === "ready" && !expired && mine ? (
                        <a href={`/settings/data-security/exports/${e.id}`} className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-ink hover:bg-brand-hover"><Words k="Download ZIP" /></a>
                      ) : e.status === "ready" ? (
                        <Badge>{expired ? "Link expired" : "Ready (only for the person who asked)"}</Badge>
                      ) : e.status === "failed" || job === "failed" ? (
                        <Badge tone="danger"><Words k="Did not finish. Ask again." /></Badge>
                      ) : (
                        <Badge tone="warning"><Words k="Preparing…" /></Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Two-step login" description="After the password, a 6-digit one-time code sent to the person's email or phone." />
          <CardBody className="space-y-3">
            <p className="flex flex-wrap items-center gap-2">
              {data.twoStepOn ? <Badge tone="success"><Words k="On" /></Badge> : <Badge><Words k="Off" /></Badge>}
              <span className="text-ink-2">
                {data.twoStepRoles.length ? `Needed for: ${data.twoStepRoles.join(", ")}.` : "No role needs it yet."} <Words k="Roles are chosen in" />{" "}
                <Link href="/settings/users" className="font-medium text-brand-text underline"><Words k={"Users & Permissions"} /></Link>.
              </span>
            </p>
            <p className="text-sm text-ink-2"><Words k="After the code, a device is remembered and does not ask again until the person signs out there (or does not use it for" /> {REMEMBER_DAYS} <Words k={"days). On a shared computer they tick “Shared computer” to be asked every time. If a phone is lost, another School Admin or the Principal resets two-step login in Users & Permissions."} /></p>
            {unreachable.length > 0 && (
              <Alert tone="warning" title={`No code can reach ${unreachable.length === 1 ? "1 person" : `${unreachable.length} people`} yet`}>
                {unreachable.map((p) => p.displayName).join(", ")} <Words k="still sign" />{unreachable.length === 1 ? "s" : ""} <Words k="in with the password only, so nobody is locked out. Add a mobile number or email for them in" />{" "}
                <Link href="/settings/users" className="font-medium text-brand-text underline"><Words k={"Users & Permissions"} /></Link><Words k=", or set up SMS in Communication." />
              </Alert>
            )}
            {canEdit && <TwoStepSwitch on={data.twoStepOn} />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Security alerts" description="Unusual sign-ins, locked pickup code checks and large exports in the last 30 days." />
          <CardBody>
            {data.alerts.length === 0 ? (
              <p className="text-ink-2"><Words k="Nothing unusual in the last 30 days." /></p>
            ) : (
              <ul className="space-y-3">
                {data.alerts.map((a) => (
                  <li key={a.id} className="flex items-start gap-3">
                    <Badge tone={a.tone}>{a.tone === "danger" ? "Check" : "Note"}</Badge>
                    <div className="min-w-0">
                      <p className="font-medium">{a.kind}</p>
                      <p className="text-sm text-ink-2">
                        {a.userLoginId ? data.names.get(a.userLoginId) ?? "A person" : "Someone"} · {formatDateTime(a.at, tz)}
                        {a.device ? ` · ${describeDevice(a.device)}` : ""}{a.ipAddress ? ` · ${a.ipAddress}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/settings/data-security/login-history?outcome=failed" className="mt-3 inline-flex min-h-11 items-center font-medium text-brand-text hover:underline"><Words k="See failed sign-ins" /></Link>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
