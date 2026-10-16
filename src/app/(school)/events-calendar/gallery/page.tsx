import Link from "next/link";
import { FolderPlus, Images, Video } from "lucide-react";
import { withSchool } from "@/lib/db";
import { dateWhere } from "@/lib/periods";
import { audienceWords, consentedStudents, photoMark } from "@/lib/events/gallery";
import { ALBUM_STATUS, eventIcon, isoOf, longDay, spanWords } from "@/lib/events/words";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SegLinks } from "@/components/ui/blocks";
import { PeriodFilter } from "@/components/list/period-filter";
import { Banner, Empty, Stack } from "@/components/money/kit";
import { EvHead } from "../_components/head";
import { EvIcon } from "../_components/icons";
import { AlbumSheet } from "../_components/gallery-sheets";
import { BASE, evGuard, evPeriod, one, qs, type SearchParams } from "../_lib/page";

export const metadata = { title: "Gallery" };

const HREF = `${BASE}/gallery`;
const TILES = ["bg-brand/10 text-brand", "bg-ok/10 text-ok", "bg-warn/12 text-warn", "bg-bad/10 text-bad", "bg-info/10 text-info"];

/** Gallery (18 §2, mod-events.jsx Gallery): albums by event, with photo consent marks. */
export default async function GalleryPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await evGuard("gallery");
  const sp = await searchParams;
  const ctx = p.current.ctx;
  const f = ["PUBLISHED", "DRAFT", "ARCHIVED"].includes(one(sp.f)) ? one(sp.f) : "all";
  const vp = evPeriod(sp, p.dates, "acyear");
  const range = vp.range!;
  const keep = { f: f === "all" ? null : f, ...vp.keep };
  const here = (over: Record<string, string | null> = {}) => qs(HREF, { ...keep, ...over });
  const doing = p.can.gallery ? one(sp.do) : "";

  const d = await withSchool(ctx, async (tx) => {
    const albums = await tx.album.findMany({ where: { date: dateWhere(range), ...(f === "all" ? {} : { status: f }) }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 200 });
    const items = albums.length ? await tx.mediaItem.findMany({ where: { albumId: { in: albums.map((a) => a.id) }, archivedAt: null }, select: { id: true, albumId: true, kind: true, noStudents: true, tags: { where: { archivedAt: null }, select: { studentId: true } } } }) : [];
    const consented = await consentedStudents(tx, ctx, items.flatMap((i) => i.tags.map((t) => t.studentId)));
    const events = await tx.event.findMany({ where: { archivedAt: null, id: { in: albums.map((a) => a.eventId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, type: true } });
    const words = new Map(await Promise.all(albums.map(async (a) => [a.id, await audienceWords(tx, a)] as const)));
    // Students in published albums without photo consent (the banner).
    const pub = new Set(albums.filter((a) => a.status === "PUBLISHED").map((a) => a.id));
    const missing = new Set(items.filter((i) => pub.has(i.albumId)).flatMap((i) => i.tags.map((t) => t.studentId)).filter((s) => !consented.has(s)));
    const sheetEvents = doing === "new" ? await tx.event.findMany({ where: { archivedAt: null, cancelledAt: null, date: { lte: new Date(`${p.today}T00:00:00Z`) } }, orderBy: { date: "desc" }, take: 40, select: { id: true, name: true, date: true } }) : [];
    const classes = doing === "new" ? await tx.schoolClass.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }) : [];
    return { albums, items, consented, events, words, missing: missing.size, sheetEvents, classes };
  });

  const rows = d.albums.map((a, i) => {
    const its = d.items.filter((x) => x.albumId === a.id);
    const marks = its.map((m) => photoMark(m, d.consented));
    const without = new Set(its.filter((m) => !m.noStudents).flatMap((m) => m.tags.map((t) => t.studentId)).filter((s) => !d.consented.has(s))).size;
    const ev = d.events.find((e) => e.id === a.eventId);
    const consent = !its.length || marks.every((m) => m === "untagged") ? "untagged" : without ? "some" : "all";
    return { a, photos: its.filter((m) => m.kind === "PHOTO").length, videos: its.filter((m) => m.kind === "VIDEO").length, without, consent, icon: eventIcon(ev?.type ?? "", ev?.name ?? a.name), tile: TILES[i % TILES.length] };
  });
  const totalPhotos = rows.reduce((s, r) => s + r.photos, 0);

  return (
    <div>
      <EvHead pageName="Gallery" href={HREF} sub="Photo and video albums by event. Students without photo consent are blurred or left out."
        actions={p.can.gallery && <ButtonLink href={here({ do: "new" })} scroll={false} variant="primary" icon={FolderPlus}>New album</ButtonLink>} />
      <Stack>
        {d.missing > 0 && <Banner tone="warn" title={`${d.missing} ${d.missing === 1 ? "student" : "students"} in published albums ${d.missing === 1 ? "has" : "have"} no photo consent.`}>They are left out of shared photos or blurred. Ask their guardians from the album page.</Banner>}
        <div className="flex items-center gap-3 flex-wrap">
          <PeriodFilter {...p.dates} fallback="acyear" />
          <SegLinks label="Album status" value={f} options={[
            { value: "all", label: "All", href: here({ f: null }) }, { value: "PUBLISHED", label: "Published", href: here({ f: "PUBLISHED" }) },
            { value: "DRAFT", label: "Drafts", href: here({ f: "DRAFT" }) }, { value: "ARCHIVED", label: "Archived", href: here({ f: "ARCHIVED" }) },
          ]} />
          <span className="text-[13px] text-ink3 tnum">{vp.label} · {spanWords(range.from, range.to)} · {rows.length} albums · {totalPhotos} photos</span>
        </div>
        {rows.length ? (
          <ul className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
            {rows.map((r) => (
              <li key={r.a.id}>
                <Link href={`${HREF}/${r.a.id}`} className="block w-full text-left rounded-2xl bg-surface border border-line/70 shadow-card overflow-hidden hover:border-brand/40 transition group">
                  <span className={`relative block aspect-[4/3] overflow-hidden ${r.tile}`}>
                    <span className="absolute inset-0 dotgrid opacity-40" />
                    <span className="absolute -right-6 -bottom-8 w-28 h-28 rounded-full bg-current opacity-[.08]" />
                    <span className="absolute inset-0 grid place-items-center"><EvIcon name={r.icon} size={42} className="group-hover:scale-105 transition" /></span>
                    <span className="absolute left-2 top-2 rounded-full bg-surface"><Pill tone={ALBUM_STATUS[r.a.status]?.tone ?? "neutral"} className="!h-[22px] !text-[11px]">{ALBUM_STATUS[r.a.status]?.label ?? r.a.status}</Pill></span>
                    <span className="absolute right-2 bottom-2 h-6 px-2 rounded-full bg-surface/90 text-ink2 text-[11.5px] font-semibold flex items-center gap-1 tnum"><Images size={12} aria-hidden="true" />{r.photos}{r.videos ? <><Video size={12} className="ml-1" aria-hidden="true" />{r.videos}</> : null}</span>
                  </span>
                  <span className="block p-3">
                    <span className="block font-semibold text-[14px] truncate">{r.a.name}</span>
                    <span className="block text-[12px] text-ink3 truncate">{longDay(isoOf(r.a.date))} · {d.words.get(r.a.id)}</span>
                    <span className="mt-1.5 flex"><Pill tone={r.consent === "all" ? "ok" : r.consent === "some" ? "warn" : "neutral"} className="!h-[22px] !text-[11px]">{r.consent === "some" ? `${r.without} without consent` : r.consent === "all" ? "All consented" : "Not tagged"}</Pill></span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Card><Empty icon={Images} title="No albums here" body="No albums in these dates. Pick other dates or another filter." action={p.can.gallery ? <ButtonLink variant="secondary" icon={FolderPlus} href={here({ do: "new" })} scroll={false}>New album</ButtonLink> : undefined} /></Card>
        )}
      </Stack>
      {doing === "new" && (
        <AlbumSheet closeHref={here({ do: null })} start={{ date: p.today }} rule={p.settings.galleryRule}
          events={d.sheetEvents.map((e) => ({ value: e.id, label: e.name, date: isoOf(e.date) }))} classes={d.classes.map((c) => ({ value: c.id, label: c.name }))} />
      )}
    </div>
  );
}
