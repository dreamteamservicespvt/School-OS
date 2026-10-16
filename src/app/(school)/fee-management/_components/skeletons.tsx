// Loading skeletons in the shape of each Fee Management page (P15): never a blank screen.
import { Skel } from "@/components/ui/skeleton";

function Head({ tabs = 6 }: { tabs?: number }) {
  return (
    <>
      <Skel className="h-4 w-40 mb-3" />
      <Skel className="h-9 w-56 mb-2" />
      <Skel className="h-4 w-80 max-w-full mb-5" />
      <div className="flex gap-2 mb-5 overflow-hidden">{Array.from({ length: tabs }, (_, i) => <Skel key={i} className="h-9 w-28 shrink-0 rounded-xl" />)}</div>
    </>
  );
}

function Box({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`bg-surface rounded-2xl border border-line/70 shadow-card ${className}`}>{children}</div>;
}

export function Rows({ n = 7 }: { n?: number }) {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skel className="size-10 rounded-xl" />
          <div className="flex-1 space-y-1.5"><Skel className="h-3.5 w-1/3" /><Skel className="h-3 w-1/5" /></div>
          <Skel className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** A page with a header, tabs, optional stat tiles and a list. */
export function ListSkeleton({ stats = 0, toolbar = true }: { stats?: number; toolbar?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-fade">
      <Head />
      {stats > 0 && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">{Array.from({ length: stats }, (_, i) => <Box key={i} className="p-4 space-y-2"><Skel className="h-3 w-24" /><Skel className="h-7 w-28" /><Skel className="h-3 w-20" /></Box>)}</div>}
      <Box>
        {toolbar && <div className="p-4 border-b border-line flex gap-2"><Skel className="h-11 flex-1 rounded-xl" /><Skel className="h-11 w-36 rounded-xl hidden md:block" /><Skel className="h-11 w-36 rounded-xl hidden md:block" /></div>}
        <Rows />
      </Box>
    </div>
  );
}

/** Fee Dashboard: the band of four numbers, three cards, then recent payments. */
export function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-fade">
      <Head />
      <Skel className="h-[120px] w-full rounded-2xl mb-5" />
      <div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-5 mb-5">
        {Array.from({ length: 3 }, (_, i) => <Box key={i} className="p-5 space-y-3"><Skel className="h-4 w-40" /><Skel className="h-3 w-56" /><Skel className="h-40 w-full rounded-xl" /></Box>)}
      </div>
      <Box><Rows /></Box>
    </div>
  );
}

/** A student page: the student card, then tabs and a list (ledger, collect). */
export function StudentSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-fade">
      <Head />
      <Box className="p-5 flex items-center gap-4 mb-5">
        <Skel className="size-14 rounded-full" />
        <div className="flex-1 space-y-2"><Skel className="h-5 w-48" /><Skel className="h-3.5 w-64 max-w-full" /></div>
        <Skel className="size-[60px] rounded-full hidden sm:block" />
      </Box>
      <div className="flex gap-2 mb-4 overflow-hidden">{Array.from({ length: 5 }, (_, i) => <Skel key={i} className="h-9 w-24 shrink-0 rounded-xl" />)}</div>
      <Box><Rows n={8} /></Box>
    </div>
  );
}

/** Find a student (Collect Fee, ledger picker). */
export function SearchSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-fade">
      <Head />
      <div className="max-w-3xl">
        <Skel className="h-14 w-full rounded-2xl mb-4" />
        <Box><Rows n={6} /></Box>
      </div>
    </div>
  );
}
