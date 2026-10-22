// One stock audit (14 Items & Stock): count each item in the store; the
// screen shows the difference from the system. Sent on, the differences wait
// for approval and post as Audit adjustments only when approved (14 §5).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { Stack, DL, Banner } from "@/components/money/kit";
import { itemLabel } from "@/lib/inventory/items";
import { AUDIT_STATUS } from "@/lib/inventory/words";
import { InvHead } from "../../../_components/head";
import { AuditCounts } from "../../../_components/audit-counts";
import { DecideBox } from "../../../_components/decide";
import { BASE, invGuard, UUID } from "../../../_lib/page";
import { decidable, whoNames } from "../../../_lib/lists";
import { decideAction, saveCountsAction } from "../../../actions";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Stock audit · Inventory Management" };

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const p = await invGuard("items");
  const { current, can, tz } = p;
  const d = await withSchool(current.ctx, async (tx) => {
    const audit = await tx.stockAudit.findFirst({ where: { id }, include: { lines: true } });
    if (!audit) return null;
    const [items, store, who, mine] = await Promise.all([
      tx.item.findMany({ where: { id: { in: audit.lines.map((l) => l.itemId) } } }),
      tx.storeLocation.findFirst({ where: { id: audit.locationId } }),
      whoNames(tx, [audit.createdById]),
      decidable(tx, current.ctx, [audit.approvalId]),
    ]);
    return { audit, items: new Map(items.map((i) => [i.id, i])), store, who, mine: audit.approvalId ? mine.has(audit.approvalId) : false };
  });
  if (!d) notFound();
  const { audit } = d;
  const st = AUDIT_STATUS[audit.status];
  const lines = audit.lines
    .map((l) => ({ l, it: d.items.get(l.itemId) }))
    .filter((x) => x.it)
    .sort((a, b) => a.it!.name.localeCompare(b.it!.name))
    .map(({ l, it }) => ({ itemId: l.itemId, name: itemLabel(it!), code: it!.code, unit: it!.unit, system: l.systemQty, counted: l.countedQty === null ? "" : String(l.countedQty), note: l.note ?? "", pricePaise: Number(it!.pricePaise ?? BigInt(0)) }));
  return (
    <>
      <InvHead pageName={audit.name} href={`${BASE}/items/audits/${audit.id}`} mode={p.mode} sub={<><Link href={`${BASE}/items?view=audits`} className="hover:underline"><Words k="Stock audits" /></Link> · {audit.number}</>} />
      <Stack>
        {audit.status === "WAITING" && (d.mine
          ? <DecideBox action={decideAction} approvalId={audit.approvalId!} question="Approve these differences? Stock changes to the counts as Audit adjustments." />
          : <Banner tone="info" title="Waiting for approval"><Words k="The differences change stock only when approved." /></Banner>)}
        {audit.status === "APPROVED" && <Banner tone="ok" title="Approved"><Words k="The differences were posted as Audit adjustments" />{audit.decidedAt ? ` on ${formatDateTime(audit.decidedAt, tz)}` : ""}.</Banner>}
        {audit.status === "REJECTED" && <Banner tone="warn" title="Not approved"><Words k="Stock was not changed." />{audit.decisionNote ? ` Reason: ${audit.decisionNote}` : ""}</Banner>}
        <Card>
          <CardHeader title="Counts" description={audit.status === "OPEN" ? "Type what is on the shelf. The difference shows as you type." : st.label} divided />
          <AuditCounts action={saveCountsAction} auditId={audit.id} lines={lines} editable={audit.status === "OPEN" && can.stock} />
        </Card>
        <Card>
          <CardHeader title="About this audit" divided />
          <div className="p-5">
            <DL cols={2} rows={[["Store", d.store?.name ?? ""], ["Started", formatDate(audit.startedOn, "UTC")], ["By", d.who.get(audit.createdById ?? "") ?? ""], ["Status", st.label]]} />
          </div>
        </Card>
      </Stack>
    </>
  );
}
