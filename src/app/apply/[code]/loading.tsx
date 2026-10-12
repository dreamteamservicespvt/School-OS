import { Skel } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="min-h-dvh bg-bg animate-fade">
      <div className="border-b border-line bg-surface"><div className="mx-auto max-w-2xl px-4 py-3 flex items-center gap-3"><Skel className="size-[38px] rounded-full" /><div className="space-y-1.5"><Skel className="h-4 w-40" /><Skel className="h-3 w-24" /></div></div></div>
      <div className="mx-auto max-w-2xl px-4 pt-5 space-y-4">
        <Skel className="h-7 w-56" />
        {Array.from({ length: 3 }, (_, i) => <div key={i} className="bg-surface rounded-2xl border border-line/70 p-5 space-y-3"><Skel className="h-3 w-20" /><Skel className="h-11 w-full rounded-xl" /><Skel className="h-11 w-full rounded-xl" /></div>)}
      </div>
    </div>
  );
}
