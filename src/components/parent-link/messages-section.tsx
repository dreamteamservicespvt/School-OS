// "Messages from the school" on the guardian's Parent Link (src/lib/parent-link/messages.ts):
// each app notice the school sent this guardian, newest first, with its title, a short text
// (the whole text a tap away), the date and who sent it. "New" until this phone has shown it.
import { MessageSquareText } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { GuardianView } from "@/lib/parent-link/sections";
import type { ParentMessages } from "@/lib/parent-link/messages";
import { Pill } from "@/components/ui/badge";
import { makeT } from "@/lib/i18n/server";

export function MessagesSection({ data, view }: { data: ParentMessages; view: GuardianView }) {
  const t = makeT(view.lang);
  const more = (view.more ?? 0) + 1;
  const child = view.children.length > 1 ? `child=${view.child.id}&` : "";
  return (
    <>
      <ul className="divide-y divide-line/70 -mt-1">
        {data.rows.map((m) => {
          const head = (
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-[14px] break-words">{m.title ?? t("Message from the school")}</span>
                {m.isNew && <Pill tone="brand" dot>{t("New")}</Pill>}
              </span>
              <span className="block text-[12px] text-ink3 mt-1">
                {formatDateTime(m.at, view.timeZone)} · {m.from ? t("From {who}", { who: t.any(m.from) }) : t("From the school")}
              </span>
            </span>
          );
          // A short message shows whole: nothing to open (as the notices do).
          if (m.text.length <= 160 && !m.text.includes("\n")) {
            return (
              <li key={m.id} className="py-3 last:pb-0 flex gap-3">
                <MessageSquareText size={18} className="text-brand shrink-0 mt-0.5" aria-hidden="true" />
                <div className="min-w-0">
                  {head}
                  <p className="text-[13.5px] text-ink2 mt-1 break-words">{m.text}</p>
                </div>
              </li>
            );
          }
          return (
            <li key={m.id} className="py-3 last:pb-0 flex gap-3">
              <MessageSquareText size={18} className="text-brand shrink-0 mt-0.5" aria-hidden="true" />
              <details className="group min-w-0 flex-1">
                <summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    {head}
                    <span className="block text-[13px] text-ink2 mt-1 line-clamp-2 group-open:hidden break-words">{m.text}</span>
                  </span>
                  <span aria-hidden className="mt-1 text-ink3 transition-transform group-open:rotate-180">▾</span>
                </summary>
                <p className="mt-1 text-[13.5px] text-ink2 whitespace-pre-line break-words">{m.text}</p>
              </details>
            </li>
          );
        })}
      </ul>
      {data.more && (
        view.preview
          ? <p className="mt-3 text-[13px] text-ink3">{t("Show older")}</p>
          : <a href={`/p/${view.token}?${child}more=${more}#pl-messages`} className="mt-3 inline-flex h-11 items-center rounded-full border border-line px-4 text-[13.5px] font-semibold text-brand hover:border-brand">{t("Show older")}</a>
      )}
    </>
  );
}
