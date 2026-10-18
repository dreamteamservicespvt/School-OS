import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpDown, CheckCheck, CircleAlert, ClipboardCheck, Eye, FolderOpen, HeartHandshake, History, ListOrdered, Printer, School, ShieldCheck, Users, type LucideIcon,
} from "lucide-react";
import type { ApplicationStage } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { momentWhere, periodFromSearch } from "@/lib/periods";
import { workPage, BASE } from "@/lib/admission/page";
import { UUID_RE } from "@/lib/admission/act";
import { progressOf } from "@/lib/admission/documents";
import { classRules, openYears, stageOn } from "@/lib/admission/settings";
import { bestSection, seatsFor, fullWords } from "@/lib/admission/seats";
import { bestTestPct, outcomeLabel } from "@/lib/admission/tests";
import { blockers, familyQuestion, type FamilyQuestion } from "@/lib/admission/convert";
import { names } from "@/lib/admission/choices";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Banner, Chips, LinkTabs } from "@/components/ui/chips";
import { Avatar } from "@/components/ui/avatar";
import { Split, Timeline } from "@/components/ui/rows";
import { PeriodFilter } from "@/components/list/period-filter";
import { EmptyState } from "@/components/empty-state";
import { cx } from "@/components/ui/cx";
import { AdmissionHead } from "../_components/head";
import { ConfirmButton, DecideButtons, OfferButtons, OfferSeat, Rerank, WaitMove } from "./decision-forms";

export const metadata: Metadata = { title: "Admission Decision" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const PATH = `${BASE}/decision`;
const NONE = "00000000-0000-0000-0000-000000000000";
const TONE_TEXT = { ok: "text-ok", warn: "text-warn", bad: "text-bad", brand: "text-brand", neutral: "text-ink3" } as const;
type FactTone = keyof typeof TONE_TEXT;

export default async function DecisionPage({ searchParams }: Search) {
  const { current, viewer, settings, year, tz, today } = await workPage();
  const raw = await searchParams;
  const tabs = ["ready", "approved", ...(settings.waitingListOn ? ["waiting"] : []), "done"];
  const tab = tabs.includes(one(raw.tab)) ? one(raw.tab) : "ready";
  const focus = UUID_RE.test(one(raw.focus)) ? one(raw.focus) : null;
  const range = periodFromSearch(raw, { timeZone: tz });
  const canChange = viewer.change === "all";
  const mayApprove = can(current.permissions, "admission-management", "approve");
  // Only the Principal rejects an admission (owner's rules, 12 Oct 2026); the server checks it again.
  const mayRejectAdmission = current.roles.some((r) => r.key === "principal");

  const data = await withSchool(current.ctx, async (tx) => {
    const years = await openYears(tx);
    const yearIds = years.length ? years.map((y) => y.id) : [NONE];
    const n = await names(tx);
    const base = { archivedAt: null, academicYearId: { in: yearIds } };
    const decidedWhere = { ...base, stage: { in: ["APPROVED", "REJECTED", "ADMITTED"] as ApplicationStage[] }, decidedAt: range ? momentWhere(range, tz) : { not: null } };
    const [readyCount, approvedCount, waitingCount, doneCount] = await Promise.all([
      tx.application.count({ where: { ...base, stage: "DECISION" } }),
      tx.application.count({ where: { ...base, stage: "APPROVED" } }),
      tx.application.count({ where: { ...base, stage: "WAITING_LIST" } }),
      tx.application.count({ where: decidedWhere }),
    ]);
    const stage: ApplicationStage = tab === "ready" ? "DECISION" : tab === "approved" ? "APPROVED" : "WAITING_LIST";
    const apps = tab === "done" ? [] : await tx.application.findMany({
      where: { ...base, stage },
      orderBy: tab === "waiting" ? [{ classId: "asc" }, { waitingRank: "asc" }] : [{ updatedAt: "asc" }],
      take: 200,
      include: {
        documents: { select: { docType: true, status: true } },
        tests: { where: { archivedAt: null }, include: { test: { select: { maxMarks: true } } } },
        interviews: { where: { cancelledAt: null, outcome: { not: null } }, orderBy: { startsAt: "desc" }, take: 1 },
        payments: { select: { status: true, cancelledAt: true, amountPaise: true } },
      },
    });
    const decided = tab === "done" ? await tx.application.findMany({ where: decidedWhere, orderBy: { decidedAt: "desc" }, take: 100, select: { id: true, fullName: true, classId: true, academicYearId: true, stage: true, decidedAt: true, decidedById: true, decisionRemarks: true, studentId: true } }) : [];
    const yearsOf = [...new Set(apps.map((a) => a.academicYearId))];
    const seatMaps = await Promise.all(yearsOf.map(async (y) => [y, await seatsFor(tx, y)] as const));
    const seats = new Map(seatMaps);
    const rules = await classRules(tx);
    const approvals = await tx.approval.findMany({ where: { id: { in: apps.map((a) => a.approvalId).filter((x): x is string => Boolean(x)) } }, select: { id: true, status: true, askedById: true, createdAt: true } });
    const block = new Map<string, string[]>();
    // A phone on record under another name: the person says whether it is the same family before confirming.
    const familyAsk = new Map<string, FamilyQuestion>();
    if (tab === "approved") {
      for (const a of apps) {
        block.set(a.id, await blockers(tx, current.ctx, a));
        const q = await familyQuestion(tx, a);
        if (q) familyAsk.set(a.id, q);
      }
    }
    const siblings = await tx.student.findMany({ where: { id: { in: apps.map((a) => a.siblingStudentId).filter((x): x is string => Boolean(x)) } }, select: { id: true, fullName: true } });
    const history = tab === "waiting" ? await tx.applicationActivity.findMany({ where: { kind: "waiting-list", application: base }, orderBy: { at: "desc" }, take: 30, include: { application: { select: { classId: true } } } }) : [];
    const userIds = [...new Set([...decided.map((d) => d.decidedById), ...history.map((h) => h.byId), ...approvals.map((a) => a.askedById)].filter((x): x is string => Boolean(x)))];
    const users = await tx.userLogin.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } });
    return { years, n, apps, decided, seats, rules, approvals, block, familyAsk, siblings, history, users, counts: { ready: readyCount, approved: approvedCount, waiting: waitingCount, done: doneCount } };
  });

  const { n } = data;
  const who = (id: string | null) => data.users.find((u) => u.id === id)?.displayName ?? "Staff";
  const yl = (id: string) => { const y = data.years.find((x) => x.id === id); return y ? (y.status === "ACTIVE" && year && year.id !== y.id ? `${y.name} mid-year` : y.name) : ""; };
  const seatOf = (a: { academicYearId: string; classId: string }) => data.seats.get(a.academicYearId)?.get(a.classId);
  const seatText = (a: { academicYearId: string; classId: string }) => {
    const c = seatOf(a);
    if (!c || c.seats === 0) return `${n.classes.get(a.classId) ?? "This class"} has no sections set up yet.`;
    return c.free > 0 ? `Seats left: ${c.sections.map((s) => `${s.name} ${s.free}`).join(" · ")}` : fullWords(c);
  };
  const sibling = new Map(data.siblings.map((s) => [s.id, s.fullName]));
  const tabHref = (t: string) => (t === "ready" ? PATH : `${PATH}?tab=${t}`);
  const anyApproval = data.approvals.some((a) => ["WAITING", "ESCALATED"].includes(a.status));
  const waitClasses = [...new Set(data.apps.map((a) => a.classId))];
  const wcls = tab === "waiting" ? (waitClasses.includes(one(raw.class)) ? one(raw.class) : waitClasses[0] ?? null) : null;

  const facts = (a: (typeof data.apps)[number]) => {
    const p = progressOf(a.documents, data.rules.get(a.classId)?.documents ?? []);
    const pct = bestTestPct(a.tests);
    const iv = a.interviews[0];
    const c = seatOf(a);
    const out: [LucideIcon, string, FactTone][] = [
      [FolderOpen, p.complete ? `Papers ${p.requiredVerified} of ${p.required} verified` : `${p.unverifiedRequired[0] ?? "Papers"} not verified`, p.complete ? "ok" : "warn"],
    ];
    if (stageOn(settings, "test") || a.tests.length) {
      const t = a.tests.find((x) => x.marks !== null);
      out.push([ClipboardCheck, t ? `Test ${Number(t.marks)} of ${t.test.maxMarks}${pct !== null ? ` (${Math.round(pct)}%)` : ""}` : a.tests.some((x) => x.absent) ? "Absent for the test" : a.tests.length ? "Test not scored yet" : "No test taken", "neutral"]);
    }
    if (stageOn(settings, "interview") || iv) out.push([Users, iv ? `Interview: ${outcomeLabel(iv.outcome)}` : "Interview not recorded", iv?.outcome === "RECOMMENDED" ? "ok" : iv?.outcome === "NOT_RECOMMENDED" ? "bad" : "neutral"]);
    out.push([HeartHandshake, a.siblingStudentId ? `Sibling: ${sibling.get(a.siblingStudentId) ?? "in school"}` : "No sibling here", a.siblingStudentId ? "brand" : "neutral"]);
    out.push([School, !c || c.seats === 0 ? "No sections set up yet" : c.free === 0 ? `${c.className} is full (${c.enrolled + c.held} of ${c.seats})` : seatText(a), !c || c.free === 0 ? "bad" : c.free <= 3 ? "warn" : "neutral"]);
    return out;
  };

  return (
    <>
      <AdmissionHead href={PATH} sub={mayApprove ? "Approve or reject with remarks, keep the waiting list and confirm admissions" : "Decisions here need approval (Settings, Forms & Approvals)"} />
      <div className="flex flex-col gap-4">
        {canChange && !viewer.overCapacity && anyApproval && (
          <Banner tone="info" icon={ShieldCheck} title="Principal approval is on.">Decisions waiting in Approvals are made there by the approver. Once approved, you confirm the admission when the family accepts.</Banner>
        )}
        <div className="flex flex-col md:flex-row md:items-end gap-3 justify-between">
          <LinkTabs value={tab} label="Decision views" className="flex-1 min-w-0" tabs={[
            { id: "ready", label: "Ready for decision", count: data.counts.ready, href: tabHref("ready") },
            { id: "approved", label: "Approved, to confirm", count: data.counts.approved, href: tabHref("approved") },
            ...(settings.waitingListOn ? [{ id: "waiting", label: "Waiting list", count: data.counts.waiting, href: tabHref("waiting") }] : []),
            { id: "done", label: "Decided", count: data.counts.done, href: tabHref("done") },
          ]} />
          {tab === "done" && <PeriodFilter timeZone={tz} allLabel="Any date decided" className="md:w-56" />}
        </div>

        {tab === "ready" && (data.apps.length ? (
          <div className="grid xl:grid-cols-2 gap-4">
            {data.apps.map((a) => {
              const approval = data.approvals.find((x) => x.id === a.approvalId && ["WAITING", "ESCALATED"].includes(x.status));
              const c = seatOf(a);
              const isFull = Boolean(c && c.seats > 0 && c.free === 0);
              const canDecide = canChange && mayApprove && (!approval || viewer.overCapacity) && approval?.askedById !== current.user.id;
              return (
                <Card key={a.id} id={`app-${a.id}`} className={cx("p-4 md:p-5 flex flex-col gap-3.5", focus === a.id && "ring-2 ring-brand")}>
                  <div className="flex items-start gap-3.5">
                    <Avatar name={a.fullName} size={46} />
                    <div className="min-w-0 flex-1">
                      <Link href={`${BASE}/applications/${a.id}`} className="font-semibold text-[16px] leading-tight hover:underline">{a.fullName}</Link>
                      <p className="text-[13px] text-ink3">{n.classes.get(a.classId) ?? ""} · {yl(a.academicYearId)} · <span className="font-mono text-[12px]">{a.applicationNo}</span>{a.category ? ` · Category: ${a.category}` : ""}</p>
                    </div>
                    {approval && <Pill tone="info" className="shrink-0 hidden sm:inline-flex">With the Principal</Pill>}
                  </div>
                  <ul className="grid md:grid-cols-2 gap-x-4 gap-y-2">
                    {facts(a).map(([Ic, t, tone]) => (
                      <li key={t} className="flex items-center gap-2 text-[13.5px] min-w-0"><Ic size={16} className={cx("shrink-0", TONE_TEXT[tone])} aria-hidden="true" /><span className={cx("truncate", tone === "bad" && "text-bad font-semibold", tone === "warn" && "text-warn font-semibold")}>{t}</span></li>
                    ))}
                  </ul>
                  {approval && <p className="text-[12.5px] text-ink3 -mt-1">Sent by {who(approval.askedById)} on {formatDate(approval.createdAt, tz)}. Also waiting in Approvals.</p>}
                  {canChange && (
                    <div className="flex gap-2 flex-wrap pt-1">
                      {approval && !canDecide && <ButtonLink variant="soft" icon={ShieldCheck} href="/approvals">Open in Approvals</ButtonLink>}
                      <DecideButtons id={a.id} name={a.fullName} sub={`${n.classes.get(a.classId) ?? ""} · ${yl(a.academicYearId)} · ${a.applicationNo}`} canDecide={canDecide} canReject={mayRejectAdmission} full={isFull} waitingList={settings.waitingListOn} seatsNote={seatText(a)} />
                      <ButtonLink variant="ghost" icon={Eye} href={`${BASE}/applications/${a.id}`}>Application</ButtonLink>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          <Card><EmptyState bare Icon={CheckCheck} title="Nothing waiting for a decision" action={<ButtonLink href={`${BASE}/applications`} variant="secondary">See applications</ButtonLink>}>Applications arrive here once papers, tests and interviews are done.</EmptyState></Card>
        ))}

        {tab === "approved" && (
          <Card className="overflow-hidden">
            <CardHeader title="Approved, waiting to be confirmed" description="Confirm when the family accepts. Papers must be verified first, unless an exception is recorded." />
            {data.apps.length === 0 ? <EmptyState bare Icon={CheckCheck} title="Everyone approved is admitted">Approved applications show here until the admission is confirmed.</EmptyState> : (
              <ul className="divide-y divide-line/70 border-t border-line/70">
                {data.apps.map((a) => {
                  const blocks = data.block.get(a.id) ?? [];
                  const c = seatOf(a);
                  const best = c ? bestSection(c) : null;
                  const sections = (c?.sections ?? []).map((s) => ({ value: s.id, label: `${s.name} · ${s.free} left` }));
                  return (
                    <li key={a.id} className={cx("p-4 md:px-5 flex flex-col lg:flex-row lg:items-center gap-3", focus === a.id && "bg-brand/5")}>
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Avatar name={a.fullName} size={42} />
                        <div className="min-w-0">
                          <p className="font-semibold text-[15px] leading-tight"><Link href={`${BASE}/applications/${a.id}`} className="hover:underline">{a.fullName}</Link> <span className="text-ink3 font-normal text-[13px]">· {n.classes.get(a.classId) ?? ""} · {yl(a.academicYearId)}</span></p>
                          <p className="text-[12.5px] text-ink3">Approved {a.decidedAt ? formatDate(a.decidedAt, tz) : ""} · {settings.offerLettersOn ? (a.offerLetterNo ? `Offer letter ${a.offerLetterNo} sent ${a.offerSentAt ? formatDate(a.offerSentAt, tz) : ""}${a.offerAcceptedAt ? ` · accepted ${formatDate(a.offerAcceptedAt, tz)}` : ""}` : "Offer letter not sent") : a.decisionRemarks ?? ""}</p>
                          <div className="flex gap-1.5 mt-1.5 flex-wrap">
                            {blocks.length ? blocks.map((b) => <Pill key={b} tone="warn" className="!h-[22px] !text-[11.5px]">{b.length > 60 ? `${b.slice(0, 57)}…` : b}</Pill>) : <Pill tone="ok" className="!h-[22px] !text-[11.5px]">Ready to confirm</Pill>}
                            {a.offerAcceptedAt && <Pill tone="ok" className="!h-[22px] !text-[11.5px]">Offer accepted</Pill>}
                          </div>
                        </div>
                      </div>
                      {canChange && (
                        <div className="flex gap-2 flex-wrap">
                          {settings.offerLettersOn && <OfferButtons id={a.id} sent={Boolean(a.offerSentAt)} accepted={Boolean(a.offerAcceptedAt)} hasEmail={Boolean(a.email)} />}
                          {settings.offerLettersOn && a.offerLetterNo && <ButtonLink variant="ghost" icon={Printer} href={`${PATH}/${a.id}/offer-letter`} target="_blank">Print</ButtonLink>}
                          {blocks.length === 0 && sections.length > 0
                            ? <ConfirmButton id={a.id} name={a.fullName} sub={`${n.classes.get(a.classId) ?? ""} · ${yl(a.academicYearId)} · ${a.applicationNo}`} sections={sections} defaultSection={best?.id ?? null} today={today} family={data.familyAsk.get(a.id) ?? null} />
                            : <ButtonLink variant="soft" icon={CircleAlert} href={`${BASE}/applications/${a.id}`}>See what is missing</ButtonLink>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        {tab === "waiting" && (data.apps.length === 0 ? (
          <Card><EmptyState bare Icon={ListOrdered} title="The waiting list is empty">Applicants put on the waiting list appear here in priority order.</EmptyState></Card>
        ) : wcls && (
          <>
            <Chips value={wcls} label="Class" options={waitClasses.map((c) => ({ value: c, label: n.classes.get(c) ?? "", count: data.apps.filter((a) => a.classId === c).length, href: `${PATH}?tab=waiting&class=${c}` }))} />
            <Split>
              <Card className="overflow-hidden">
                <CardHeader title={`Waiting list · ${n.classes.get(wcls) ?? ""}`} description="Ranked by the school’s rules: sibling, category, test score, date applied"
                  action={canChange && data.apps.filter((a) => a.classId === wcls).length > 1 ? <Rerank yearId={data.apps.find((a) => a.classId === wcls)!.academicYearId} classId={wcls} className={n.classes.get(wcls) ?? ""} /> : undefined} />
                <ol className="divide-y divide-line/70 border-t border-line/70">
                  {data.apps.filter((a) => a.classId === wcls).map((a, i, arr) => (
                    <li key={a.id} className="flex items-center gap-3 px-4 md:px-5 py-3">
                      <span className="w-8 h-8 rounded-full bg-brand/10 text-brand grid place-items-center font-bold text-[13px] tnum shrink-0" aria-label={`Position ${a.waitingRank}`}>{a.waitingRank ?? i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <Link href={`${BASE}/applications/${a.id}`} className="font-semibold text-[14.5px] truncate hover:underline block">{a.fullName}</Link>
                        <p className="text-[12.5px] text-ink3 truncate">{a.waitingReason ?? ""}{a.waitingSince ? ` · waiting since ${formatDate(a.waitingSince, tz)}` : ""}</p>
                      </div>
                      {canChange && <OfferSeat id={a.id} />}
                      {canChange && <WaitMove id={a.id} name={a.fullName} rank={a.waitingRank ?? i + 1} above={arr[i - 1]?.fullName ?? null} below={arr[i + 1]?.fullName ?? null} />}
                    </li>
                  ))}
                </ol>
                <p className="px-5 py-3 text-[12.5px] text-ink3 border-t border-line/70">When a seat frees up, the first name gets an offer. {seatText(data.apps.find((a) => a.classId === wcls)!)}</p>
              </Card>
              <Card>
                <CardHeader title="Changes by hand" description="Every move needs a reason and is kept" icon={History} />
                <div className="px-5">
                  {data.history.filter((h) => h.application.classId === wcls).length
                    ? <Timeline items={data.history.filter((h) => h.application.classId === wcls).map((h) => ({ what: h.text, when: `${formatDateTime(h.at, tz)} · ${who(h.byId)}`, icon: ArrowUpDown, tone: "warn" }))} />
                    : <p className="pb-5 text-[13.5px] text-ink3">No changes yet.</p>}
                </div>
              </Card>
            </Split>
          </>
        ))}

        {tab === "done" && (
          <Card className="overflow-hidden">
            <CardHeader title="Decided" description={range ? `Decided ${range.label.toLowerCase()}, newest first` : "This admission year, newest first"} />
            {data.decided.length === 0 ? <EmptyState bare Icon={CheckCheck} title="No decisions yet">{range ? "Try another date range." : "Approvals and rejections appear here."}</EmptyState> : (
              <ul className="divide-y divide-line/70 border-t border-line/70">
                {data.decided.map((d) => (
                  <li key={d.id} className="flex items-start gap-3 px-4 md:px-5 py-3">
                    <Avatar name={d.fullName} size={38} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[14.5px] leading-tight"><Link href={`${BASE}/applications/${d.id}`} className="hover:underline">{d.fullName}</Link> <span className="text-ink3 font-normal text-[13px]">· {n.classes.get(d.classId) ?? ""} · {yl(d.academicYearId)}</span></p>
                      <p className="text-[12.5px] text-ink3">{who(d.decidedById)} · {d.decidedAt ? formatDate(d.decidedAt, tz) : ""}{d.decisionRemarks ? ` · “${d.decisionRemarks}”` : ""}</p>
                    </div>
                    <Pill tone={d.stage === "REJECTED" ? "bad" : "ok"} className="shrink-0">{d.stage === "ADMITTED" ? "Admitted" : d.stage === "APPROVED" ? "Approved" : "Not approved"}</Pill>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

