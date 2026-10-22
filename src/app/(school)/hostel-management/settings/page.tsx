// Hostel Settings (15 §6): the hostel rules (printed on the allocation
// letter), roll call and visiting timings, the meals of the day, parent
// messages and alerts, the hostels with their wardens, the outing approvers
// (the student's warden; more in Settings, Forms & Approvals), and the
// hostel fee plans linked to Fee Management. Fee amounts show only to people
// with Fee Management; plans are set by people with both pages in full.
import Link from "next/link";
import type { Metadata } from "next";
import { Building2, FileSpreadsheet, IndianRupee, Pencil, Plus, ShieldCheck, UserCog } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatRupees } from "@/lib/format";
import { currentYear } from "@/lib/academic/years";
import { personCampusId } from "@/lib/campus";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Empty, Split, Col, Stack } from "@/components/money/kit";
import { wardensByHostel, currentFeePlans, planTotal } from "@/lib/hostel/settings";
import { GENDER, minuteValue, paiseToRupees, plural } from "@/lib/hostel/words";
import { HostelHead } from "../_components/head";
import { ArchivePlanSheet, CloseHostelSheet, FeePlanSheet, HostelSheet, WardensSheet, type PlanStart } from "../_components/sheets";
import { BASE, hostelGuard, idParam, one, qs, type SearchParams } from "../_lib/page";
import { MealsForm, MessagesForm, RulesForm, TimingsForm } from "./forms";

export const metadata: Metadata = { title: "Hostel Settings · Hostel Management" };

export default async function HostelSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const p = await hostelGuard("settings");
  const { current, can, v, settings: s, mine } = p;
  const ctx = current.ctx;
  const readOnly = !can.settings;
  const seesSettings = (current.permissions["settings"]?.see ?? "none") !== "none";

  const d = await withSchool(ctx, async (tx) => {
    const ids = p.myHostels.map((h) => h.id);
    const [wardens, year, rooms] = await Promise.all([
      wardensByHostel(tx, ids),
      // New plans are for the current year of the person's own campus; the list shows every campus's current plans.
      personCampusId(tx, ctx, current).then((campusId) => currentYear(tx, ctx, campusId)),
      tx.hostelRoom.groupBy({ by: ["hostelId"], where: { hostelId: { in: ids }, archivedAt: null }, _count: { _all: true } }),
    ]);
    const plans = await currentFeePlans(tx, ctx);
    const staff = can.hostels && idParam(sp.wardens) ? await tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] } }, select: { id: true, fullName: true, designation: true, userLoginId: true }, orderBy: { fullName: "asc" }, take: 500 }) : [];
    const notes = await tx.hostel.findMany({ where: { id: { in: ids } }, select: { id: true, note: true } });
    return { wardens, year, plans, staff, rooms, notes: new Map(notes.map((n) => [n.id, n.note])) };
  });

  const base = `${BASE}/settings`;
  const close = base;
  const edit = can.hostels && idParam(sp.hostel) ? p.myHostels.find((h) => h.id === one(sp.hostel)) ?? null : null;
  const closing = can.hostels && idParam(sp.close) ? p.myHostels.find((h) => h.id === one(sp.close)) ?? null : null;
  const wardensFor = can.hostels && idParam(sp.wardens) ? p.myHostels.find((h) => h.id === one(sp.wardens)) ?? null : null;
  const planEdit = can.feePlans && (one(sp.plan) === "new" || idParam(sp.plan)) ? (one(sp.plan) === "new" ? "new" : d.plans.find((x) => x.id === one(sp.plan)) ?? null) : null;
  const planArchive = can.feePlans && idParam(sp.archivePlan) ? d.plans.find((x) => x.id === one(sp.archivePlan)) ?? null : null;
  const hostelName = (id: string | null) => (id ? p.hostels.find((h) => h.id === id)?.name ?? "A closed hostel" : "Every hostel");
  const planStart = (x: (typeof d.plans)[number]): PlanStart => ({
    id: x.id, name: x.name, hostelId: x.hostelId ?? "", roomType: x.roomType ?? "", includesMess: x.includesMess, note: x.note ?? "",
    installments: x.installments.map((i) => ({ label: i.label, due: i.dueDate.toISOString().slice(0, 10), amount: paiseToRupees(i.amountPaise) })),
  });

  return (
    <>
      <HostelHead pageName="Hostel Settings" href={base} mode={p.mode}
        sub={readOnly ? "The hostel rules, timings, wardens and fee plans." : "The hostel rules, timings, meals, messages, wardens and fee plans."}
        actions={can.hostels ? <ButtonLink href={qs(base, { hostel: "new" })} variant="secondary" icon={Building2} scroll={false}>Add a hostel</ButtonLink> : undefined} />
      <Split side={380}>
        <Col>
          <Stack>
            <RulesForm rules={s.rules} readOnly={readOnly} />
            <TimingsForm readOnly={readOnly} start={{ morning: minuteValue(s.morningRollMinute), night: minuteValue(s.nightRollMinute), outingBack: minuteValue(s.outingBackMinute), visitingDays: s.visitingDays, visitFrom: minuteValue(s.visitingFromMinute), visitTo: minuteValue(s.visitingToMinute), lateAfter: s.lateAfterMinutes }} />
            <MealsForm meals={s.meals} readOnly={readOnly} />
            <MessagesForm readOnly={readOnly} start={{ messageOnOut: s.messageOnOut, messageOnReturn: s.messageOnReturn, messageOnLate: s.messageOnLate, messageOnIncident: s.messageOnIncident, alertNightAbsent: s.alertNightAbsent, alertLate: s.alertLate }} />
          </Stack>
        </Col>
        <Col>
          <Stack>
            <Card>
              <CardHeader title="Hostels and wardens" icon={Building2} description={mine === null ? "Each hostel with its floors and wardens." : "Your hostel."} divided />
              {p.myHostels.length === 0 ? (
                <Empty icon={Building2} title="No hostel yet" body={can.hostels ? "Add the boys' or girls' hostel." : "The Principal or School Admin adds the hostels."} action={can.hostels ? <ButtonLink href={qs(base, { hostel: "new" })} variant="primary" icon={Plus} scroll={false}>Add a hostel</ButtonLink> : undefined} />
              ) : (
                <ul className="divide-y divide-line/70">
                  {p.myHostels.map((h) => {
                    const w = d.wardens.get(h.id) ?? [];
                    const n = d.rooms.find((r) => r.hostelId === h.id)?._count._all ?? 0;
                    return (
                      <li key={h.id} className="px-5 py-3.5 flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <b className="font-semibold text-[14.5px] flex-1 min-w-0">{h.name}</b>
                          <Pill tone={h.gender === "GIRLS" ? "brand" : "info"}>{GENDER[h.gender as "BOYS" | "GIRLS"].label}</Pill>
                        </div>
                        <p className="text-[12.5px] text-ink3">{plural(h.floors.length, "floor")} ({h.floors.join(", ")}) · {plural(n, "room")}{d.notes.get(h.id) ? ` · ${d.notes.get(h.id)}` : ""}</p>
                        <p className="text-[13px] text-ink2">{w.length ? w.map((x) => `${x.name} (${x.title.toLowerCase()})${x.userLoginId ? "" : ", no login"}`).join(" · ") : <span className="text-warn">No warden yet</span>}</p>
                        {can.hostels && (
                          <div className="flex gap-3 flex-wrap mt-0.5">
                            <Link href={qs(base, { wardens: h.id })} scroll={false} className="text-[13px] font-semibold text-brand hover:underline inline-flex items-center gap-1"><UserCog size={14} aria-hidden="true" />Wardens</Link>
                            <Link href={qs(base, { hostel: h.id })} scroll={false} className="text-[13px] font-semibold text-ink2 hover:underline inline-flex items-center gap-1"><Pencil size={13} aria-hidden="true" />Change</Link>
                            <Link href={qs(base, { close: h.id })} scroll={false} className="text-[13px] font-semibold text-bad hover:underline">Close hostel</Link>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {can.rooms && <div className="px-5 py-3 border-t border-line"><Link href={`${BASE}/rooms/import`} className="text-[13px] font-semibold text-brand hover:underline inline-flex items-center gap-1.5"><FileSpreadsheet size={14} aria-hidden="true" />Import rooms from a spreadsheet</Link></div>}
            </Card>

            <Card>
              <CardHeader title="Outing approvers" icon={ShieldCheck} divided />
              <div className="px-5 py-4 text-[13.5px] text-ink2 flex flex-col gap-2">
                <p>Outing and leave passes go to the <b className="font-semibold text-ink">warden of the student&apos;s hostel</b>. When that warden asks for the pass, another warden of the hostel approves it, else the Principal. Nobody approves their own request.</p>
                <p className="text-ink3">More approvers can be added in {seesSettings ? <Link href="/settings/forms-approvals" className="text-brand font-semibold hover:underline">Settings, Forms &amp; Approvals</Link> : "Settings, Forms & Approvals"}.</p>
              </div>
            </Card>

            <Card>
              <CardHeader title="Hostel fees" icon={IndianRupee} description={d.year ? `Fee plans for ${d.year.name}. Allocating a bed adds the plan's installments to the student's fees.` : "Set up this academic year first."} divided
                action={can.feePlans && d.year ? <ButtonLink href={qs(base, { plan: "new" })} size="sm" variant="secondary" icon={Plus} scroll={false}>Add plan</ButtonLink> : undefined} />
              {d.plans.length === 0 ? (
                <Empty icon={IndianRupee} title="No hostel fee plan yet" body={can.feePlans ? "Add a plan for each room type, such as Non-AC and AC." : "The Accountant or Principal sets the hostel fee plans."} />
              ) : (
                <ul className="divide-y divide-line/70">
                  {d.plans.map((x) => (
                    <li key={x.id} className="px-5 py-3.5 flex flex-col gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <b className="font-semibold text-[14.5px] flex-1 min-w-0">{x.name}</b>
                        {v.seesFees && <b className="tnum font-semibold">{formatRupees(planTotal(x))}<span className="text-[12px] text-ink3 font-normal"> a year</span></b>}
                      </div>
                      <p className="text-[12.5px] text-ink3">{x.campusName ? `${x.campusName} · ` : ""}{hostelName(x.hostelId)} · {x.roomType ?? "any room"}{x.includesMess ? " · mess included" : ""}</p>
                      <p className="text-[12.5px] text-ink2">{v.seesFees ? x.installments.map((i) => `${i.label}: ${formatRupees(i.amountPaise)}, due ${formatDate(i.dueDate, "UTC")}`).join(" · ") : plural(x.installments.length, "installment")}</p>
                      {can.feePlans && (
                        <div className="flex gap-3 mt-0.5">
                          <Link href={qs(base, { plan: x.id })} scroll={false} className="text-[13px] font-semibold text-brand hover:underline">Change</Link>
                          <Link href={qs(base, { archivePlan: x.id })} scroll={false} className="text-[13px] font-semibold text-ink2 hover:underline">Archive</Link>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {!v.seesFees && d.plans.length > 0 && <p className="px-5 py-3 border-t border-line text-[12.5px] text-ink3">Fee amounts are shown to people with Fee Management.</p>}
              {v.seesFees && <p className="px-5 py-3 border-t border-line text-[12.5px] text-ink3">Hostel fees are collected, receipted and followed up in <Link href="/fee-management" className="text-brand font-semibold hover:underline">Fee Management</Link>, under the Hostel fee head.</p>}
            </Card>
          </Stack>
        </Col>
      </Split>

      {can.hostels && one(sp.hostel) === "new" && <HostelSheet closeHref={close} start={null} />}
      {edit && <HostelSheet closeHref={close} start={{ id: edit.id, name: edit.name, gender: edit.gender as "BOYS" | "GIRLS", floors: edit.floors, note: d.notes.get(edit.id) ?? null }} />}
      {closing && <CloseHostelSheet closeHref={close} hostelId={closing.id} name={closing.name} />}
      {wardensFor && (
        <WardensSheet closeHref={close} hostelId={wardensFor.id} hostelName={wardensFor.name} staff={d.staff.map((x) => ({ id: x.id, name: x.fullName, sub: x.designation ?? "", hasLogin: Boolean(x.userLoginId) }))}
          start={(d.wardens.get(wardensFor.id) ?? []).map((x) => ({ staffId: x.staffId, title: x.title }))} />
      )}
      {planEdit && d.year && <FeePlanSheet closeHref={close} hostels={p.myHostels.map((h) => ({ id: h.id, name: h.name }))} start={planEdit === "new" ? null : planStart(planEdit)} yearName={d.year.name} />}
      {planArchive && <ArchivePlanSheet closeHref={close} planId={planArchive.id} name={planArchive.name} />}
    </>
  );
}
