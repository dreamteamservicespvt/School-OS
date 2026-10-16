import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, Globe, Link2, Pencil, Play, ShieldCheck, Tag, Archive } from "lucide-react";
import { withSchool } from "@/lib/db";
import { fileLink } from "@/lib/files";
import { audienceWords, consentedStudents, photoMark } from "@/lib/events/gallery";
import { albumUrl } from "@/lib/events/settings";
import { placeOrder, placesOf } from "@/lib/events/places";
import { ALBUM_STATUS, PHOTO_MARK, dmy, isoOf, longDay } from "@/lib/events/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { MoreMenu } from "@/components/ui/more-menu";
import { Banner, Col, Split, Stack } from "@/components/money/kit";
import { cx } from "@/components/ui/cx";
import { ActButton, CopyLink } from "../../_components/bits";
import { AccessForm, AlbumSheet, ConfirmSheet, PublishStaffOnlySheet, TagSheet, UploadButton, type TagPick } from "../../_components/gallery-sheets";
import { archiveAlbumAction, askConsentAction, newLinkAction, publishAlbumAction, removeMediaAction, shareAlbumAction } from "../../actions";
import { BASE, UUID, evGuard, one, qs, type SearchParams } from "../../_lib/page";

export const metadata = { title: "Album" };

/** One album (mod-events.jsx AlbumDetail): photos with consent marks, tagging, who can see it, publish and share. */
export default async function AlbumPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const p = await evGuard("gallery");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;
  const ctx = p.current.ctx;
  const full = p.can.gallery;
  const HREF = `${BASE}/gallery/${id}`;
  const doing = full ? one(sp.do) : "";
  const mediaParam = UUID.test(one(sp.media)) ? one(sp.media) : null;

  const d = await withSchool(ctx, async (tx) => {
    const a = await tx.album.findFirst({ where: { id } });
    if (!a) return null;
    const items = await tx.mediaItem.findMany({ where: { albumId: id, archivedAt: null }, include: { tags: { where: { archivedAt: null } } }, orderBy: { createdAt: "asc" } });
    const tagged = [...new Set(items.flatMap((i) => i.tags.map((t) => t.studentId)))];
    const consented = await consentedStudents(tx, ctx, tagged);
    const ev = a.eventId ? await tx.event.findFirst({ where: { id: a.eventId }, select: { id: true, name: true, type: true } }) : null;
    const words = await audienceWords(tx, a);
    const classes = await tx.schoolClass.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } });
    const year = (await tx.academicYear.findFirst({ where: { archivedAt: null, startDate: { lte: a.date }, endDate: { gte: a.date } } })) ?? p.year;
    // The tag sheet: the event's registered students, else the students of the album's classes, else the school.
    let picks: TagPick[] = [];
    const media = mediaParam ? items.find((i) => i.id === mediaParam) ?? null : null;
    if (doing === "tag" && media && year) {
      const regs = a.eventId ? await tx.eventRegistration.findMany({ where: { eventId: a.eventId, withdrawnAt: null }, select: { studentId: true } }) : [];
      let ids = regs.map((r) => r.studentId);
      if (!ids.length) {
        const enrol = await tx.enrolment.findMany({ where: { academicYearId: year.id, archivedAt: null, status: "STUDYING", ...(a.visibleTo === "CLASSES" && a.classIds.length ? { classId: { in: a.classIds } } : {}) }, select: { studentId: true } });
        ids = enrol.map((e) => e.studentId);
      }
      ids = [...new Set([...media.tags.map((t) => t.studentId), ...ids])];
      const [students, places, ok] = await Promise.all([
        tx.student.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }),
        placesOf(tx, ids, year.id),
        consentedStudents(tx, ctx, ids),
      ]);
      picks = students.map((s) => {
        const t = media.tags.find((x) => x.studentId === s.id);
        return { id: s.id, name: s.fullName, place: places.get(s.id)?.label ?? "", consent: ok.has(s.id), tagged: Boolean(t), x: t?.x ?? null, y: t?.y ?? null, _p: places.get(s.id) };
      }).sort((x, y) => Number(y.tagged) - Number(x.tagged) || placeOrder(x._p, y._p)).map(({ _p, ...r }) => { void _p; return r; });
    }
    const events = doing === "edit" ? await tx.event.findMany({ where: { archivedAt: null }, orderBy: { date: "desc" }, take: 40, select: { id: true, name: true, date: true } }) : [];
    return { a, items, consented, ev, words, classes, picks, media, events };
  });
  if (!d) notFound();
  const a = d.a;
  const st = ALBUM_STATUS[a.status] ?? { label: a.status, tone: "neutral" as const };
  const marks = new Map(d.items.map((m) => [m.id, photoMark(m, d.consented)]));
  const count = (k: string) => [...marks.values()].filter((m) => m === k).length;
  const photos = d.items.filter((m) => m.kind === "PHOTO").length;
  const videos = d.items.length - photos;
  const without = new Set(d.items.filter((m) => !m.noStudents).flatMap((m) => m.tags.map((t) => t.studentId)).filter((s) => !d.consented.has(s))).size;
  const untagged = count("untagged");
  const here = (over: Record<string, string | null> = {}) => qs(HREF, over);
  const link = a.status === "PUBLISHED" && a.visibleTo !== "STAFF" ? albumUrl(a.schoolId, a.id, a.shareVersion) : null;

  let sheet: React.ReactNode = null;
  if (doing === "publish" && a.status !== "PUBLISHED") sheet = <PublishStaffOnlySheet closeHref={HREF} changeHref={`${HREF}#who`} albumId={a.id} />;
  if (doing === "archive" && a.status !== "ARCHIVED") sheet = <ConfirmSheet closeHref={HREF} title={`Archive ${a.name}?`} sub="Hidden from parents and the album link stops working. Staff can still see it." action={archiveAlbumAction} hidden={{ albumId: a.id }} submitLabel="Archive album" />;
  if (doing === "newlink" && link) sheet = <ConfirmSheet closeHref={HREF} title="Make a new album link?" sub="The link parents already have stops working. Share the album again to send the new one." action={newLinkAction} hidden={{ albumId: a.id }} submitLabel="Make a new link" />;
  if (doing === "edit") sheet = <AlbumSheet closeHref={HREF} start={{ id: a.id, name: a.name, date: isoOf(a.date), eventId: a.eventId ?? "" }} rule={a.consentRule} events={d.events.map((e) => ({ value: e.id, label: e.name, date: isoOf(e.date) }))} classes={[]} />;
  if (doing === "tag" && d.media) sheet = <TagSheet closeHref={HREF} removeHref={here({ do: "remove", media: d.media.id })} mediaId={d.media.id} src={fileLink(d.media.fileId, a.schoolId)} video={d.media.kind === "VIDEO"} students={d.picks} />;
  if (doing === "remove" && d.media) sheet = <ConfirmSheet closeHref={HREF} title={`Remove this ${d.media.kind === "VIDEO" ? "video" : "photo"}?`} sub="It goes from the album. You can undo it from the message that follows." action={removeMediaAction} hidden={{ mediaId: d.media.id }} submitLabel="Remove" danger />;

  return (
    <div>
      <Link href={`${BASE}/gallery`} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 h-8 px-1 rounded-lg"><ArrowLeft size={17} aria-hidden="true" />Gallery <span className="text-ink3 font-normal">/ {a.number}</span></Link>
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap"><h1 className="font-display text-[24px] md:text-[28px] font-semibold tracking-tight leading-tight">{a.name}</h1><Pill tone={st.tone} dot>{st.label}</Pill></div>
          <p className="text-[14px] text-ink3 mt-1">{d.ev ? `${d.ev.name} · ` : ""}{longDay(isoOf(a.date))} · {photos} photos{videos ? `, ${videos} videos` : ""}</p>
        </div>
        {full && (
          <div className="flex gap-2 flex-wrap items-start">
            {a.status !== "ARCHIVED" && <UploadButton albumId={a.id} />}
            {a.status === "DRAFT" && (a.visibleTo === "STAFF"
              ? <ButtonLink variant="primary" icon={Globe} href={here({ do: "publish" })} scroll={false}>Publish</ButtonLink>
              : <ActButton action={publishAlbumAction} fields={{ albumId: a.id }} label="Publish" icon="Globe" variant="primary" size="md" />)}
            {link && <ActButton action={shareAlbumAction} fields={{ albumId: a.id }} label="Share link" icon="Send" size="md" />}
            <MoreMenu items={[
              { label: "Change name or date", href: here({ do: "edit" }), icon: <Pencil size={16} aria-hidden="true" /> },
              ...(link ? [{ label: "Make a new link", href: here({ do: "newlink" }), icon: <Link2 size={16} aria-hidden="true" /> }] : []),
              ...(a.status !== "ARCHIVED" ? [{ label: "Archive album", href: here({ do: "archive" }), icon: <Archive size={16} aria-hidden="true" />, tone: "bad" as const }] : []),
            ]} />
          </div>
        )}
      </div>
      <Stack>
        {a.status === "ARCHIVED" && <Banner tone="info" title="Archived.">Hidden from parents. Staff can still see it.</Banner>}
        {without > 0 && (
          <Banner tone="warn" title={`${without} ${without === 1 ? "student" : "students"} in this album ${without === 1 ? "has" : "have"} no photo consent.`}
            action={full && <ActButton action={askConsentAction} fields={{ albumId: a.id }} label="Ask guardians" />}>
            {a.consentRule === "OUT" ? "Photos with them are left out when shared." : "They are blurred when shared."}
          </Banner>
        )}
        {untagged > 0 && <Banner tone="info" title={`${untagged} ${untagged === 1 ? "photo is" : "photos are"} not tagged yet.`}>They stay visible to staff only until the students in them are tagged.</Banner>}
        <Split side={300}>
          <Card className="p-3 md:p-4 min-w-0">
            {d.items.length ? (
              <ul className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5">
                {d.items.map((m) => {
                  const mk = marks.get(m.id)!;
                  const out = mk === "some" && a.consentRule === "OUT";
                  const src = fileLink(m.fileId, a.schoolId);
                  const tile = (
                    <>
                      {m.kind === "VIDEO"
                        ? <span className="absolute inset-0 grid place-items-center bg-ink/80 text-white"><Play size={30} aria-hidden="true" /></span>
                        // eslint-disable-next-line @next/next/no-img-element
                        : <img src={src} alt={`Photo ${m.tags.length ? `with ${m.tags.length} tagged` : "not tagged"}`} loading="lazy" className={cx("absolute inset-0 w-full h-full object-cover", out && "opacity-40")} />}
                      <span className="absolute left-1.5 bottom-1.5 right-1.5 flex items-center gap-1 flex-wrap">
                        <span className="rounded-full bg-surface"><Pill tone={PHOTO_MARK[mk].tone} className="!h-5 !text-[10.5px] !px-2">{out ? "Left out" : mk === "some" ? "Blurred when shared" : PHOTO_MARK[mk].label}</Pill></span>
                        {m.tags.length > 0 && <span className="h-5 px-1.5 rounded-full bg-surface/90 text-ink2 text-[10.5px] font-semibold flex items-center gap-0.5"><Tag size={10} aria-hidden="true" />{m.tags.length}</span>}
                      </span>
                    </>
                  );
                  return (
                    <li key={m.id}>
                      {full
                        ? <Link href={here({ do: "tag", media: m.id })} scroll={false} aria-label={`Tag students in this ${m.kind === "VIDEO" ? "video" : "photo"}`} className="relative block w-full aspect-square rounded-xl overflow-hidden bg-sunken">{tile}</Link>
                        : <span className="relative block w-full aspect-square rounded-xl overflow-hidden bg-sunken">{tile}</span>}
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-[14px] text-ink3 p-6 text-center">No photos yet.{full && a.status !== "ARCHIVED" ? " Upload them from a phone or computer." : ""}</p>}
          </Card>
          <Col>
            <Card id="who">
              <CardHeader icon={Eye} title="Who can see it" description={d.words} />
              <AccessForm albumId={a.id} visibleTo={a.visibleTo} classIds={a.classIds} consentRule={a.consentRule} classes={d.classes.map((c) => ({ value: c.id, label: c.name }))} canEdit={full} />
            </Card>
            {link && (
              <Card>
                <CardHeader icon={Link2} title="Album link" description={a.sharedAt ? `Sent to parents on ${dmy(isoOf(a.sharedAt))}` : "Not sent yet"} />
                <div className="px-5 pb-5 flex flex-col gap-2">
                  <p className="text-[12.5px] text-ink2 break-all rounded-xl bg-sunken/70 px-3 py-2">{link}</p>
                  <CopyLink url={link} label="Copy link" />
                </div>
              </Card>
            )}
            <Card>
              <CardHeader icon={ShieldCheck} title="Photo consent" description="Checked before a photo is shown or shared" />
              <ul className="px-5 pb-5 flex flex-col gap-2 text-[13.5px]">
                {(["ok", "some", "untagged", "none"] as const).map((k) => <li key={k} className="flex items-center justify-between gap-3"><Pill tone={PHOTO_MARK[k].tone}>{PHOTO_MARK[k].label}</Pill><span className="tnum font-semibold">{count(k)}</span></li>)}
              </ul>
            </Card>
          </Col>
        </Split>
      </Stack>
      {sheet}
    </div>
  );
}
