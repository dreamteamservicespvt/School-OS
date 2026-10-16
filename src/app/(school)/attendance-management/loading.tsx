import { Skel } from "@/components/ui/skeleton";

/** Take Attendance while it loads: head, tabs, banner, count tiles and the class list. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-fade">
      <Skel className="h-9 w-48 mb-2" />
      <Skel className="h-4 w-80 max-w-full mb-6" />
      <div className="flex gap-2 mb-5 border-b border-line pb-3">{Array.from({ length: 6 }, (_, i) => <Skel key={i} className="h-6 w-28" />)}</div>
      <Skel className="h-12 w-full rounded-2xl mb-4" />
      <div className="grid grid-cols-4 gap-2 mb-4">{Array.from({ length: 4 }, (_, i) => <Skel key={i} className="h-16 rounded-xl" />)}</div>
      <div className="grid md:grid-cols-2 gap-2">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2.5">
            <Skel className="h-4 w-5" /><Skel className="size-9 rounded-full" />
            <div className="flex-1 space-y-1.5"><Skel className="h-3.5 w-2/5" /><Skel className="h-3 w-1/5" /></div>
            <Skel className="size-10 rounded-xl" /><Skel className="size-10 rounded-xl" /><Skel className="size-10 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
