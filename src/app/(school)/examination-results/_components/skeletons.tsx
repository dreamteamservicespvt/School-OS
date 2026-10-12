// Loading skeletons for Examination & Results (P15): the shape of each page,
// never a blank screen.
import { Skel } from "@/components/ui/skeleton";

function Head({ tabs = true, back = false }: { tabs?: boolean; back?: boolean }) {
  return (
    <>
      {back ? <Skel className="h-4 w-48 mb-4" /> : null}
      <Skel className="h-9 w-72 mb-2" />
      <Skel className="h-4 w-96 max-w-full mb-6" />
      {tabs && <div className="flex gap-3 mb-6 overflow-hidden">{Array.from({ length: 7 }, (_, i) => <Skel key={i} className="h-8 w-24 shrink-0 rounded-lg" />)}</div>}
    </>
  );
}

const Box = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-surface rounded-2xl border border-line/70 shadow-card ${className}`}>{children}</div>
);

/** A module tab with stats and a list. */
export function ListSkeleton({ stats = true }: { stats?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-fade">
      <Head />
      {stats && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">{Array.from({ length: 4 }, (_, i) => <Box key={i} className="p-4"><Skel className="h-3.5 w-24 mb-3" /><Skel className="h-7 w-16" /></Box>)}</div>}
      <Box className="overflow-hidden">
        <div className="flex flex-col md:flex-row gap-2.5 p-3 border-b border-line"><Skel className="h-11 flex-1 rounded-xl" /><Skel className="h-11 w-40 rounded-xl" /><Skel className="h-11 w-36 rounded-xl" /></div>
        <div className="p-4 space-y-4">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skel className="size-9 rounded-xl" />
              <div className="flex-1 space-y-1.5"><Skel className="h-3.5 w-1/3" /><Skel className="h-3 w-1/5" /></div>
              <Skel className="hidden sm:block h-2 w-32 rounded-full" />
              <Skel className="h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </Box>
    </div>
  );
}

/** The marks grid and other wide tables: a header card, stats and rows of cells. */
export function GridSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-fade">
      <Skel className="h-4 w-48 mb-4" />
      <Box className="p-4 mb-5 flex items-center gap-3"><Skel className="size-12 rounded-xl" /><div className="flex-1 space-y-2"><Skel className="h-6 w-56" /><Skel className="h-3.5 w-80 max-w-full" /></div><Skel className="hidden sm:block h-10 w-48 rounded-xl" /></Box>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">{Array.from({ length: 4 }, (_, i) => <Box key={i} className="p-4"><Skel className="h-3.5 w-20 mb-3" /><Skel className="h-7 w-14" /></Box>)}</div>
      <Box className="p-4 space-y-3">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skel className="size-8 rounded-full" /><Skel className="h-3.5 w-40" />
            <div className="flex-1 flex justify-end gap-2">{Array.from({ length: 4 }, (_, j) => <Skel key={j} className="h-10 w-[72px] rounded-xl" />)}</div>
          </div>
        ))}
      </Box>
    </div>
  );
}

/** A form page (add or change a datesheet). */
export function FormSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-fade">
      <Head tabs={false} back />
      <Box className="p-6 space-y-6">
        {Array.from({ length: 3 }, (_, s) => (
          <div key={s} className="space-y-3">
            <Skel className="h-3 w-32" />
            <div className="grid md:grid-cols-2 gap-3 max-w-4xl">{Array.from({ length: 4 }, (_, i) => <div key={i} className="space-y-1.5"><Skel className="h-3.5 w-24" /><Skel className="h-11 w-full rounded-xl" /></div>)}</div>
          </div>
        ))}
      </Box>
    </div>
  );
}

/** Two columns: a main card and a side column (admit cards, results, a datesheet). */
export function SplitSkeleton({ back = false }: { back?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-fade">
      <Head tabs={!back} back={back} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px] items-start">
        <Box className="p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 4 }, (_, i) => <div key={i} className="space-y-1.5"><Skel className="h-3 w-16" /><Skel className="h-5 w-24" /></div>)}</div>
          <Skel className="h-11 w-full rounded-xl" />
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="flex items-center gap-3"><Skel className="h-3.5 w-6" /><Skel className="size-8 rounded-full" /><Skel className="h-3.5 flex-1 max-w-56" /><Skel className="ml-auto h-6 w-20 rounded-full" /></div>)}
        </Box>
        <div className="space-y-5">
          <Box className="p-4 space-y-3"><Skel className="h-5 w-32" /><Skel className="h-64 w-full rounded-2xl" /></Box>
          <Box className="p-4 space-y-3"><Skel className="h-5 w-32" />{Array.from({ length: 5 }, (_, i) => <Skel key={i} className="h-2 w-full rounded-full" />)}</Box>
        </div>
      </div>
    </div>
  );
}
