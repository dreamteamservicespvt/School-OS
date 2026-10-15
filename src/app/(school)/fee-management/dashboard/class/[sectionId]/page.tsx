import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText, Hourglass, IndianRupee, PartyPopper, SearchX, Send, UserRound, Users } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatRupees, formatRupeesShort, formatTime } from "@/lib/format";
import { dayStartUtc } from "@/lib/periods";
import { isoDay } from "@/lib/staff/dates";
import { sectionFees } from "@/lib/fees/by-class";
import { followUpAskedSince } from "@/lib/fees/follow-up";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Chips } from "@/components/ui/chips";
import { DataList, Empty, Stack, Stats, Toolbar } from "@/components/money/kit";
import { UrlSearch } from "@/components/money/url-filters";
import { RemindButton } from "@/components/remind-button";
import { cx } from "@/components/ui/cx";
import { FeeHead } from "../../../_components/fee-head";
import { BASE, feeGuard, one, qs, type SearchParams } from "../../../_lib/page";
import { askFollowUpAction } from "../../actions";

export const metadata = { title: "Fees by class" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const money = (v: bigint) => (v >= BigInt(10_000_000) ? formatRupeesShort(v) : formatRupees(v));

/**
 * One section's students and their fees (owner's prototype changes of 13 Oct 2026,
 * fees-classwise.jsx ClassFeeDetail), opened from Fees by class on the Fee Dashboard.
 * The Accountant collects and reminds parents from here; the Principal, School Admin
 * and Vice Principal read it and can ask the class teacher to follow up.
 */
export default async function ClassFeesPage({ params, searchParams }: { params: Promise<{ sectionId: string }>; searchParams: SearchParams }) {
  const p = await feeGuard("dashboard");
  if (p.level === "admission") redirect(`${BASE}/dashboard`);
  const { sectionId } = await params;
  if (!UUID.test(sectionId)) notFound();
  const sp = await searchParams;
  const show = ["owe", "paid", "all"].includes(one(sp.show)) ? one(sp.show) : "owe";
  const q = one(sp.q).trim().slice(0, 80).toLowerCase();
  const data = await withSchool(p.current.ctx, async (tx) => {
    const s = await sectionFees(tx, p.viewer, sectionId, p.today);
    const asked = s ? await followUpAskedSince(tx, p.current.ctx, [sectionId], dayStartUtc(isoDay(p.today), p.tz)) : new Map<string, Date>();
    return s ? { ...s, askedAt: asked.get(sectionId) ?? null } : null;
  });
  if (!data) notFound();

  const t = data.totals;
  const zero = BigInt(0);
  const owe = data.students.filter((s) => s.pending > zero);
  const rows = data.students
    .filter((s) => (show === "all" || (show === "owe" ? s.pending > zero : s.pending === zero)) && (!q || s.name.toLowerCase().includes(q) || s.admissionNo.toLowerCase().includes(q)))
    .sort((a, b) => (show === "owe" ? b.daysLate - a.daysLate || Number(b.pending - a.pending) : (a.rollNo ?? 9999) - (b.rollNo ?? 9999) || a.name.localeCompare(b.name)));
  const first = data.teacher?.name.split(" ")[0] ?? "";
  const canAsk = p.viewer.see === "all" && owe.length > 0 && Boolean(data.teacher?.userLoginId) && data.teacher?.userLoginId !== p.current.user.id;
  const remind = p.does("defaulters") && owe.some((s) => s.overdue > zero);
  const ledger = p.may("ledger");
  const here = (change: Record<string, string | null>) => qs(`${BASE}/dashboard/class/${sectionId}`, { show: show === "owe" ? null : show, q: one(sp.q) || null, ...change });
  const status = (r: (typeof rows)[number]) => r.pending === zero ? <Pill tone="ok">Paid</Pill>
    : r.overdue > zero ? <span className="inline-flex flex-col items-start gap-0.5"><Pill tone={r.daysLate > 30 ? "bad" : "warn"}>Overdue · {r.daysLate} {r.daysLate === 1 ? "day" : "days"}</Pill>{r.oldest && <span className="text-[12px] text-ink3 max-w-[220px] truncate">{r.oldest.label}</span>}</span>
      : <Pill tone="warn">{r.paid > zero ? "Part paid" : "Not paid"}{r.oldest ? ` · due ${formatDate(r.oldest.dueDate).slice(0, 6)}` : ""}</Pill>;

  return (
    <div>
      <FeeHead pageName="Fee Dashboard" href={`${BASE}/dashboard`} sub={`${data.name} · fees as of today, ${formatDate(p.today)}`} />
      <Stack>
        <div className="flex flex-wrap items-center gap-2.5">
          <ButtonLink href={`${BASE}/dashboard#by-class`} variant="secondary" icon={ArrowLeft}>All classes</ButtonLink>
        </div>
        <Stats items={[
          { label: "Due so far", value: money(t.due), sub: `${t.students} students · fees due in the next 30 days included`, icon: FileText },
          { label: "Collected", value: money(t.paid), sub: `${t.percent}% of what is due`, icon: IndianRupee, tone: "ok" },
          { label: "Pending", value: t.pending > zero ? money(t.pending) : "Nil", sub: t.owe ? `${t.owe} ${t.owe === 1 ? "student" : "students"} · ${money(t.overdue)} overdue` : "Everyone has paid", icon: Hourglass, tone: t.overdue > zero ? "bad" : t.pending > zero ? "warn" : "ok" },
          { label: "Class teacher", value: data.teacher?.name ?? "Not set", sub: data.teacher ? `Looks after ${data.name}` : "Set one in Academic Management", icon: UserRound },
        ]} />
        <Card className="overflow-hidden">
          <CardHeader icon={Users} title={`${data.name} · students and fees`} description={`Pending as of today, ${formatDate(p.today)} · overdue first`} />
          {(canAsk || remind) && (
            <div className="px-5 pb-3 -mt-1 flex gap-2 flex-wrap items-center">
              {canAsk && <RemindButton label={`Ask ${first} to follow up`} variant="secondary" doneLabel="Asked" done={data.askedAt ? formatTime(data.askedAt, p.tz) : null} run={askFollowUpAction.bind(null, sectionId)} />}
              {remind && <ButtonLink size="sm" variant="soft" icon={Send} href={qs(`${BASE}/defaulters`, { section: sectionId, send: "all" })}>Remind parents</ButtonLink>}
              {canAsk && <p className="text-[12.5px] text-ink3 basis-full">{first} gets the names of the families who still owe, to remind at pickup or the PTM. Teachers do not see amounts.</p>}
            </div>
          )}
          <Toolbar>
            <UrlSearch id="class-fee-q" placeholder="Student name or admission no." />
            <Chips label="Show" value={show} options={[
              { value: "owe", label: "Owe", count: owe.length, href: here({ show: null }) },
              { value: "paid", label: "Paid", count: data.students.length - owe.length, href: here({ show: "paid" }) },
              { value: "all", label: "All", count: data.students.length, href: here({ show: "all" }) },
            ]} />
          </Toolbar>
          <DataList rows={rows} rowKey={(r) => r.studentId} minWidth={720} caption={`${data.name}, students and fees`}
            footer={rows.length > 0 ? <span className="tnum">{rows.length} of {data.students.length} students · {data.name}</span> : false}
            columns={[
              { key: "roll", label: "Roll", render: (r) => <span className="tnum text-ink3">{r.rollNo ?? "—"}</span> },
              { key: "name", label: "Student", render: (r) => <><p className="font-semibold leading-tight">{r.name}</p><p className="text-[12.5px] text-ink3">{r.parent ? `${r.parent.name}${r.parent.phone ? ` · ${r.parent.phone}` : ""}` : r.admissionNo}</p></> },
              { key: "due", label: "Due", align: "right", render: (r) => <span className="tnum">{formatRupees(r.due)}</span> },
              { key: "paid", label: "Paid", align: "right", render: (r) => <span className="tnum">{formatRupees(r.paid)}</span> },
              { key: "pending", label: "Pending", align: "right", render: (r) => <span className={cx("font-semibold tnum", r.pending > zero ? "text-bad" : "text-ink3")}>{r.pending > zero ? formatRupees(r.pending) : "—"}</span> },
              { key: "st", label: "Status", nowrap: true, render: status },
              ...(ledger || p.desk ? [{ key: "act", label: "", align: "right" as const, nowrap: true, render: (r: (typeof rows)[number]) => (
                <span className="inline-flex gap-1.5">
                  {ledger && <ButtonLink size="sm" variant="ghost" href={`${BASE}/ledger/${r.studentId}`}>Ledger</ButtonLink>}
                  {p.desk && r.pending > zero && <ButtonLink size="sm" variant="soft" icon={IndianRupee} href={`${BASE}/collect/${r.studentId}`}>Collect</ButtonLink>}
                </span>
              ) }] : []),
            ]}
            phone={(r) => ({
              title: r.name, avatar: r.name,
              sub: `Roll ${r.rollNo ?? "—"}${r.parent ? ` · ${r.parent.name}${r.parent.phone ? ` · ${r.parent.phone}` : ""}` : ""}`,
              right: <><p className={cx("font-semibold tnum text-[14.5px]", r.pending > zero ? "text-bad" : "text-ok")}>{r.pending > zero ? formatRupees(r.pending) : "Paid"}</p>{r.pending > zero && <p className={cx("text-[12px] tnum", r.overdue > zero ? "text-bad" : "text-ink3")}>{r.overdue > zero ? `Overdue · ${r.daysLate} days` : r.oldest ? `Due ${formatDate(r.oldest.dueDate).slice(0, 6)}` : "Not late"}</p>}</>,
            })}
            empty={<Empty icon={show === "owe" && !q ? PartyPopper : SearchX} title={show === "owe" && !q ? `Everyone in ${data.name} has paid` : "No student matches"} body={show === "owe" && !q ? "Nothing is pending." : "Try another name or filter."} />} />
        </Card>
      </Stack>
    </div>
  );
}
