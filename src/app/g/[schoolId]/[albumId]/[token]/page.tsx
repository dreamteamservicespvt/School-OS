// A shared album (no login): the link parents get when staff share a
// published album. Photo consent is checked now, every time it opens: only
// tagged photos are shown, students without photo consent are blurred or the
// photo is left out (18 §2, rule 33). "Make a new link" stops old links.
import type { Metadata } from "next";
import { timingSafeEqual } from "node:crypto";
import { Images, LinkIcon } from "lucide-react";
import { withSchool } from "@/lib/db";
import { deviceInfo } from "@/lib/current";
import { hitLimit, limitMessage } from "@/lib/rate-limit";
import { fileLink } from "@/lib/files";
import { sharedItems } from "@/lib/events/gallery";
import { albumToken } from "@/lib/events/settings";
import { isoOf, longDay } from "@/lib/events/words";
import { PhoneCard, PhoneNotice, PhoneShell } from "@/components/parent-link/phone-shell";
import { I18nProvider, Words } from "@/lib/i18n/client";
import { catalogueFor, getT, schoolPageLanguage } from "@/lib/i18n/server";
import { screenMessage } from "@/lib/i18n/messages";
import type { T } from "@/lib/i18n/t";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Photos", robots: { index: false, follow: false }, referrer: "no-referrer" };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sameToken(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** In the school's language for this browser (the parent's choice, else the school's default). */
export default async function SharedAlbumPage({ params }: { params: Promise<{ schoolId: string; albumId: string; token: string }> }) {
  const { schoolId } = await params;
  const t = uuid.test(schoolId) ? (await schoolPageLanguage(schoolId)).t : await getT();
  return <I18nProvider lang={t.lang} dict={catalogueFor(t.lang)}><SharedAlbum params={params} t={t} /></I18nProvider>;
}

async function SharedAlbum({ params, t }: { params: Promise<{ schoolId: string; albumId: string; token: string }>; t: T }) {
  const { schoolId, albumId, token } = await params;
  const device = await deviceInfo();
  const limited = await hitLimit(`album-open:ip:${device.ipAddress ?? "unknown"}`, 120, 600);
  if (!limited.ok) return <PhoneShell t={t} kind="Photos"><PhoneNotice title="Please wait a moment">{screenMessage(t, limitMessage(limited))}</PhoneNotice></PhoneShell>;

  const found = uuid.test(schoolId) && uuid.test(albumId) ? await withSchool({ schoolId, userId: null }, async (tx) => {
    const ctx = { schoolId, userId: null };
    const school = await tx.school.findUnique({ where: { id: schoolId }, select: { name: true, phone: true } });
    if (!school) return null;
    const album = await tx.album.findFirst({ where: { id: albumId, schoolId } });
    if (!album || album.status !== "PUBLISHED" || album.visibleTo === "STAFF" || !sameToken(albumToken(album.id, album.shareVersion), token)) return { school, album: null } as const;
    const shared = await sharedItems(tx, ctx, album);
    return { school, album, shared } as const;
  }, { timeout: 60_000 }) : null;

  if (!found || !found.album) {
    return (
      <PhoneShell t={t} schoolName={found?.school.name} kind="Photos" schoolPhone={found?.school.phone}>
        <PhoneNotice title="This link does not work" icon={<LinkIcon size={26} />}><Words k="The album may have been archived or a new link sent. Please open the latest link from the school’s message." /></PhoneNotice>
      </PhoneShell>
    );
  }
  const { school, album, shared } = found;
  return (
    <PhoneShell t={t} schoolName={school.name} kind="Photos" schoolPhone={school.phone}>
      <PhoneCard className="flex items-start gap-3.5">
        <span className="w-12 h-12 rounded-2xl bg-brand/10 text-brand grid place-items-center shrink-0"><Images size={22} aria-hidden="true" /></span>
        <div className="min-w-0">
          <h1 className="font-semibold text-[17px] leading-snug">{album.name}</h1>
          <p className="text-[13px] text-ink3 mt-0.5">{longDay(isoOf(album.date))} · {shared.items.length === 1 ? t("1 photo") : t("{n} photos", { n: shared.items.length })}</p>
          <p className="text-[12.5px] text-ink3 mt-2">{shared.blurred ? t("Only photos of students whose parents gave photo consent are shown; other students are blurred.") : t("Only photos of students whose parents gave photo consent are shown.")}</p>
        </div>
      </PhoneCard>
      {shared.items.length ? (
        <ul className="grid grid-cols-2 gap-2">
          {shared.items.map((i) => {
            const src = fileLink(i.fileId, schoolId);
            return (
              <li key={i.mediaId} className="rounded-xl overflow-hidden bg-sunken aspect-square">
                {i.kind === "VIDEO"
                  ? <video src={src} controls preload="metadata" className="w-full h-full object-cover" />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <a href={src} target="_blank" rel="noreferrer"><img src={src} alt={t("Photo from {name}", { name: album.name })} loading="lazy" className="w-full h-full object-cover" /></a>}
              </li>
            );
          })}
        </ul>
      ) : <PhoneNotice title="No photos to show yet"><Words k="The school is still sorting the photos. Please check again later." /></PhoneNotice>}
    </PhoneShell>
  );
}
