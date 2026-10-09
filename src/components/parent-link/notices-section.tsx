// Notices on the guardian's Parent Link: Critical ones pinned at the top
// until they expire, then the notices for the chosen child's class.
import type { Notice } from "@prisma/client";
import { formatDate } from "@/lib/format";
import { fileLink } from "@/lib/files";
import type { GuardianView } from "@/lib/parent-link/sections";

export type NoticeRow = Pick<Notice, "id" | "title" | "body" | "priority" | "publishedAt" | "expiresOn" | "attachmentFileIds">;

function Attachments({ ids, view }: { ids: string[]; view: GuardianView }) {
  if (!ids.length || view.preview) return ids.length ? <p className="mt-2 text-sm text-ink-2">{ids.length} attachment{ids.length === 1 ? "" : "s"}</p> : null;
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {ids.map((id, i) => (
        <li key={id}>
          <a href={fileLink(id, view.schoolId)} className="inline-flex min-h-11 items-center rounded-lg border border-line-strong px-3 text-sm font-medium text-brand-text hover:bg-surface-2">
            Open attachment {ids.length > 1 ? i + 1 : ""}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function CriticalNotices({ data, view }: { data: NoticeRow[]; view: GuardianView }) {
  return (
    <div className="space-y-3">
      {data.map((n) => (
        <article key={n.id} className="rounded-2xl border-2 border-danger bg-danger-soft p-4" aria-label={`Critical notice: ${n.title}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-danger">Critical notice</p>
          <h3 className="mt-1 text-lg font-semibold">{n.title}</h3>
          <p className="mt-1 whitespace-pre-line">{n.body}</p>
          <p className="mt-2 text-sm text-ink-2">
            {n.publishedAt && <>Published {formatDate(n.publishedAt, view.timeZone)}</>}
            {n.expiresOn && <> · Until {formatDate(n.expiresOn, view.timeZone)}</>}
          </p>
          <Attachments ids={n.attachmentFileIds} view={view} />
        </article>
      ))}
    </div>
  );
}

export function NoticeList({ data, view }: { data: NoticeRow[]; view: GuardianView }) {
  return (
    <ul className="divide-y divide-line">
      {data.map((n) => (
        <li key={n.id} className="py-3 first:pt-0 last:pb-0">
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-3">
              <span>
                <span className="block font-medium">{n.title}</span>
                <span className="text-sm text-ink-2">
                  {n.publishedAt ? formatDate(n.publishedAt, view.timeZone) : ""}
                  {n.priority === "HIGH" && <span className="ml-2 rounded-full bg-warn-bg px-2 py-0.5 text-xs font-medium text-warn-text">High</span>}
                </span>
              </span>
              <span aria-hidden className="mt-1 text-ink-2 transition-transform group-open:rotate-180">▾</span>
            </summary>
            <p className="mt-2 whitespace-pre-line">{n.body}</p>
            <Attachments ids={n.attachmentFileIds} view={view} />
          </details>
        </li>
      ))}
    </ul>
  );
}
