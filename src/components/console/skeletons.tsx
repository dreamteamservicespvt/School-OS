// Loading shapes for the console's pages (P15: never a blank screen).
import { Skel } from "@/components/ui/skeleton";

/** The sign-in, welcome and invite pages: brand panel and the form. */
export function FrameSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="min-h-dvh grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] bg-surface animate-fade">
      <div className="hidden lg:block bg-brand" />
      <div className="flex flex-col px-5 py-8 md:px-12">
        <div className="my-auto w-full max-w-[400px] mx-auto py-10 space-y-4">
          <Skel className="h-4 w-40" />
          <Skel className="h-9 w-64" />
          <Skel className="h-4 w-full" />
          <Skel className="h-11 w-full rounded-xl" />
          <Skel className="h-11 w-full rounded-xl" />
          <Skel className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/** The Dashboard: greeting, Needs attention and the side cards. */
export function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-fade">
      <div className="mb-5 space-y-2.5"><Skel className="h-8 w-60" /><Skel className="h-4 w-80 max-w-full" /></div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-line/70 bg-surface p-5 shadow-card space-y-4">
            <Skel className="h-5 w-40" />
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center gap-3"><Skel className="size-10 rounded-xl" /><div className="flex-1 space-y-1.5"><Skel className="h-3.5 w-2/3" /><Skel className="h-3 w-1/3" /></div><Skel className="h-8 w-28 rounded-lg" /></div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line/70 bg-line/70 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => <div key={i} className="space-y-2 bg-surface px-5 py-4"><Skel className="h-3 w-20" /><Skel className="h-7 w-12" /></div>)}
          </div>
        </div>
        <div className="space-y-5">
          {[6, 8].map((n, c) => (
            <div key={c} className="rounded-2xl border border-line/70 bg-surface p-5 shadow-card space-y-3">
              <Skel className="h-4 w-32" />
              {Array.from({ length: n }, (_, i) => <Skel key={i} className="h-4 w-full" />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
