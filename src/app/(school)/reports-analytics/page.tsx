import Link from "next/link";
import { History, Pin, SearchX, Wand2 } from "lucide-react";
import { withSchool } from "@/lib/db";
import { catalogueFor } from "@/lib/reports/catalogue";
import { pinsOf, recentUses } from "@/lib/reports/pins";
import { ROLE_NOTE } from "@/lib/reports/access";
import { CATEGORIES, MONEY, type ReportEntry } from "@/lib/reports/types";
import { Card } from "@/components/ui/card";
import { Banner, Chips, IconTile, Toolbar } from "@/components/ui/kit";
import { Pill } from "@/components/ui/badge";
import { Empty } from "@/components/money/kit";
import { UrlSearch } from "@/components/money/url-filters";
import { buttonClass } from "@/components/ui/button";
import { RepHead, CAT_ICON } from "./_components/head";
import { PinButton, QuickButton } from "./_components/bits";
import { customFeatureAction } from "./actions";
import { BASE, one, qs, repGuard, type SearchParams } from "./_lib/page";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("All Reports") };
}

/** All Reports (19 §2, mod-reports.jsx Catalogue): every ready report this person may see, with search, pins and recent ones. */
export default async function AllReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await repGuard("all");
  const sp = await searchParams;
  const mine = catalogueFor(p.a, p.current);
  const { pins, recent } = await withSchool(p.current.ctx, async (tx) => {
    const [pins, recent] = await Promise.all([pinsOf(tx, p.current.ctx, "report"), recentUses(tx, p.current.ctx, 8)]);
    return { pins, recent };
  });
  const cats = CATEGORIES.filter((c) => mine.some((r) => r.category === c));
  const q = one(sp.q).trim();
  const t = q.toLowerCase();
  const cat = cats.find((c) => c === one(sp.cat)) ?? "all";
  const found = mine.filter((r) => (cat === "all" || r.category === cat) && (!t || `${r.name} ${r.sub} ${r.category}`.toLowerCase().includes(t)));
  const groups = cats.filter((c) => found.some((r) => r.category === c));
  const byKey = new Map(mine.map((r) => [r.key, r]));
  const pinned = pins.map((k) => byKey.get(k)).filter((r): r is ReportEntry => Boolean(r));
  const used = recent.map((k) => byKey.get(k)).filter((r): r is ReportEntry => Boolean(r)).slice(0, 3);
  const pinSet = new Set(pins);
  const roleNote = p.a.full ? null : p.a.roleKeys.map((k) => ROLE_NOTE[k]).find(Boolean) ?? null;
  const own = p.own.map((s) => s.label);

  const Row = ({ r, showCat }: { r: ReportEntry; showCat?: boolean }) => (
    <li className="flex items-center gap-1 pr-1 rounded-xl hover:bg-sunken/60 transition">
      <Link href={`${BASE}/r/${r.key}`} className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 text-left">
        <IconTile icon={CAT_ICON[r.category]} tone={r.money ? "brand" : "neutral"} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-[14px] leading-snug truncate">{r.name}</span>
          <span className="block text-[12.5px] text-ink3 truncate">{showCat ? `${r.category} · ` : ""}{r.sub}</span>
        </span>
        {r.heavy && <Pill tone="neutral" className="!h-5 !text-[11px] hidden sm:inline-flex"><Words k="Large" /></Pill>}
      </Link>
      <PinButton reportKey={r.key} name={r.name} on={pinSet.has(r.key)} />
    </li>
  );

  return (
    <div>
      <RepHead pageName="All Reports" href={BASE}
        sub={`${mine.length} ready ${mine.length === 1 ? "report" : "reports"} from ${cats.length} ${cats.length === 1 ? "module" : "modules"} · filter, see on screen, export to Excel, CSV or PDF`} />
      <div className="flex flex-col gap-5 lg:gap-6">
        {p.a.own && (
          <Banner tone="info" title="Showing your classes only.">
            {own.length ? `Reports open with ${own.length === 1 ? `Class ${own[0]}` : own.join(", ")}.` : "You have no classes this year yet, so reports have no rows."} <Words k="Fee and staff reports are not part of your role." />
          </Banner>
        )}
        {roleNote && <Banner tone="info" title={roleNote[0]}>{roleNote[1]}</Banner>}
        <Card className="overflow-hidden">
          <Toolbar>
            <UrlSearch id="rep-q" placeholder="Find a report, like “defaulter”, “attendance” or “GST”" label="Find a report" />
          </Toolbar>
          <div className="px-3 pt-3 pb-1">
            <Chips value={cat} label="Report categories" options={[
              { value: "all", label: "All", count: mine.length, href: qs(BASE, { q: q || null }) },
              ...cats.map((c) => ({ value: c, label: c, count: mine.filter((r) => r.category === c).length, href: qs(BASE, { q: q || null, cat: c }) })),
            ]} />
          </div>
          {t && <p className="px-5 pt-2 text-[13px] text-ink3">{found.length} {found.length === 1 ? "report matches" : "reports match"} “{q}”</p>}
          {!t && cat === "all" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 px-2 pt-2 pb-2 border-b border-line/70 [&>div]:min-w-0">
              <div>
                <p className="eyebrow text-ink3 px-3 pt-2 pb-1 flex items-center gap-1.5"><Pin size={12} aria-hidden="true" /><Words k="Pinned" /></p>
                {pinned.length ? <ul>{pinned.map((r) => <Row key={r.key} r={r} showCat />)}</ul>
                  : <p className="px-3 py-3 text-[13px] text-ink3"><Words k="Nothing pinned. Tap the pin on any report to keep it here." /></p>}
              </div>
              <div>
                <p className="eyebrow text-ink3 px-3 pt-2 pb-1 flex items-center gap-1.5"><History size={12} aria-hidden="true" /><Words k="Used recently" /></p>
                {used.length ? <ul>{used.map((r) => <Row key={r.key} r={r} showCat />)}</ul>
                  : <p className="px-3 py-3 text-[13px] text-ink3"><Words k="Reports you open show here." /></p>}
              </div>
            </div>
          )}
          {found.length === 0 ? (
            <Empty icon={SearchX} title="No report matches"
              body={mine.length === 0 ? "No report is open to your role yet." : `Nothing called “${q}” in ${cat === "all" ? "your reports" : cat}. Try a shorter word${p.a.pages.custom ? ", or build your own in Custom & Scheduled Reports" : ""}.`}
              action={mine.length ? <Link href={BASE} scroll={false} className={buttonClass("secondary")}><Words k="Clear search" /></Link> : undefined} />
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-6 px-2 pb-3">
              {groups.map((g) => {
                const Ic = CAT_ICON[g];
                return (
                  <section key={g} className="pt-3 min-w-0" aria-label={g}>
                    <p className="eyebrow text-ink3 px-3 pb-1 flex items-center gap-1.5"><Ic size={12} aria-hidden="true" />{g}{MONEY.includes(g) && <span className="normal-case tracking-normal font-normal"><Words k="· financial year" /></span>}</p>
                    <ul>{found.filter((r) => r.category === g).map((r) => <Row key={r.key} r={r} />)}</ul>
                  </section>
                );
              })}
            </div>
          )}
          <p className="px-5 py-3 border-t border-line text-[12.5px] text-ink3"><Words k="Only reports your role may see are listed. Each module adds its reports here as it is switched on." /></p>
        </Card>
        {p.a.full && !p.a.pages.custom && (
          <Card className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <IconTile icon={Wand2} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[14.5px]"><Words k={"Custom & Scheduled Reports is off"} /></p>
              <p className="text-[13px] text-ink3"><Words k="Build your own reports and have any report emailed every day, week or month. For schools that need their own reports." /></p>
            </div>
            <QuickButton run={customFeatureAction.bind(null, true)}><Words k="Switch on" /></QuickButton>
          </Card>
        )}
      </div>
    </div>
  );
}
