// How a WhatsApp card looks on the parent's phone (docs/design/whatsapp-messages.md):
// header in bold (or the receipt PDF), the words with *bold* values, the footer in
// small grey, then the buttons. Used on Message Templates for the saved card and
// for the new card "Make ready for WhatsApp" gives.
import { ExternalLink, FileText, Phone } from "lucide-react";
import type { CardButton, CardHeader } from "@/lib/messaging/card";
import { Any } from "@/lib/i18n/client";

/** "*₹2,500*" shown bold, as WhatsApp does; with `blanks`, {student_name} picked out. */
function Formatted({ text, blanks }: { text: string; blanks?: boolean }) {
  return <>{text.split(/(\*[^*\n]+\*|\{[a-z_]+\})/g).map((part, i) => {
    if (/^\*[^*\n]+\*$/.test(part)) return <b key={i} className="font-semibold"><Formatted text={part.slice(1, -1)} blanks={blanks} /></b>;
    if (blanks && /^\{[a-z_]+\}$/.test(part)) return <span key={i} className="font-mono text-[12.5px] px-1 rounded bg-brand/10 text-brand">{part}</span>;
    return <span key={i}>{part}</span>;
  })}</>;
}

export function WhatsappCardPreview({ header, text, footer, buttons, marketing, blanks }: {
  header: CardHeader | null;
  text: string;
  footer: string;
  buttons: CardButton[];
  marketing?: boolean;
  blanks?: boolean;
}) {
  return (
    <div className="max-w-[360px]">
      <div className="rounded-2xl rounded-tl-md bg-surface border border-line shadow-card overflow-hidden">
        {header?.type === "document" && (
          <div className="flex items-center gap-2.5 bg-sunken/70 border-b border-line px-3.5 py-3 text-[13px]">
            <FileText size={22} className="text-bad shrink-0" aria-hidden />
            <span className="min-w-0"><b className="font-semibold block"><Any text="Receipt PDF" /></b><span className="text-ink3"><Any text="The parent's own receipt, attached" /></span></span>
          </div>
        )}
        <div className="p-3.5 flex flex-col gap-2 text-[14px] leading-relaxed">
          {header?.type === "text" && <p className="font-semibold text-[15px]">{header.text}</p>}
          <div className="whitespace-pre-line break-words"><Formatted text={text} blanks={blanks} /></div>
          <p className="text-[12px] text-ink3">{footer}</p>
        </div>
        {buttons.length > 0 && (
          <ul className="border-t border-line divide-y divide-line">
            {buttons.map((b, i) => (
              <li key={i} className="flex items-center justify-center gap-1.5 py-2.5 text-[14px] font-semibold text-brand">
                {b.type === "PHONE" ? <Phone size={15} aria-hidden /> : <ExternalLink size={15} aria-hidden />}{b.text}
              </li>
            ))}
          </ul>
        )}
      </div>
      {marketing && <p className="mt-1.5 text-[12.5px] text-ink3"><Any text="Sent to WhatsApp as a marketing message: it costs more, and parents who turned off marketing messages do not get it." /></p>}
    </div>
  );
}
