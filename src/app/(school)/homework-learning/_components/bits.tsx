// Small pieces shared by the Homework & Learning pages (mod-homework.jsx SubIcon, BackLink, FileRow).
import Link from "next/link";
import { ArrowLeft, BookOpen, Calculator, Download, Dumbbell, ExternalLink, FileImage, FileText, FlaskConical, Globe, Languages, Link2, Monitor, Music, Palette, type LucideIcon } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { TONE_SOFT } from "@/components/money/kit";
import { subjectLook } from "@/lib/homework/words";

const ICONS: Record<string, LucideIcon> = { Calculator, FlaskConical, BookOpen, Languages, Globe, Monitor, Palette, Dumbbell, Music };

export const subjectIcon = (subject: string) => ICONS[subjectLook(subject).icon] ?? BookOpen;
export const subjectTone = (subject: string) => subjectLook(subject).tone;

function SubjectGlyph({ name, size }: { name: string; size: number }) {
  switch (name) {
    case "Calculator": return <Calculator size={size} />;
    case "FlaskConical": return <FlaskConical size={size} />;
    case "Languages": return <Languages size={size} />;
    case "Globe": return <Globe size={size} />;
    case "Monitor": return <Monitor size={size} />;
    case "Palette": return <Palette size={size} />;
    case "Dumbbell": return <Dumbbell size={size} />;
    case "Music": return <Music size={size} />;
    default: return <BookOpen size={size} />;
  }
}

/** The subject's icon in its soft tone (mod-homework.jsx SubIcon). */
export function SubIcon({ subject, size = 40 }: { subject: string; size?: number }) {
  const s = size > 36 ? 19 : 16;
  return (
    <span className={cx("rounded-xl grid place-items-center shrink-0", TONE_SOFT[subjectTone(subject)])} style={{ width: size, height: size }} aria-hidden="true">
      <SubjectGlyph name={subjectLook(subject).icon} size={s} />
    </span>
  );
}

/** "← Homework / Mathematics · 7 B" above a detail page. */
export function BackLink({ href, label, sub }: { href: string; label: string; sub?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 h-8 px-1 rounded-lg">
      <ArrowLeft size={17} aria-hidden="true" />{label} {sub && <span className="text-ink3 font-normal">/ {sub}</span>}
    </Link>
  );
}

/** One attached file or link with a way to open it. */
export function FileRow({ name, meta, href, kind, remove }: { name: string; meta?: string; href: string | null; kind: string; remove?: React.ReactNode }) {
  const Icon = kind === "link" ? Link2 : /\.pdf$/i.test(name) || kind === "file" ? FileText : FileImage;
  const external = kind === "link";
  return (
    <li className="flex items-center gap-3 px-2 py-2 rounded-xl">
      <span className="w-9 h-9 rounded-lg bg-sunken grid place-items-center text-ink2 shrink-0"><Icon size={17} aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold truncate">{name}</p>
        {meta && <p className="text-[12px] text-ink3 truncate">{meta}</p>}
      </div>
      {href && (
        <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}
          className="h-9 px-3 rounded-lg text-[13px] font-semibold text-brand hover:bg-brand/10 inline-flex items-center gap-1.5" aria-label={`Open ${name}`}>
          {external ? <ExternalLink size={15} aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}Open
        </a>
      )}
      {remove}
    </li>
  );
}

/** A ring with a value inside (mod-homework.jsx Ring). */
export function Ring({ value, size = 56, stroke = 6, tone = "ok", children }: { value: number; size?: number; stroke?: number; tone?: "ok" | "brand" | "warn" | "bad"; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <span className="relative inline-grid place-items-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="fill-none stroke-sunken" />
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (v / 100) * c}
          className={cx("fill-none", tone === "ok" ? "stroke-ok" : tone === "warn" ? "stroke-warn" : tone === "bad" ? "stroke-bad" : "stroke-brand")} />
      </svg>
      <span className="absolute inset-0 grid place-items-center">{children}</span>
    </span>
  );
}
