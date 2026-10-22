// Notices on the guardian's Parent Link (parent.jsx): Critical ones pinned at the top until they
// expire, then the notices for the chosen child's class, newest first.
import type { Notice } from "@prisma/client";
import { Megaphone, Paperclip } from "lucide-react";
import { formatDate } from "@/lib/format";
import { fileLink } from "@/lib/files";
import type { GuardianView } from "@/lib/parent-link/sections";
import { makeT } from "@/lib/i18n/server";

export type NoticeRow = Pick<Notice, "id" | "title" | "body" | "priority" | "publishedAt" | "expiresOn" | "attachmentFileIds">;

function Attachments({ ids, view }: { ids: string[]; view: GuardianView }) {
  if (!ids.length) return null;
  const t = makeT(view.lang);
  if (view.preview) return <p className="mt-2 text-[12.5px] text-ink3">{ids.length === 1 ? t("1 attachment") : t("{n} attachments", { n: ids.length })}</p>;
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {ids.map((id, i) => (
        <li key={id}>
          <a href={fileLink(id, view.schoolId)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-[13px] font-semibold text-brand hover:bg-brand/8">
            <Paperclip size={14} aria-hidden="true" />{t("Open attachment")} {ids.length > 1 ? i + 1 : ""}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function CriticalNotices({ data, view }: { data: NoticeRow[]; view: GuardianView }) {
  const t = makeT(view.lang);
  return (
    <>
      {data.map((n) => (
        <article key={n.id} className="rounded-2xl bg-warn/12 border border-warn/30 p-4 flex gap-3" aria-label={t("Critical notice: {title}", { title: n.title })}>
          <Megaphone size={20} className="text-warn shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold text-[14.5px] leading-snug">{n.title}</p>
            <p className="text-[13px] text-ink2 mt-1 whitespace-pre-line">{n.body}</p>
            <p className="text-[12px] text-ink3 mt-1.5">
              {n.publishedAt && <>{formatDate(n.publishedAt, view.timeZone)}</>}
              {n.expiresOn && <> · {t("until {date}", { date: formatDate(n.expiresOn, "UTC") })}</>}
            </p>
            <Attachments ids={n.attachmentFileIds} view={view} />
          </div>
        </article>
      ))}
    </>
  );
}

export function NoticeList({ data, view }: { data: NoticeRow[]; view: GuardianView }) {
  const t = makeT(view.lang);
  return (
    <ul className="divide-y divide-line/70 -mt-1">
      {data.map((n) => (
        <li key={n.id} className="py-3 last:pb-0">
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span className="block font-semibold text-[14px]">{n.title}</span>
                <span className="block text-[13px] text-ink2 mt-0.5 line-clamp-2 group-open:hidden">{n.body}</span>
                <span className="block text-[12px] text-ink3 mt-1">
                  {n.publishedAt ? formatDate(n.publishedAt, view.timeZone) : ""}
                  {n.priority === "HIGH" && <span className="ml-2 rounded-full bg-warn/12 px-2 py-0.5 text-[11px] font-semibold text-warn">{t("High@@priority")}</span>}
                </span>
              </span>
              <span aria-hidden className="mt-1 text-ink3 transition-transform group-open:rotate-180">▾</span>
            </summary>
            <p className="mt-1 text-[13.5px] text-ink2 whitespace-pre-line">{n.body}</p>
            <Attachments ids={n.attachmentFileIds} view={view} />
          </details>
        </li>
      ))}
    </ul>
  );
}
