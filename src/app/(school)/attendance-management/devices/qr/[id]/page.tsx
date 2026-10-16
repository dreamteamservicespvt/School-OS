import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { appOrigin } from "@/lib/origin";
import { attendancePage } from "@/lib/attendance/page";
import { BASE } from "@/lib/attendance/access";
import { posterData, posterHtml, posterThemes } from "@/lib/attendance/poster";
import { UUID_RE } from "@/lib/staff/act";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader, Detail } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ActionButton } from "../../../../staff-hr-management/_components/forms";
import { PosterPreview } from "../../../_components/poster-preview";
import { qrStateAction } from "../../actions";

export const metadata: Metadata = { title: "QR poster" };

export default async function QrPosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { current, access, settings, tz, today, now } = await attendancePage();
  if (!access.admin) redirect(BASE);
  const origin = await appOrigin();
  const data = await withSchool(current.ctx, async (tx) => {
    const session = await tx.qrSession.findFirst({ where: { id, archivedAt: null } });
    if (!session) return null;
    return { session, poster: await posterData(tx, current.ctx, session, origin, today) };
  });
  if (!data) notFound();
  const { session } = data;
  const expired = session.expiresAt && session.expiresAt < now;
  const posters = posterThemes().map((t) => ({ ...t, html: posterHtml(data.poster, t.value, { preview: true }) }));

  return (
    <>
      <PageHeader title={`QR poster: ${session.name}`} href={`${BASE}/devices/qr/${session.id}`} userId={current.user.id}>
        <Link href={`${BASE}/devices?view=qr`} className="font-medium text-brand-text hover:underline">All QR posters</Link>
      </PageHeader>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader title="Poster" description="School branding, the QR code and short instructions. No personal data is printed." />
          <CardBody>
            {!session.isActive && <Alert tone="warning" className="mb-4">This QR is stopped. Scans are refused until it is started again.</Alert>}
            {expired && <Alert tone="danger" className="mb-4">This QR expired on {formatDate(session.expiresAt!, tz)}. Create a new one.</Alert>}
            <PosterPreview posters={posters} initial={settings.posterTheme} pdfHref={`${BASE}/devices/qr/${session.id}/pdf`} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="About this QR" action={<Badge tone={!session.isActive ? "neutral" : expired ? "danger" : "success"}>{!session.isActive ? "Stopped" : expired ? "Expired" : "On"}</Badge>} />
          <CardBody className="space-y-3">
            <Detail label="Who checks in">{session.forWhom === "both" ? "Staff and students" : session.forWhom === "students" ? "Students" : "Staff"}</Detail>
            <Detail label="Code">{session.rotation === "fixed" ? "Fixed: print once" : `Changes every day: today's code is valid on ${formatDate(today, "UTC")} only. Show this page on a screen at the entrance, or print each morning.`}</Detail>
            <Detail label="Expires">{session.expiresAt ? formatDate(session.expiresAt, tz) : "Does not expire"}</Detail>
            <div className="flex flex-wrap gap-2 pt-2">
              <ActionButton action={qrStateAction} hidden={{ qrId: session.id, change: session.isActive ? "stop" : "start" }} size="md">{session.isActive ? "Stop" : "Start"}</ActionButton>
              <ActionButton action={qrStateAction} hidden={{ qrId: session.id, change: "new-code" }} size="md" variant="danger-outline">New code</ActionButton>
            </div>
            <p className="text-sm text-ink-2">A new code makes printed posters stop working. Use it if a photo of the poster is being shared.</p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
