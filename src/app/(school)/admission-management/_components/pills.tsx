// Small display pieces shared by Admission screens (design: mod-admissions.jsx
// DocPill, STAGE_TONE, BackLink). Colours only through tokens.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Pill } from "@/components/ui/badge";
import { Progress } from "@/components/ui/rows";
import { cx } from "@/components/ui/cx";
import { stageLabel } from "@/lib/admission/applications";
import { STAGE_TONE } from "@/lib/admission/tones";
import type { FeeStatus } from "@/lib/admission/fee";
import { Words } from "@/lib/i18n/client";

/** Papers verified out of those the class needs, as a bar and "3 of 5". */
export function DocPill({ verified, required, className }: { verified: number; required: number; className?: string }) {
  if (required === 0) return <span className="text-[13px] text-ink3"><Words k="None needed" /></span>;
  const done = verified >= required;
  return (
    <span className={cx("flex items-center gap-2 w-32", className)}>
      <Progress value={(verified / required) * 100} tone={done ? "ok" : "warn"} className="flex-1" />
      <span className={cx("text-[12.5px] font-semibold tnum whitespace-nowrap", !done && "text-warn")}>{verified} <Words k="of" /> {required}</span>
    </span>
  );
}

export function StagePill({ stage, className }: { stage: string; className?: string }) {
  return <Pill tone={STAGE_TONE[stage] ?? "neutral"} className={className}>{stageLabel(stage)}</Pill>;
}

export function FeePill({ status, className }: { status: FeeStatus; className?: string }) {
  const tone = status.key === "paid" ? "ok" : status.key === "due" ? "bad" : status.key === "waiting" ? "warn" : "neutral";
  const words = status.key === "waiting" ? "Waiting" : status.label;
  return <Pill tone={tone} className={className}>{words}</Pill>;
}

/** "← Applications / APP-0012" above a record page. */
export function BackLink({ href, label, sub }: { href: string; label: string; sub?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 h-8 px-1 rounded-lg">
      <ArrowLeft size={17} aria-hidden="true" />{label}{sub && <span className="text-ink3 font-normal">/ {sub}</span>}
    </Link>
  );
}
