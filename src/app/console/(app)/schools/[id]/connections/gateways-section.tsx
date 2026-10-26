// Console, a school's Connections: its payment gateways (Razorpay first). DREAM TEAM
// adds, tests and switches them on here; the school's Settings, Payment Gateways
// only shows them, and its Fee Settings chooses which classes use which one.
import Link from "next/link";
import { withConsoleSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { findProvider } from "@/lib/payments/providers";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";

export async function GatewaysSection({ schoolId }: { schoolId: string }) {
  const { school, rows } = await withConsoleSchool(schoolId, async (tx) => ({
    school: await tx.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timeZone: true } }),
    rows: await tx.paymentGatewayAccount.findMany({
      where: { schoolId },
      orderBy: [{ archivedAt: { sort: "desc", nulls: "first" } }, { isActive: "desc" }, { displayName: "asc" }],
      select: { id: true, displayName: true, provider: true, environment: true, isActive: true, archivedAt: true, lastTestAt: true, lastTestOk: true },
    }),
  }));
  const tz = school.timeZone;
  const base = `/console/schools/${schoolId}/connections/gateways`;
  const live = rows.filter((r) => !r.archivedAt);
  const noneOn = live.length > 0 && !live.some((r) => r.isActive);

  return (
    <section id="gateways" className="scroll-mt-20" aria-label="Payment gateways">
      <Card>
        <CardHeader title="Payment gateways" description="The school’s own Razorpay account, so parents can pay fees online. Keys are stored encrypted and never shown again. The school sees each gateway’s status and chooses which classes use it in Fee Settings."
          action={<Link href={`${base}/new`} className={buttonClass("primary", "sm")}>Add a gateway</Link>} />
        <CardBody>
          {noneOn && <Alert tone="warning" className="mb-3" title="No gateway is switched on">Parents cannot pay online yet. Open a gateway, test it, then switch it on.</Alert>}
          {rows.length === 0 ? (
            <p className="text-ink2">No payment gateway yet. Parents pay at the counter until one is added and switched on.</p>
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((r) => {
                const p = findProvider(r.provider);
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{r.displayName}</p>
                      <p className="text-sm text-ink2">
                        {p?.name ?? r.provider} · {r.lastTestAt
                          ? <span className={r.lastTestOk ? "text-success" : "text-danger"}>Last test {r.lastTestOk ? "passed" : "had a problem"}, {formatDateTime(r.lastTestAt, tz)}</span>
                          : "Not tested yet"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {r.archivedAt ? <Badge>Archived</Badge> : r.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}
                      {r.environment === "live" ? <Badge tone="brand">Live</Badge> : <Badge tone="warning">Test</Badge>}
                    </div>
                    <Link href={`${base}/${r.id}`} className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-brand-text hover:bg-sunken">
                      {r.archivedAt ? "View" : "Edit or test"}<span className="sr-only"> {r.displayName}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </section>
  );
}
