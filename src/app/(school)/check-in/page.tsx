import type { Metadata } from "next";
import { requireCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { attendanceFeatures, attendanceSettings } from "@/lib/attendance/settings";
import { ScanFace } from "lucide-react";
import { formatDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { CheckInPanel } from "./check-in-panel";

export const metadata: Metadata = { title: "Check-in" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Where a scanned attendance QR opens, and staff mobile check-in (05 §2 Devices & QR). */
export default async function CheckInPage({ searchParams }: Props) {
  const sp = await searchParams;
  const current = await requireCurrent();
  const code = typeof sp.q === "string" && /^[0-9a-f-]{36}\.[\w-]{10,40}$/i.test(sp.q) ? sp.q : null;
  const schoolId = typeof sp.s === "string" ? sp.s : null;
  const mobile = await withSchool(current.ctx, async (tx) => {
    const features = await attendanceFeatures(tx, current.ctx);
    if (!features.has("attendance-mobile")) return false;
    const settings = await attendanceSettings(tx, current.ctx);
    const staff = await tx.staff.findFirst({ where: { userLoginId: current.user.id, archivedAt: null }, select: { id: true } });
    return Boolean(staff) && settings.staffMethods.includes("mobile");
  });
  return (
    <Card className="mx-auto mt-4 max-w-md px-5 py-7 sm:px-8">
      <span aria-hidden className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand"><ScanFace size={28} /></span>
      <h1 className="mb-1 text-center font-display text-[24px] font-semibold">Check-in</h1>
      <p className="mb-6 text-center text-[14px] text-ink3">{current.school.name} · {formatDate(new Date(), current.school.timeZone ?? "Asia/Kolkata")}</p>
      {typeof sp.q === "string" && !code ? (
        <div role="alert" className="rounded-2xl border border-danger/30 bg-danger-soft px-5 py-8 text-center text-danger">
          <p className="text-xl font-semibold">This QR is not valid</p>
          <p className="mt-2">Scan the QR poster at the school entrance again.</p>
        </div>
      ) : (
        <CheckInPanel code={code} schoolId={schoolId} mobile={mobile} />
      )}
    </Card>
  );
}
