/** A light skeleton while a page loads, never a blank screen (P15). */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-4">
      <div className="skeleton h-8 w-56" />
      <div className="skeleton h-11 w-full max-w-md" />
      <div className="space-y-2 rounded-2xl border border-line bg-surface p-4">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-10 w-full" />)}
      </div>
    </div>
  );
}
