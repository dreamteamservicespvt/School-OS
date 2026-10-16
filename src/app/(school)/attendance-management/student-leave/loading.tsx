import { Skel } from "@/components/ui/skeleton";

/** Student Leave while it loads: head, tabs, count tiles and the list. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-fade">
      <Skel className="h-9 w-48 mb-2" />
      <Skel className="h-4 w-96 max-w-full mb-6" />
      <div className="flex gap-2 mb-5 border-b border-line pb-3">{Array.from({ length: 6 }, (_, i) => <Skel key={i} className="h-6 w-28" />)}</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">{Array.from({ length: 4 }, (_, i) => <Skel key={i} className="h-24 rounded-2xl" />)}</div>
      <div className="rounded-2xl border border-line bg-surface">
        <div className="flex gap-2 p-3">{Array.from({ length: 5 }, (_, i) => <Skel key={i} className="h-8 w-24 rounded-full" />)}</div>
        <div className="flex gap-2 p-3 border-b border-line"><Skel className="h-10 flex-1" /><Skel className="h-10 w-32" /><Skel className="h-10 w-32" /></div>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-line last:border-0">
            <Skel className="size-9 rounded-full" />
            <div className="flex-1 space-y-1.5"><Skel className="h-3.5 w-1/4" /><Skel className="h-3 w-1/6" /></div>
            <Skel className="h-4 w-24" /><Skel className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
