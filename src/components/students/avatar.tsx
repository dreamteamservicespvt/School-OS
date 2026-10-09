// A student's photo, or their initials when there is no photo yet.
import { initials } from "@/lib/students/labels";

const SIZES = { sm: "size-9 text-sm", md: "size-12 text-base", lg: "size-20 text-2xl sm:size-24" } as const;

export function Avatar({ name, src, size = "sm", hidden }: { name: string; src: string | null; size?: keyof typeof SIZES; hidden?: boolean }) {
  const cls = `${SIZES[size]} shrink-0 rounded-full`;
  if (src && !hidden) {
    // eslint-disable-next-line @next/next/no-img-element -- private signed links cannot go through the image optimiser
    return <img src={src} alt="" className={`${cls} border border-line object-cover`} loading="lazy" />;
  }
  return <span aria-hidden="true" className={`${cls} grid place-items-center bg-brand-soft font-semibold text-brand-text`}>{initials(name) || "?"}</span>;
}
