import { cx } from "./cx";

export const Skel = ({ className }: { className?: string }) => <div className={cx("skeleton", className)} />;

/** A light skeleton while a page loads, never a blank screen (P15). */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-fade">
      <Skel className="h-4 w-40 mb-3" />
      <Skel className="h-9 w-72 mb-6" />
      <div className="flex gap-2 mb-5">{Array.from({ length: 5 }, (_, i) => <Skel key={i} className="h-10 w-28 rounded-xl" />)}</div>
      <div className="bg-surface rounded-2xl border border-line/70 shadow-card p-4 space-y-3">
        <Skel className="h-11 w-full rounded-xl" />
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skel className="size-9 rounded-full" />
            <div className="flex-1 space-y-1.5"><Skel className="h-3.5 w-1/3" /><Skel className="h-3 w-1/5" /></div>
            <Skel className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
