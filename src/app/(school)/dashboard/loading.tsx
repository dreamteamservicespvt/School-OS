import { Skel } from "@/components/ui/skeleton";

// The Dashboard's shape while its numbers load: greeting, the brand band,
// Needs your attention and the side column. Never a blank screen (P15).
export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-label="Loading the Dashboard" className="flex flex-col gap-5 lg:gap-6 animate-fade">
      <div>
        <Skel className="h-4 w-56 mb-2" />
        <Skel className="h-9 w-64" />
      </div>
      <div className="rounded-3xl bg-brand/15 grid grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="p-4 md:p-6 space-y-2">
            <Skel className="h-3.5 w-24" />
            <Skel className="h-8 w-28" />
            <Skel className="h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 lg:gap-6 items-start">
        <div className="flex flex-col gap-5 lg:gap-6 min-w-0">
          {[4, 3].map((rows, c) => (
            <div key={c} className="bg-surface rounded-2xl border border-line/70 shadow-card p-4 space-y-3">
              <Skel className="h-5 w-48" />
              {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skel className="size-10 rounded-xl" />
                  <div className="flex-1 space-y-1.5"><Skel className="h-3.5 w-2/3" /><Skel className="h-3 w-1/3" /></div>
                  <Skel className="h-8 w-20 rounded-xl hidden sm:block" />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-5 lg:gap-6 min-w-0">
          {[3, 4].map((rows, c) => (
            <div key={c} className="bg-surface rounded-2xl border border-line/70 shadow-card p-4 space-y-3">
              <Skel className="h-5 w-36" />
              {Array.from({ length: rows }, (_, i) => <Skel key={i} className="h-10 w-full rounded-xl" />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
