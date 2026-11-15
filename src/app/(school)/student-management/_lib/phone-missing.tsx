// A parent with no phone (owner decision 15, 15-11-2026): "Phone missing",
// with "Add phone" to the parent's edit page for people who may change it.
// No Parent Link and no messages reach this parent until a phone is added.
import Link from "next/link";
import { PhoneOff } from "lucide-react";
import { Any } from "@/lib/i18n/client";
import { cx } from "@/components/ui/cx";

export function PhoneMissing({ editHref, className }: { editHref?: string | null; className?: string }) {
  return (
    <span className={cx("inline-flex flex-wrap items-center gap-1.5 whitespace-nowrap", className)}>
      <span className="inline-flex items-center gap-1 font-semibold text-warn"><PhoneOff size={14} aria-hidden="true" /><Any text="Phone missing" /></span>
      {editHref && <>
        <span aria-hidden="true" className="text-ink3">·</span>
        <Link href={editHref} className="relative z-10 font-semibold text-brand hover:underline"><Any text="Add phone" /></Link>
      </>}
    </span>
  );
}
