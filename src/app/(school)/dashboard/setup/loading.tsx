import { Skel } from "@/components/ui/skeleton";

export default function SetupLoading() {
  return (
    <div aria-busy="true" aria-label="Loading the setup checklist" className="flex flex-col gap-5 lg:gap-6 animate-fade">
      <div><Skel className="h-4 w-40 mb-2" /><Skel className="h-9 w-56 mb-2" /><Skel className="h-4 w-80" /></div>
      <Skel className="h-28 w-full rounded-3xl" />
      <div className="bg-surface rounded-2xl border border-line/70 shadow-card p-5 space-y-4">
        <div className="flex items-center gap-4"><Skel className="size-[68px] rounded-full" /><div className="flex-1 space-y-2"><Skel className="h-4 w-40" /><Skel className="h-3 w-2/3" /></div></div>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-start gap-3"><Skel className="size-8 rounded-full" /><div className="flex-1 space-y-1.5"><Skel className="h-3.5 w-1/3" /><Skel className="h-3 w-2/3" /></div></div>
        ))}
      </div>
    </div>
  );
}
