import Link from "next/link";
import { Archive, ChevronRight, CircleCheck, CopyPlus, FilePen, GraduationCap, History, Hourglass, Lock, Pencil, Percent, Plus, Tag, Tags, Users } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatRupees } from "@/lib/format";
import { addDays, monthEnd } from "@/lib/staff/dates";
import { classCards, classStructure, feeHeads, publishImpact } from "@/lib/fees/structure";
import { frequencyLabel, headKindLabel, type FrequencyValue } from "@/lib/fees/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Banner, Col, DataList, Empty, Split, Stack, Timeline } from "@/components/money/kit";
import { LinkTabs } from "@/components/ui/link-tabs";
import { UrlSheet } from "@/components/ui/url-sheet";
import { cx } from "@/components/ui/cx";
import { FeeHead } from "../_components/fee-head";
import { BASE, feeStaffPage, one, qs, type SearchParams } from "../_lib/page";
import { AssignClass, CopySheet, DiscardDraft, HeadSheet, PrepareSheet, PublishSheet, RemoveRow, RestoreSheet, RowSheet, type HeadData } from "./sheets";

export const metadata = { title: "Fee Structure" };

const HREF = `${BASE}/structure`;
const ZERO = BigInt(0);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Fee Structure (06 §2, mod-fees.jsx Structure): fee heads, class-wise versioned structures and installments. */
export default async function StructurePage({ searchParams }: { searchParams: SearchParams }) {
  const p = await feeStaffPage();
  const sp = await searchParams;
  const canManage = p.can.change && p.can.counter("manage-structure");
  const canAssign = p.can.change && p.can.counter("assign-fees");
  const clsId = one(sp.cls);
  const doing = one(sp.do);
  const headParam = one(sp.head);

  const data = await withSchool(p.current.ctx, async (tx) => {
    const years = await tx.academicYear.findMany({ where: { archivedAt: null }, orderBy: { startDate: "asc" }, include: { terms: { where: { archivedAt: null }, orderBy: { sortOrder: "asc" } } } });
    const current = years.find((y) => y.id === p.year?.id) ?? years.at(-1) ?? null;
    const next = current ? years.find((y) => y.startDate > current.startDate) ?? null : null;
    const year = years.find((y) => y.id === one(sp.year)) ?? current;
    if (!year) return { year: null } as const;
    const [cards, heads, school, banks, versions] = await Promise.all([
      classCards(tx, p.current.ctx, year.id, null),
      feeHeads(tx, p.current.ctx),
      tx.school.findUniqueOrThrow({ where: { id: p.current.ctx.schoolId }, select: { gstin: true } }),
      tx.bankAccount.findMany({ where: { kind: "BANK", archivedAt: null }, orderBy: [{ isMain: "desc" }, { name: "asc" }], select: { id: true, name: true, accountLast4: true } }),
      tx.feeStructure.findMany({ where: { academicYearId: year.id, archivedAt: null }, orderBy: [{ updatedAt: "desc" }], take: 12 }),
    ]);
    const items = await tx.feeStructureItem.findMany({ where: { archivedAt: null, structure: { academicYearId: year.id, archivedAt: null, status: { in: ["PUBLISHED", "DRAFT"] } } }, select: { feeHeadId: true, frequency: true, structure: { select: { classId: true } } } });
    const people = await tx.userLogin.findMany({ where: { id: { in: versions.flatMap((v) => [v.publishedById, v.createdById]).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
    const categories = p.features.has("fee-category-fees")
      ? await tx.student.groupBy({ by: ["category"], where: { archivedAt: null, status: "ACTIVE", enrolments: { some: { academicYearId: year.id, archivedAt: null } } }, _count: { _all: true } })
      : [];
    let sheet = null;
    if (/^[0-9a-f-]{36}$/i.test(clsId)) {
      const card = cards.find((c) => c.classId === clsId);
      if (card) {
        const st = await classStructure(tx, year.id, clsId, "");
        const shown = st.draft ?? st.published;
        const start = year.startDate > p.today ? year.startDate : addDays(monthEnd(p.today), 1) > year.endDate ? p.today : addDays(monthEnd(p.today), 1);
        const impact = doing === "publish" && st.draft ? await publishImpact(tx, st.draft.id, start) : null;
        sheet = { card, st, shown, start, impact };
      }
    }
    return { year, years, current, next, cards, heads, school, banks, versions, items, people, categories, sheet };
  });
  if (!data.year) {
    return (
      <div>
        <FeeHead pageName="Fee Structure" href={HREF} />
        <Card><Empty icon={GraduationCap} title="Set up the academic year first" body="Fee structures are made for each class in an academic year. Add the year and classes in Academic Management." action={<Link href="/academic-management" className={buttonClass("secondary")}>Open Academic Management</Link>} /></Card>
      </div>
    );
  }
  const { year, cards, heads, sheet } = data;
  const isCurrent = year.id === data.current?.id;
  const started = year.startDate <= p.today;
  const here = (extra: Record<string, string | null> = {}) => qs(HREF, { year: isCurrent ? null : year.id, ...extra });
  const close = here();
  const clsHref = (id: string) => here({ cls: id });
  const headName = (id: string) => heads.find((h) => h.id === id)?.name ?? "Fee head";
  const admissionHeads = new Set(heads.filter((h) => h.kind === "admission").map((h) => h.id));
  const drafts = cards.filter((c) => c.draft);
  const yName = year.name.replace("-", "–");
  const headUse = (id: string) => {
    const mine = data.items.filter((i) => i.feeHeadId === id);
    const classes = new Set(mine.map((i) => i.structure.classId)).size;
    const freq = mine.length ? frequencyLabel(Object.entries(mine.reduce<Record<string, number>>((m, i) => ({ ...m, [i.frequency]: (m[i.frequency] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1])[0][0]) : "—";
    return { classes, freq };
  };
  const bankName = (id: string | null) => {
    const b = data.banks.find((x) => x.id === id) ?? data.banks[0];
    return b ? `${b.name}${b.accountLast4 ? ` ··${b.accountLast4}` : ""}` : "Main bank account";
  };
  const who = (id: string | null) => data.people.find((u) => u.id === id)?.displayName ?? null;
  const editHead = headParam && headParam !== "new" ? heads.find((h) => h.id === headParam) ?? null : null;
  const yearTabs = [
    ...(data.current ? [{ href: qs(HREF, {}), label: `${data.current.name.replace("-", "–")} · in use`, on: isCurrent }] : []),
    ...(data.next ? [{ href: qs(HREF, { year: data.next.id }), label: `${data.next.name.replace("-", "–")} · next year`, on: year.id === data.next.id }] : []),
  ];
  const sub = drafts.length
    ? `${yName} · ${drafts.length} ${drafts.length === 1 ? "class has" : "classes have"} a draft not published yet`
    : `${yName} · ${cards.filter((c) => c.published).length} of ${cards.length} classes have fees set${heads.some((h) => h.taxable) ? " · taxable heads include GST" : ""}`;

  return (
    <div>
      <FeeHead pageName="Fee Structure" href={HREF} sub={sub}
        actions={canManage ? <>
          <ButtonLink href={here({ head: "new" })} scroll={false} variant="secondary" icon={Plus}>Add fee head</ButtonLink>
          {isCurrent && data.next && <ButtonLink href={here({ do: "prepare" })} scroll={false} variant="primary" icon={CopyPlus}>Prepare {data.next.name.replace("-", "–")}</ButtonLink>}
        </> : null} />
      <Stack>
        {yearTabs.length > 1 && (
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <LinkTabs label="Academic year" tabs={yearTabs} className="border-b-0" />
            <p className="text-[13px] text-ink3 md:ml-2">{started ? "This year has started. Publishing changes only unpaid installments from the date you choose; paid rows never change." : `Changes here apply from ${formatDate(year.startDate)}. Nothing changes for this year.`}</p>
          </div>
        )}
        {started && canManage && (
          <Banner tone="warn" icon={Lock} title="Mid-year changes touch only unpaid installments."
            action={data.next && isCurrent ? <ButtonLink size="sm" variant="secondary" href={qs(HREF, { year: data.next.id })}>Change {data.next.name.replace("-", "–")}</ButtonLink> : undefined}>
            Paid rows never change. You see how many students are affected before you publish. Most changes are better made for next year.
          </Banner>
        )}

        {cards.length === 0 ? (
          <Card><Empty icon={GraduationCap} title="No classes yet" body="Add classes in Academic Management, then set each class’s fees here." /></Card>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {cards.map((c) => {
              const rows = c.rows;
              const yearly = rows.filter((r) => !admissionHeads.has(r.feeHeadId)).reduce((a, r) => a + r.totalPaise, ZERO);
              return (
                <Link key={c.classId} href={clsHref(c.classId)} scroll={false} className="text-left p-4 bg-surface rounded-2xl border border-line/70 shadow-card hover:border-brand/40 transition group block">
                  <div className="flex items-start gap-3">
                    <span className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><GraduationCap size={19} aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[15px] leading-tight flex items-center gap-2">{c.className}{c.draft && <Pill tone="info" className="!h-5 !text-[11px]">Draft</Pill>}{!c.published && !c.draft && <Pill tone="warn" className="!h-5 !text-[11px]">Not set</Pill>}</p>
                      <p className="text-[12.5px] text-ink3">{c.students} {c.students === 1 ? "student" : "students"} · {c.setCount} of {c.headCount} heads set{c.withoutPlan && c.published ? ` · ${c.withoutPlan} without fees` : ""}</p>
                    </div>
                    <ChevronRight size={18} className="text-ink3 group-hover:translate-x-0.5 transition" aria-hidden="true" />
                  </div>
                  {rows.length ? (
                    <ul className="mt-3 flex flex-col gap-1.5 text-[13.5px]">
                      {rows.map((r) => (
                        <li key={r.id} className="flex items-center gap-2"><span className="flex-1 min-w-0 truncate text-ink2">{headName(r.feeHeadId)} <span className="text-ink3">· {frequencyLabel(r.frequency)}</span></span><span className="tnum font-medium">{formatRupees(r.totalPaise)}</span></li>
                      ))}
                    </ul>
                  ) : <p className="mt-3 text-[13.5px] text-ink3">No fees set for {yName} yet.</p>}
                  <div className="mt-3 pt-3 border-t border-line/70 flex items-center justify-between text-[13.5px]">
                    <span className="text-ink3">Year, per student</span><b className="font-semibold tnum">{formatRupees(yearly)}</b>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <Split>
          <Card className="overflow-hidden">
            <CardHeader title="Fee heads" description={`${heads.length} ${heads.length === 1 ? "head" : "heads"} · taxable ones show their GST rate`} icon={Tags}
              action={canManage ? <ButtonLink size="sm" variant="soft" icon={Plus} href={here({ head: "new" })} scroll={false}>Add</ButtonLink> : null} />
            <DataList rows={heads} rowKey={(h) => h.id} minWidth={640} caption="Fee heads" rowHref={canManage ? (h) => here({ head: h.id }) : undefined}
              empty={<Empty icon={Tag} title="No fee heads yet" body="Add the fees the school charges, such as Tuition fee and Annual fee." />}
              columns={[
                { key: "name", label: "Fee head", render: (h) => { const u = headUse(h.id); return <><p className="font-semibold leading-tight">{h.name}</p><p className="text-[12.5px] text-ink3">{headKindLabel(h.kind)} · {u.classes ? `in ${u.classes} ${u.classes === 1 ? "class" : "classes"}` : "not in any class yet"}</p></>; } },
                { key: "freq", label: "Usually", nowrap: true, render: (h) => <span className="text-[13px] text-ink2">{headUse(h.id).freq}</span> },
                { key: "gst", label: "GST", render: (h) => h.taxable && h.gstRateBp ? <><Pill tone="info">GST {h.gstRateBp / 100}%</Pill>{h.sacCode && <span className="block text-[12px] text-ink3 mt-0.5">SAC {h.sacCode}</span>}</> : <Pill>Exempt</Pill> },
                { key: "acct", label: "Bank account", render: (h) => <span className="text-[13px]">{p.features.has("fee-bank-accounts") ? bankName(h.bankAccountId) : "Main bank account"}</span> },
              ]}
              phone={(h) => ({ title: h.name, sub: `${headUse(h.id).freq} · ${p.features.has("fee-bank-accounts") ? bankName(h.bankAccountId) : headKindLabel(h.kind)}`, icon: h.taxable ? Percent : Tag, iconTone: h.taxable ? "info" : "neutral", right: h.taxable && h.gstRateBp ? <Pill tone="info">GST {h.gstRateBp / 100}%</Pill> : <Pill>Exempt</Pill> })} />
          </Card>
          <Col>
            <Card>
              <CardHeader title="Drafts not published" description="Students’ fees change only when a draft is published" icon={Hourglass} />
              {drafts.length === 0 ? <p className="px-5 pb-5 text-[13.5px] text-ink3">No drafts. Every class shows the version in use.</p> : (
                <ul className="px-2 pb-2">
                  {drafts.map((c) => (
                    <li key={c.classId}>
                      <Link href={clsHref(c.classId)} scroll={false} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70">
                        <span className="w-9 h-9 rounded-xl bg-info/10 text-info grid place-items-center shrink-0"><FilePen size={17} aria-hidden="true" /></span>
                        <span className="min-w-0 flex-1"><b className="block font-semibold text-[14.5px] truncate">{c.className} · version {c.draft!.version}</b><span className="block text-[12.5px] text-ink3">Started {formatDate(c.draft!.createdAt, p.tz)}{who(c.draft!.createdById) ? ` · ${who(c.draft!.createdById)}` : ""}</span></span>
                        <ChevronRight size={17} className="text-ink3" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Versions" icon={History} />
              <div className="px-5 pb-1">
                {data.versions.length === 0 ? <p className="pb-4 text-[13.5px] text-ink3">No versions yet.</p> : (
                  <Timeline items={data.versions.slice(0, 6).map((v) => {
                    const cls = cards.find((c) => c.classId === v.classId)?.className ?? "Class";
                    return v.status === "DRAFT"
                      ? { icon: FilePen, tone: "info" as const, what: `${cls} version ${v.version} (draft)`, when: `Started ${formatDate(v.createdAt, p.tz)}${who(v.createdById) ? ` · ${who(v.createdById)}` : ""}` }
                      : v.status === "PUBLISHED"
                        ? { icon: CircleCheck, tone: "ok" as const, what: `${cls} version ${v.version} in use${v.category ? ` (${v.category})` : ""}`, when: `Published ${v.publishedAt ? formatDate(v.publishedAt, p.tz) : ""}${v.effectiveFrom ? ` · from ${formatDate(v.effectiveFrom)}` : ""}${who(v.publishedById) ? ` · ${who(v.publishedById)}` : ""}` }
                        : { icon: Archive, what: `${cls} version ${v.version}, replaced`, when: "Read-only" };
                  })} />
                )}
              </div>
            </Card>
            {p.features.has("fee-category-fees") && (
              <Card>
                <CardHeader title="Fees by student category" icon={Users} />
                <ul className="px-5 pb-4 flex flex-col text-[14px]">
                  {data.categories.length === 0 ? <li className="text-ink3 text-[13.5px]">No students in this year yet.</li> : data.categories.map((c) => {
                    const own = data.versions.some((v) => v.category && v.category === c.category && v.status === "PUBLISHED");
                    return (
                      <li key={c.category ?? "none"} className="flex items-start gap-3 py-2 border-t border-line/70 first:border-0">
                        <span className="flex-1 min-w-0"><b className="font-semibold block">{c.category || "No category"}</b><span className="text-[12.5px] text-ink3">{own ? "Own category fees" : "Class fees"}</span></span>
                        <span className="text-[13px] text-ink2 tnum">{c._count._all} students</span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </Col>
        </Split>
      </Stack>

      {sheet && !doing && (
        <UrlSheet wide closeHref={close} title={`${sheet.card.className} · ${yName}`}
          sub={`${sheet.card.students} ${sheet.card.students === 1 ? "student" : "students"} · ${sheet.st.draft ? `draft version ${sheet.st.draft.version}${sheet.st.published ? `, version ${sheet.st.published.version} in use` : ", not published"}` : sheet.st.published ? `version ${sheet.st.published.version} in use` : "no fees set"} · installments add up to each row’s total`}>
          <div className="flex flex-col gap-4">
            {sheet.st.draft && <Banner tone="info" icon={FilePen} title={`Draft version ${sheet.st.draft.version}`}>Changes here are not on students’ fees until you publish.</Banner>}
            {!sheet.shown || sheet.shown.items.length === 0 ? <Empty icon={Tag} title="No fee rows yet" body={canManage ? "Add the fees this class pays, with their installments." : "No fees are set for this class yet."} /> : sheet.shown.items.map((r) => {
              const sum = r.installments.reduce((a, i) => a + i.amountPaise, ZERO);
              return (
                <div key={r.id} className="rounded-2xl border border-line p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1"><p className="font-semibold text-[15px]">{headName(r.feeHeadId)}</p><p className="text-[12.5px] text-ink3">{frequencyLabel(r.frequency)} · {r.installments.length} {r.installments.length === 1 ? "installment" : "installments"}</p></div>
                    <p className="font-semibold tnum text-[15px]">{formatRupees(r.totalPaise)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {r.installments.map((i) => <span key={i.id} className="h-8 px-3 rounded-lg bg-sunken text-[13px] inline-flex items-center gap-2 tnum"><span className="text-ink3">{formatDate(i.dueDate)}</span><b className="font-semibold">{formatRupees(i.amountPaise)}</b></span>)}
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <p className={cx("text-[12.5px] flex items-center gap-1.5 flex-1", sum === r.totalPaise ? "text-ok" : "text-bad")}><CircleCheck size={14} aria-hidden="true" />{sum === r.totalPaise ? `Adds up to ${formatRupees(r.totalPaise)}` : `Installments add up to ${formatRupees(sum)}`}</p>
                    {canManage && <>
                      <ButtonLink size="sm" variant="ghost" icon={Pencil} scroll={false} href={here({ cls: sheet.card.classId, do: "row", item: r.feeHeadId })}>Change</ButtonLink>
                      <RemoveRow yearId={year.id} classId={sheet.card.classId} category="" feeHeadId={r.feeHeadId} name={headName(r.feeHeadId)} />
                    </>}
                  </div>
                </div>
              );
            })}
            <p className="text-[13px] text-ink3">Transport, hostel and store items are charged from their own modules. A one-off charge for one student is added on the student’s ledger.</p>
            {(canManage || canAssign) && (
              <div className="flex gap-2 flex-wrap">
                {canManage && <ButtonLink variant="primary" icon={Plus} scroll={false} href={here({ cls: sheet.card.classId, do: "row" })}>Add fee row</ButtonLink>}
                {canManage && sheet.st.draft && sheet.st.draft.items.length > 0 && <ButtonLink variant="secondary" icon={CircleCheck} scroll={false} href={here({ cls: sheet.card.classId, do: "publish" })}>Publish version {sheet.st.draft.version}</ButtonLink>}
                {canAssign && !sheet.st.draft && sheet.st.published && sheet.card.withoutPlan > 0 && <AssignClass structureId={sheet.st.published.id} label={`Give fees to ${sheet.card.withoutPlan} ${sheet.card.withoutPlan === 1 ? "student" : "students"}`} />}
                {canManage && sheet.shown && sheet.shown.items.length > 0 && cards.length > 1 && <ButtonLink variant="ghost" icon={CopyPlus} scroll={false} href={here({ cls: sheet.card.classId, do: "copy" })}>Copy to classes</ButtonLink>}
                {canManage && sheet.st.draft && <DiscardDraft structureId={sheet.st.draft.id} />}
              </div>
            )}
            {sheet.st.versions.filter((v) => v.status === "SUPERSEDED").length > 0 && (
              <div>
                <p className="eyebrow text-ink3 mb-2">Older versions</p>
                <ul className="flex flex-col gap-1.5">
                  {sheet.st.versions.filter((v) => v.status === "SUPERSEDED").map((v) => (
                    <li key={v.id} className="flex items-center gap-3 text-[14px] rounded-xl bg-sunken/60 px-3 py-2">
                      <span className="flex-1 min-w-0">Version {v.version} · {formatRupees(v.items.reduce((a, i) => a + i.totalPaise, ZERO))} a year{v.effectiveFrom ? ` · from ${formatDate(v.effectiveFrom)}` : ""}</span>
                      {canManage && !sheet.st.draft && <ButtonLink size="sm" variant="ghost" scroll={false} href={here({ cls: sheet.card.classId, do: "restore", ver: v.id })}>Use again</ButtonLink>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </UrlSheet>
      )}

      {canManage && sheet && doing === "row" && (() => {
        const item = one(sp.item) ? sheet.shown?.items.find((i) => i.feeHeadId === one(sp.item)) ?? null : null;
        const used = new Set((sheet.shown?.items ?? []).map((i) => i.feeHeadId));
        const options = heads.filter((h) => !used.has(h.id) || h.id === item?.feeHeadId).map((h) => ({ value: h.id, label: h.name }));
        if (!options.length) return null;
        return (
          <RowSheet closeHref={clsHref(sheet.card.classId)} yearId={year.id} classId={sheet.card.classId} category="" className={sheet.card.className} heads={options}
            yearStart={iso(year.startDate)} terms={year.terms.map((t) => ({ name: t.name, startDate: iso(t.startDate) }))} draft={Boolean(sheet.st.draft)} students={sheet.card.students}
            row={item ? { feeHeadId: item.feeHeadId, frequency: item.frequency as FrequencyValue, total: String(Number(item.totalPaise) / 100), installments: item.installments.map((i) => ({ label: i.label, due: iso(i.dueDate), amount: String(Number(i.amountPaise) / 100) })) } : null} />
        );
      })()}
      {canManage && sheet && doing === "publish" && sheet.st.draft && sheet.impact && (
        <PublishSheet closeHref={clsHref(sheet.card.classId)} structureId={sheet.st.draft.id} version={sheet.st.draft.version} impact={sheet.impact.message} start={iso(sheet.start)} withoutPlan={sheet.card.withoutPlan} />
      )}
      {canManage && sheet && doing === "copy" && sheet.shown && (
        <CopySheet closeHref={clsHref(sheet.card.classId)} fromId={sheet.shown.id} yearId={year.id} className={sheet.card.className}
          classes={cards.filter((c) => c.classId !== sheet.card.classId).map((c) => ({ value: c.classId, label: c.className }))} />
      )}
      {canManage && sheet && doing === "restore" && (() => {
        const v = sheet.st.versions.find((x) => x.id === one(sp.ver) && x.status === "SUPERSEDED");
        return v ? <RestoreSheet closeHref={clsHref(sheet.card.classId)} structureId={v.id} version={v.version} start={iso(sheet.start)} /> : null;
      })()}
      {canManage && doing === "prepare" && isCurrent && data.next && (
        <PrepareSheet closeHref={close} fromYearId={year.id} toYearId={data.next.id} fromName={yName} toName={data.next.name.replace("-", "–")} />
      )}
      {canManage && headParam && (headParam === "new" || editHead) && (
        <HeadSheet closeHref={close} gstin={data.school.gstin} splitOn={p.features.has("fee-bank-accounts")} banks={data.banks.map((b) => ({ value: b.id, label: `${b.name}${b.accountLast4 ? ` ··${b.accountLast4}` : ""}` }))}
          head={editHead ? { id: editHead.id, name: editHead.name, kind: editHead.kind, taxable: editHead.taxable, gstRate: editHead.gstRateBp ? String(editHead.gstRateBp / 100) : "", sacCode: editHead.sacCode ?? "", bankAccountId: editHead.bankAccountId ?? "", lateFeeApplies: editHead.lateFeeApplies, system: Boolean(editHead.systemKey) } satisfies HeadData : null} />
      )}
    </div>
  );
}

