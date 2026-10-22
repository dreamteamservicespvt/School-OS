// Issue Stock (14 §2): the store counter. Issue to a staff member,
// department, class or student (the charge goes to the student's fees), or a
// book set to a student in one step; returns of returnable items. Below, the
// issues list with date, items, who received them, who issued, returnable
// and returned. Leaders who read this page (the Principal) see the list and
// the day's numbers, and can remind the store keeper.
import type { Metadata } from "next";
import { BookCopy, PackageOpen, Search } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatRupees } from "@/lib/format";
import { PAGE_SIZE } from "@/lib/list";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { SegLinks } from "@/components/ui/blocks";
import { Pager } from "@/components/ui/data-list";
import { ExportButton } from "@/components/ui/export-button";
import { UrlSearch, UrlSelect } from "@/components/ui/url-controls";
import { PeriodFilter } from "@/components/list/period-filter";
import { Stats, Split, Col, Stack, Toolbar, DataList, Empty, type StatItem } from "@/components/money/kit";
import { itemOptions, stockByStore, staffOptions, departmentOptions, sectionOptions, locationOptions } from "@/lib/inventory/lookup";
import { itemLabel } from "@/lib/inventory/items";
import { ISSUE_TO, ISSUE_TO_MANY, plural } from "@/lib/inventory/words";
import { InvHead } from "./_components/head";
import { ActButton } from "./_components/client";
import { IssueForm, BookSetForm, type SetPick } from "./_components/issue-forms";
import { ReturnSheet } from "./_components/sheets";
import { BASE, invGuard, invPeriod, one, qs, addQ, uuidOr, type SearchParams } from "./_lib/page";
import { issuesList, readIssuesFilter, recipients } from "./_lib/lists";
import { findStudentsAction, giveMissingAction, issueAction, issueSetAction, remindStoreAction } from "./actions";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Issue Stock · Inventory Management" };

const ZERO = BigInt(0);
const day = (d: Date) => formatDate(d, "UTC");

export default async function IssueStockPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const p = await invGuard("issue");
  const { current, can, today, settings: s } = p;
  const desk = can.issue;
  const counter = one(sp.counter) === "set" && s.bookSetsOn ? "set" : "issue";
  const per = invPeriod(sp, p.dates, desk ? "today" : "thismonth");
  const f = readIssuesFilter((k) => one(sp[k]), per.range);
  const page = Math.max(1, Math.min(500, Number(one(sp.page)) || 1));
  const returnLine = uuidOr(one(sp.ret));

  const d = await withSchool(current.ctx, async (tx) => {
    const list = await issuesList(tx, f, { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE });
    const [todayCount, todayStudents, charged, outRows] = await Promise.all([
      tx.stockIssue.count({ where: { date: today } }),
      tx.stockIssue.count({ where: { date: today, toKind: "STUDENT" } }),
      tx.stockIssue.aggregate({ where: { date: today }, _sum: { chargePaise: true } }),
      tx.$queryRaw<{ n: bigint }[]>`SELECT COALESCE(SUM(l.qty - l.returned_qty), 0)::bigint AS n FROM stock_issue i JOIN stock_issue_line l ON l.issue_id = i.id WHERE i.returnable AND l.returned_qty < l.qty`,
    ]);
    const form = desk
      ? await (async () => {
          const [items, stockBy, staff, departments, sections, stores, sets] = await Promise.all([
            itemOptions(tx), stockByStore(tx), staffOptions(tx), departmentOptions(tx), sectionOptions(tx, current.ctx), locationOptions(tx),
            s.bookSetsOn ? tx.bookSet.findMany({ where: { archivedAt: null }, include: { items: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
          ]);
          return { items, stockBy, staff, departments, sections, stores, sets };
        })()
      : null;
    const ret = returnLine ? await tx.stockIssueLine.findFirst({ where: { id: returnLine }, include: { issue: true } }) : null;
    const retItem = ret ? await tx.item.findFirst({ where: { id: ret.itemId } }) : null;
    const retTo = ret ? (await recipients(tx, [ret.issue])).get(ret.issue.id) ?? "" : "";
    return { ...list, todayCount, todayStudents, charged: charged._sum.chargePaise ?? ZERO, out: Number(outRows[0]?.n ?? 0), form, ret: ret && retItem ? { line: ret, item: retItem, to: retTo } : null };
  });

  const here = (change: Record<string, string | null>) => addQ(qs(BASE, { counter: counter === "set" ? "set" : null, to: f.to || null, open: f.open ? "1" : null, sets: f.sets ? "1" : null, q: f.q || null, ...per.keep, page: page > 1 ? String(page) : null }), change);
  const exportHref = qs(`${BASE}/issues/export`, { to: f.to || null, open: f.open ? "1" : null, sets: f.sets ? "1" : null, q: f.q || null, ...per.keep });
  const stats: StatItem[] = [
    { label: "Issued today", value: d.todayCount.toLocaleString("en-IN"), href: addQ(here({}), { period: "today", page: null }) },
    { label: "To students today", value: d.todayStudents.toLocaleString("en-IN"), href: addQ(here({}), { period: "today", to: "STUDENT", page: null }) },
    { label: "Charged to fees today", value: formatRupees(d.charged) },
    { label: "Out, to be returned", value: d.out.toLocaleString("en-IN"), tone: d.out ? "warn" : undefined, href: addQ(here({}), { open: "1", period: "all", page: null }) },
  ];
  const names = d.form ? Object.fromEntries(d.form.items.map((i) => [i.value, i.label])) : {};
  const sets: SetPick[] = d.form ? d.form.sets.map((st) => ({ value: st.id, label: `${st.name} · ${formatRupees(st.pricePaise)}`, classIds: st.classIds, pricePaise: Number(st.pricePaise), lines: st.items.map((x) => ({ itemId: x.itemId, qty: x.qty, name: names[x.itemId] ?? "Item" })) })) : [];
  const main = d.form?.stores.find((x) => x.isMain)?.value ?? d.form?.stores[0]?.value ?? "";
  const filtered = Boolean(f.to || f.open || f.sets || f.q);

  const list = (
    <Card>
      <CardHeader title="Issues" description={per.label} divided />
      <Toolbar className="md:flex-wrap">
        <UrlSearch placeholder="Search issue number, name or item" label="Search issues" className="flex-1 md:min-w-[260px]" id="issues-search" />
        <div className="flex gap-2 flex-wrap">
          <UrlSelect param="to" label="Issued to" options={[{ value: "", label: "Everyone" }, ...Object.entries(ISSUE_TO_MANY).map(([value, label]) => ({ value, label }))]} />
          <SegLinks label="Show" size="md" value={f.open ? "open" : f.sets ? "sets" : ""} options={[
            { value: "", label: "All", href: here({ open: null, sets: null, page: null }) },
            { value: "open", label: "To return", href: here({ open: "1", sets: null, page: null }) },
            ...(s.bookSetsOn ? [{ value: "sets", label: "Book sets", href: here({ sets: "1", open: null, page: null }) }] : []),
          ]} />
          <PeriodFilter {...p.dates} fallback={desk ? "today" : "thismonth"} />
          {can.export && <ExportButton href={exportHref} />}
        </div>
      </Toolbar>
      <DataList rows={d.rows} rowKey={(r) => r.id} minWidth={980} caption="Issues"
        empty={<Empty icon={filtered || per.range ? Search : PackageOpen} title={filtered ? "No issues match" : "Nothing issued on these dates"} body={filtered ? "Try another search or clear the filters." : desk ? "Issues made at the counter show here." : "Choose other dates to see earlier issues."} />}
        columns={[
          { key: "date", label: "Date", nowrap: true, render: (r) => <span className="tnum">{day(r.date)}<span className="block text-[12px] text-ink3 font-mono">{r.number}</span></span> },
          { key: "items", label: "Items", render: (r) => (
            <span className="block min-w-[200px] text-[13.5px]">
              {r.bookSetId && <b className="font-semibold block">{d.sets.get(r.bookSetId) ?? "Book set"}</b>}
              {r.lines.map((l) => { const it = d.items.get(l.itemId); return <span key={l.id} className="block">{it ? itemLabel(it) : "Item"} × {l.qty}</span>; })}
              {Array.isArray(r.missing) && (r.missing as unknown[]).length > 0 && <Pill tone="warn" className="mt-1">{plural((r.missing as unknown[]).length, "item")} <Words k="to give later" /></Pill>}
            </span>
          ) },
          { key: "to", label: "Issued to", render: (r) => <span className="block min-w-[150px]">{d.to.get(r.id)}<span className="block text-[12px] text-ink3">{ISSUE_TO[r.toKind]}</span></span> },
          { key: "charge", label: "Charged", align: "right", nowrap: true, render: (r) => (r.chargePaise > ZERO ? formatRupees(r.chargePaise) : <span className="text-ink3"><Words k="Free" /></span>) },
          { key: "by", label: "Issued by", render: (r) => d.who.get(r.createdById ?? "") ?? "" },
          { key: "ret", label: "Returnable", render: (r) => {
            if (!r.returnable) return <span className="text-ink3"><Words k="No" /></span>;
            const out = r.lines.reduce((a, l) => a + l.qty - l.returnedQty, 0);
            return out ? <Pill tone="warn">{out} <Words k="out" /></Pill> : <Pill tone="ok"><Words k="Returned" /></Pill>;
          } },
          ...(desk ? [{ key: "act", label: "", render: (r: (typeof d.rows)[number]) => (
            <span className="flex flex-col gap-1 items-start">
              {r.returnable && r.lines.filter((l) => l.returnedQty < l.qty).map((l) => (
                <a key={l.id} href={here({ ret: l.id })} className="text-[13px] font-semibold text-brand hover:underline whitespace-nowrap"><Words k="Return" /> {d.items.get(l.itemId)?.name ?? "item"}</a>
              ))}
              {Array.isArray(r.missing) && (r.missing as unknown[]).length > 0 && <ActButton action={giveMissingAction} fields={{ issueId: r.id }} label="Give the rest" icon="check" />}
            </span>
          ) }] : []),
        ]}
        phone={(r) => {
          const out = r.lines.reduce((a, l) => a + l.qty - l.returnedQty, 0);
          return {
            title: d.to.get(r.id) ?? "", icon: r.bookSetId ? BookCopy : PackageOpen, iconTone: "brand",
            sub: `${day(r.date)} · ${r.bookSetId ? d.sets.get(r.bookSetId) ?? "Book set" : r.lines.map((l) => `${d.items.get(l.itemId)?.name ?? "Item"} × ${l.qty}`).join(", ")}`,
            right: r.chargePaise > ZERO ? formatRupees(r.chargePaise) : undefined,
            pills: r.returnable ? (out ? <Pill tone="warn">{out} <Words k="to return" /></Pill> : <Pill tone="ok"><Words k="Returned" /></Pill>) : undefined,
          };
        }}
      />
      {d.total > PAGE_SIZE && <Pager page={page} pageSize={PAGE_SIZE} total={d.total} prevHref={here({ page: page > 2 ? String(page - 1) : null })} nextHref={here({ page: String(page + 1) })} />}
    </Card>
  );

  if (!desk || !d.form) {
    return (
      <>
        <InvHead pageName="Issue Stock" href={BASE} mode={p.mode} actions={can.remind ? <ActButton action={remindStoreAction} fields={{ what: "low" }} label="Remind store keeper" icon="bell" size="md" /> : undefined} />
        <Stack>
          <Stats items={stats} />
          {list}
        </Stack>
      </>
    );
  }

  return (
    <>
      <InvHead pageName="Issue Stock" href={BASE} mode={p.mode} sub="Pick who receives, then the items. Stock in hand shows on every line." />
      <Stack>
        <Stats items={stats} />
        <Split side={380}>
          <Col>{list}</Col>
          <Col>
            <Card className="p-4 md:p-5 flex flex-col gap-4">
              {s.bookSetsOn && (
                <SegLinks label="Counter" value={counter} size="md" options={[
                  { value: "issue", label: "Issue items", href: here({ counter: null }) },
                  { value: "set", label: "Book set", href: here({ counter: "set" }) },
                ]} />
              )}
              {counter === "issue" ? (
                <IssueForm action={issueAction} find={findStudentsAction} items={d.form.items} stockBy={d.form.stockBy} staff={d.form.staff} departments={d.form.departments}
                  sections={d.form.sections.map(({ value, label }) => ({ value, label }))} stores={d.form.stores.map(({ value, label }) => ({ value, label }))} mainStore={main} />
              ) : sets.length ? (
                <BookSetForm action={issueSetAction} find={findStudentsAction} sets={sets} stockBy={d.form.stockBy} stores={d.form.stores.map(({ value, label }) => ({ value, label }))} mainStore={main} withMissing={s.setsWithMissing} names={names} />
              ) : (
                <Empty icon={BookCopy} title="No book sets yet" body={can.stock ? "Make a set in Items & Stock, Book sets." : "The store keeper makes the sets."} />
              )}
            </Card>
          </Col>
        </Split>
      </Stack>
      {d.ret && (
        <ReturnSheet closeHref={here({ ret: null })} lineId={d.ret.line.id} unit={d.ret.item.unit}
          words={`${itemLabel(d.ret.item)} from ${d.ret.to} (${d.ret.line.issue.number}, ${day(d.ret.line.issue.date)})`} left={d.ret.line.qty - d.ret.line.returnedQty} />
      )}
    </>
  );
}
