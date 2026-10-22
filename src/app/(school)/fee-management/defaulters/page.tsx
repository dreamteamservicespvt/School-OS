import Link from "next/link";
import { BookOpen, ChartColumn, Hourglass, IndianRupee, MessageCircle, MessageSquareText, Mail, SearchX, Send, UserCheck, Zap } from "lucide-react";
import { withSchool } from "@/lib/db";
import { fileLink } from "@/lib/files";
import { formatDate, formatDateTime, formatRupees, formatRupeesShort } from "@/lib/format";
import { canSeeStudent } from "@/lib/fees/access";
import { defaulterLists, type DefaulterFilter } from "@/lib/fees/defaulters";
import { feeTemplates, reminderHistory } from "@/lib/fees/reminders";
import { gatewayFor } from "@/lib/fees/settings";
import { parseRupees } from "@/lib/fees/act";
import { PROMISE_FEATURE, PROMISE_MAX_DAYS, promiseTarget, promiseWords } from "@/lib/fees/promises";
import { addDays } from "@/lib/staff/dates";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Empty, HBars, Stack, Stats, Timeline, Toolbar, type Tone } from "@/components/money/kit";
import { UrlSearch, UrlSelect } from "@/components/money/url-filters";
import { UrlSheet } from "@/components/ui/url-sheet";
import { ExportButton } from "@/components/ui/export-button";
import { PeriodFilter } from "@/components/list/period-filter";
import { cx } from "@/components/ui/cx";
import { FeeHead } from "../_components/fee-head";
import { BASE, feeGuard, feePeriod, feeViewOnCampus, one, qs, type SearchParams } from "../_lib/page";
import { DefaulterList, type DefaulterItem } from "./list";
import { CallNoteForm } from "./call-note";

export const metadata = { title: "Defaulters" };

const HREF = `${BASE}/defaulters`;
const AMOUNTS = [{ value: "", label: "Any amount" }, { value: "5000", label: "₹5,000 or more" }, { value: "10000", label: "₹10,000 or more" }, { value: "20000", label: "₹20,000 or more" }];
const REMINDED = [{ value: "", label: "All reminders" }, { value: "yes", label: "Reminded" }, { value: "no", label: "Not reminded yet" }];
const STAT_TONES: Tone[] = ["neutral", "warn", "bad", "bad"];

/** Defaulters (06 §2, mod-fees.jsx): who owes past the due date, how long, and the reminders already sent. */
export default async function DefaultersPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await feeGuard("defaulters");
  const sp = await searchParams;
  // One campus chosen on the Dashboard (?campus=): that campus's students only, as the card counted them.
  const viewer = await feeViewOnCampus(p, sp.campus);
  const canEdit = p.does("defaulters");
  const promisesOn = p.features.has(PROMISE_FEATURE);
  const q = one(sp.q).trim().slice(0, 80);
  const cls = one(sp.class);
  const age = one(sp.age);
  // Any whole-rupee amount from a link (Ask: "Who owes ₹15,000 or more?"); the list offers the usual ones.
  const above = /^[1-9]\d{0,8}$/.test(one(sp.above)) ? one(sp.above) : "";
  const amounts = AMOUNTS.some((a) => a.value === above) ? AMOUNTS : [...AMOUNTS, { value: above, label: `₹${Number(above).toLocaleString("en-IN")} or more` }];
  const rem = one(sp.rem) === "yes" || one(sp.rem) === "no" ? one(sp.rem) : "";
  const per = feePeriod(sp, p.dates, null);
  const who = one(sp.who);
  const filter: DefaulterFilter = {
    q: q || null,
    classId: /^[0-9a-f-]{36}$/i.test(cls) ? cls : null,
    // One section, from Fees by class ("Remind parents").
    sectionId: /^[0-9a-f-]{36}$/i.test(one(sp.section)) ? one(sp.section) : null,
    ageing: age !== "" && /^\d+$/.test(age) ? Number(age) : null,
    amountAbove: above ? parseRupees(above, "Amount") : null,
    reminded: (rem || null) as DefaulterFilter["reminded"],
    oldestFrom: per.from,
    oldestTo: per.to,
  };

  const data = await withSchool(p.current.ctx, async (tx) => {
    const [all, list] = await defaulterLists(tx, p.current.ctx, viewer, p.today, [{}, filter]);
    const photos = await tx.student.findMany({ where: { id: { in: list.rows.map((r) => r.studentId) } }, select: { id: true, photoFileId: true } });
    const templates = canEdit ? await Promise.all((["whatsapp", "sms", "email"] as const).map((c) => feeTemplates(tx, p.current.ctx, c))) : [[], [], []];
    const gateway = canEdit ? Boolean(await gatewayFor(tx, p.current.ctx, null)) : false;
    let history = null;
    if (/^[0-9a-f-]{36}$/i.test(who) && (await canSeeStudent(tx, viewer, who))) {
      const row = all.rows.find((r) => r.studentId === who) ?? null;
      const student = await tx.student.findFirst({ where: { id: who }, select: { id: true, fullName: true } });
      const [rems, calls] = await Promise.all([reminderHistory(tx, who), tx.feeCallNote.findMany({ where: { studentId: who }, orderBy: { createdAt: "desc" }, take: 30 })]);
      const users = await tx.userLogin.findMany({ where: { id: { in: [...calls.map((c) => c.createdById), ...rems.map((r) => r.sentById)].filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
      history = student ? { row, student, rems, calls, users } : null;
    }
    return { all, list, photos, templates, gateway, history };
  });

  const { all, list } = data;
  const keep = { campus: one(sp.campus) || null, q: q || null, class: filter.classId, section: filter.sectionId ?? null, age: filter.ageing !== null ? String(filter.ageing) : null, above: above || null, rem: rem || null, ...per.keep };
  const here = (extra: Record<string, string | null> = {}) => qs(HREF, { ...keep, ...extra });
  const filtered = Boolean(q || filter.classId || filter.ageing !== null || above || rem || per.range);
  const over30 = all.rows.filter((r) => r.daysOverdue > 30).length;
  const ageTone = (days: number): DefaulterItem["tone"] => (days > 60 ? "bad" : days > 30 ? "warn" : "neutral");
  const items: DefaulterItem[] = list.rows.map((r) => {
    const photo = data.photos.find((x) => x.id === r.studentId)?.photoFileId ?? null;
    return {
      id: r.studentId, name: r.name, adm: r.admissionNo, photo: photo ? fileLink(photo, p.current.ctx.schoolId) : null, cls: r.classLabel,
      parent: r.parentName ?? "", phone: r.phone ?? "", amount: formatRupees(r.overduePaise), amountShort: formatRupeesShort(r.overduePaise), amountPaise: r.overduePaise.toString(),
      heads: r.heads, since: formatDate(r.oldestDue), days: r.daysOverdue, tone: ageTone(r.daysOverdue),
      lastReminder: r.lastReminder ? formatDateTime(r.lastReminder, p.tz) : null, reminders: r.reminders, promised: !r.promise && r.promisedOn ? formatDate(r.promisedOn) : null,
      promise: r.promise && (r.promise.state === "OPEN" || r.promise.state === "BROKEN") ? { words: promiseWords(r.promise), tone: r.promise.state === "BROKEN" ? "bad" : "info" } : null,
    };
  });
  const whoHref = Object.fromEntries(items.map((d) => [d.id, here({ who: d.id })]));
  const cMax = all.classTotals.reduce((m, c) => (c.amount > m ? c.amount : m), BigInt(0));
  const half = Math.ceil(all.classTotals.length / 2);
  const toBars = (rows: typeof all.classTotals) => rows.map((c) => ({
    key: c.classId ?? "none", label: c.className, value: cMax > BigInt(0) ? Number((c.amount * BigInt(1000)) / cMax) / 10 : 0,
    text: <>{formatRupeesShort(c.amount)} <span className="text-ink3 font-normal">· {c.students}</span></>,
    href: c.classId ? here({ class: filter.classId === c.classId ? null : c.classId, who: null }) : undefined, active: filter.classId === c.classId,
  }));
  const tpl = { whatsapp: data.templates[0].map((t) => ({ value: t.id, label: t.name })), sms: data.templates[1].map((t) => ({ value: t.id, label: t.name })), email: data.templates[2].map((t) => ({ value: t.id, label: t.name })) };
  const h = data.history;

  return (
    <div>
      <FeeHead pageName="Defaulters" href={HREF}
        sub={all.rows.length ? `${all.rows.length} ${all.rows.length === 1 ? "student owes" : "students owe"} ${formatRupees(all.total)} past the due date · ${over30} more than 30 days late` : "Nobody owes fees past the due date"}
        viewActions={<ExportButton href={qs(`${HREF}/export`, keep)} />}
        actions={list.rows.length ? <ButtonLink href={here({ send: "all" })} scroll={false} variant="primary" icon={Send}>{filtered ? `Send reminder to ${list.rows.length}` : `Send reminder to all ${list.rows.length}`}</ButtonLink> : null} />
      <Stack>
        <Stats items={all.ageingTotals.map((g, i) => ({
          label: g.label, value: formatRupees(g.amount), sub: `${g.students} ${g.students === 1 ? "student" : "students"}${filter.ageing === g.index ? " · showing" : ""}`,
          tone: STAT_TONES[Math.min(i, STAT_TONES.length - 1)], icon: Hourglass, href: here({ age: filter.ageing === g.index ? null : String(g.index), who: null }), active: filter.ageing === g.index,
        }))} />

        {all.classTotals.length > 0 && (
          <Card>
            <CardHeader title="Overdue by class" description="Tap a class to see its students" icon={ChartColumn} />
            <div className="px-5 pb-5 grid lg:grid-cols-2 gap-x-8 gap-y-2.5">
              <HBars rows={toBars(all.classTotals.slice(0, half))} />
              <HBars rows={toBars(all.classTotals.slice(half))} />
            </div>
          </Card>
        )}

        <Card className="overflow-hidden">
          <Toolbar className="md:flex-wrap">
            <UrlSearch id="def-q" placeholder="Student, parent or admission no." label="Search defaulters" />
            <div className="grid grid-cols-2 gap-2.5 md:flex md:flex-wrap">
              <UrlSelect id="def-cls" param="class" label="Class" className="md:w-36" options={[{ value: "", label: "All classes" }, ...all.classTotals.filter((c) => c.classId).map((c) => ({ value: c.classId!, label: c.className }))]} />
              <UrlSelect id="def-age" param="age" label="Days late" className="md:w-40" options={[{ value: "", label: "Any days late" }, ...all.ageingTotals.map((g) => ({ value: String(g.index), label: g.label }))]} />
              <UrlSelect id="def-amt" param="above" label="Amount" className="md:w-40" options={amounts} />
              <UrlSelect id="def-rem" param="rem" label="Reminders" className="md:w-40" options={REMINDED} />
              <PeriodFilter {...p.dates} allLabel="Any due date" />
            </div>
          </Toolbar>
          <DefaulterList rows={items} canEdit={canEdit} canCollect={p.desk} openAll={canEdit && one(sp.send) === "all"} templates={tpl} gateway={data.gateway} csvHref={qs(`${HREF}/export`, keep)} whoHref={whoHref}
            footer={`Showing ${list.rows.length} of ${all.rows.length} · ${formatRupees(list.total)} overdue`}
            empty={all.rows.length === 0
              ? <Empty icon={UserCheck} title="Nobody is overdue" body="Every student has paid what has fallen due. Students show here the day after a due date passes." />
              : <Empty icon={SearchX} title="Nobody on this list" body="No student matches these filters." action={<Link href={HREF} className={buttonClass("secondary")}>Clear filters</Link>} />} />
        </Card>
      </Stack>

      {h && (
        <UrlSheet title={h.student.fullName} closeHref={here()} sub={h.row ? `${h.row.classLabel}${h.row.parentName ? ` · ${h.row.parentName}` : ""}${h.row.phone ? ` · ${h.row.phone}` : ""}` : undefined}>
          <div className="flex flex-col gap-4">
            {h.row ? (
              <div className="rounded-2xl bg-bad/8 px-4 py-3">
                <p className="font-display text-[22px] font-semibold tnum text-bad leading-tight">{formatRupees(h.row.overduePaise)}</p>
                <p className="text-[13px] text-ink2">{h.row.heads} · since {formatDate(h.row.oldestDue)} · {h.row.daysOverdue} days</p>
                {h.row.promise && (h.row.promise.state === "OPEN" || h.row.promise.state === "BROKEN") && (
                  <p className={cx("text-[13px] font-semibold mt-1", h.row.promise.state === "BROKEN" ? "text-bad" : "text-ink")}>
                    {promiseWords(h.row.promise)}{h.row.promise.state === "BROKEN" ? ". Call the family again." : ". Automatic reminders are paused until then."}
                  </p>
                )}
              </div>
            ) : <div className="rounded-2xl bg-ok/8 px-4 py-3 text-[14px] text-ok font-semibold">Nothing overdue now.</div>}
            <div className="flex gap-2 flex-wrap">
              {p.desk && <ButtonLink href={`${BASE}/collect/${h.student.id}`} variant="primary" icon={IndianRupee}>Collect fee</ButtonLink>}
              {canEdit && h.row && <ButtonLink href={qs(HREF, { ...keep, send: "all", q: h.row.admissionNo, class: null, age: null, above: null, rem: null })} scroll={false} variant="secondary" icon={Send}>Send reminder</ButtonLink>}
              {p.may("ledger") && <ButtonLink href={`${BASE}/ledger/${h.student.id}`} variant="ghost" icon={BookOpen}>Ledger</ButtonLink>}
            </div>
            <div>
              <p className="eyebrow text-ink3 mb-2">Reminder history</p>
              {h.rems.length === 0 ? <p className="text-[14px] text-ink3">No reminder yet.{p.settings.remindersOn ? " The automatic one goes on the days set in Fee Settings." : ""}</p> : (
                <Timeline items={h.rems.map((r) => ({
                  icon: r.automatic ? Zap : r.channel === "sms" ? MessageSquareText : r.channel === "email" ? Mail : MessageCircle,
                  tone: /Failed|Not sent|Skipped/.test(r.deliveryStatus) ? "warn" : r.deliveryStatus.includes("Read") ? "ok" : "info",
                  what: `${r.automatic ? "Automatic reminder" : "Fee reminder"} · ${r.channel === "automatic" ? "as set in Communication" : r.channel === "sms" ? "SMS" : r.channel === "email" ? "Email" : "WhatsApp"} · ${formatRupees(r.amountPaise)}`,
                  when: `${formatDateTime(r.sentAt, p.tz)} · ${r.deliveryStatus}${r.sentById ? ` · ${h.users.find((u) => u.id === r.sentById)?.displayName ?? ""}` : ""}`,
                }))} />
              )}
            </div>
            <div>
              <p className="eyebrow text-ink3 mb-2">Calls</p>
              {h.calls.length === 0 && <p className="text-[14px] text-ink3 mb-2">No calls noted.</p>}
              <ul className="flex flex-col gap-2 mb-3">
                {h.calls.map((c) => (
                  <li key={c.id} className="rounded-xl bg-sunken/70 p-3 text-[14px]">
                    <p>{c.note}</p>
                    <p className="text-[12.5px] text-ink3 mt-0.5">{formatDateTime(c.createdAt, p.tz)} · {h.users.find((u) => u.id === c.createdById)?.displayName ?? "Staff"}{c.promisedOn && !c.promiseState ? ` · promised ${formatDate(c.promisedOn)}` : ""}</p>
                    {c.promiseState && c.promisedOn && (
                      <p className={cx("text-[12.5px] font-semibold mt-1", c.promiseState === "KEPT" ? "text-ok" : c.promiseState === "BROKEN" || (c.promiseState === "OPEN" && c.promisedOn < p.today) ? "text-bad" : "text-ink2")}>
                        {promiseWords({ state: c.promiseState === "OPEN" && c.promisedOn < p.today ? "BROKEN" : c.promiseState, promisedOn: c.promisedOn, amountPaise: c.promisedPaise })}
                        {c.promiseState !== "OPEN" && c.promiseState !== "REPLACED" && c.promisePaidPaise !== null ? ` · ${formatRupees(c.promisePaidPaise)} of ${formatRupees(promiseTarget(c))} paid by then` : ""}
                        {c.promiseState === "OPEN" && c.promisedOn >= p.today ? " · automatic reminders paused" : ""}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              {canEdit && <CallNoteForm studentId={h.student.id} promise={promisesOn ? { min: p.today.toISOString().slice(0, 10), max: addDays(p.today, PROMISE_MAX_DAYS).toISOString().slice(0, 10) } : null} />}
            </div>
          </div>
        </UrlSheet>
      )}
    </div>
  );
}
