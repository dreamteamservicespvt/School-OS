// The register photos a file was read from (gap list G43), shown beside its
// rows so each row can be checked against the page, and the mark on every
// row read from a photo. Links to the photos are signed and expire (08 §8).
import { fileLink } from "@/lib/files";
import type { PhotoMeta } from "@/lib/move-in/service";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Words } from "@/lib/i18n/client";

export const PHOTO_ROW_WORDS = "Read from a photo — check it";

/** Which photo (from 1) gave this row of the file, or null. */
export function photoOfLine(photos: PhotoMeta[], line: number): number | null {
  const i = photos.findIndex((p) => line >= p.from && line <= p.to);
  return i < 0 ? null : i + 1;
}

/** The mark on a row read from a photo, with the page when there are several. */
export function PhotoRowBadge({ photos, line }: { photos: PhotoMeta[]; line: number }) {
  if (!photos.length) return null;
  const n = photoOfLine(photos, line);
  return <Badge tone="warning" className="ml-2">{PHOTO_ROW_WORDS}{photos.length > 1 && n ? ` (photo ${n})` : ""}</Badge>;
}

export function RegisterPhotos({ photos, schoolId }: { photos: PhotoMeta[]; schoolId: string }) {
  if (!photos.length) return null;
  return (
    <Card className="self-start xl:sticky xl:top-4">
      <CardHeader title={photos.length === 1 ? "The register photo" : "The register photos"} description="The AI assistant read the rows from these pages. Check each row against the page; fix it or leave it out where it is wrong." />
      <ul className="max-h-[80vh] space-y-4 overflow-auto px-5 pb-5">
        {photos.map((p, i) => {
          const href = fileLink(p.fileId, schoolId);
          const rows = p.to >= p.from ? `rows ${p.from} to ${p.to}` : "no rows";
          return (
            <li key={p.fileId}>
              <p className="mb-1 text-sm text-ink-2 break-all">{photos.length > 1 ? `Photo ${i + 1}: ` : ""}{p.fileName} · {rows}</p>
              {p.contentType === "application/pdf" ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-medium text-brand-text hover:underline"><Words k="Open the scan (PDF) in a new tab" /></a>
              ) : (
                <a href={href} target="_blank" rel="noopener noreferrer" className="block" aria-label={`Open ${p.fileName} full size in a new tab`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a private, signed link that expires; not for the image optimiser */}
                  <img src={href} alt={`Register page: ${p.fileName}`} className="w-full rounded-lg border border-line" />
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
