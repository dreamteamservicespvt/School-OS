// Loading skeletons shaped like each Admission page (P15): never a blank screen.
import { Skel } from "@/components/ui/skeleton";

function Head({ tabs = true }: { tabs?: boolean }) {
  return (
    <>
      <Skel className="h-9 w-56 mb-2" />
      <Skel className="h-4 w-80 max-w-full mb-5" />
      {tabs && <div className="flex gap-4 mb-5 overflow-hidden">{Array.from({ length: 7 }, (_, i) => <Skel key={i} className="h-5 w-28 shrink-0" />)}</div>}
    </>
  );
}

const Box = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => <div className={`bg-surface rounded-2xl border border-line/70 shadow-card ${className}`}>{children}</div>;

function StatsRow() {
  return (
    <Box className="grid grid-cols-2 xl:grid-cols-4 gap-px overflow-hidden mb-5">
      {Array.from({ length: 4 }, (_, i) => <div key={i} className="p-4 space-y-2"><Skel className="h-3 w-24" /><Skel className="h-6 w-16" /><Skel className="h-3 w-28" /></div>)}
    </Box>
  );
}

function Rows({ n = 7 }: { n?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skel className="size-9 rounded-full" />
          <div className="flex-1 space-y-1.5"><Skel className="h-3.5 w-1/3" /><Skel className="h-3 w-1/5" /></div>
          <Skel className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </>
  );
}

/** Header, numbers, filters and a list (Enquiries, Applications, Documents, Test & Interview). */
export function ListSkeleton({ stats = true }: { stats?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-fade">
      <Head />
      {stats && <StatsRow />}
      <Box className="p-4 space-y-3">
        <div className="flex gap-2"><Skel className="h-11 flex-1 rounded-xl" /><Skel className="h-11 w-28 rounded-xl" /></div>
        <div className="flex gap-2 pb-1">{Array.from({ length: 4 }, (_, i) => <Skel key={i} className="h-11 w-36 rounded-xl" />)}</div>
        <Rows />
      </Box>
    </div>
  );
}

/** Header, view tabs and cards in two columns (Admission Decision, Admission Reports). */
export function CardsSkeleton({ stats = false }: { stats?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-fade">
      <Head />
      {stats ? <StatsRow /> : <div className="flex gap-4 mb-5">{Array.from({ length: 4 }, (_, i) => <Skel key={i} className="h-5 w-32" />)}</div>}
      <div className="grid lg:grid-cols-2 gap-5">
        {Array.from({ length: 4 }, (_, i) => (
          <Box key={i} className="p-5 space-y-3">
            <div className="flex items-center gap-3"><Skel className="size-11 rounded-full" /><div className="flex-1 space-y-1.5"><Skel className="h-4 w-1/2" /><Skel className="h-3 w-1/3" /></div></div>
            {Array.from({ length: 4 }, (_, j) => <Skel key={j} className="h-3 w-full" />)}
            <div className="flex gap-2 pt-1"><Skel className="h-10 w-28 rounded-xl" /><Skel className="h-10 w-24 rounded-xl" /></div>
          </Box>
        ))}
      </div>
    </div>
  );
}

/** Back link, header card and two columns (an application, an enquiry). */
export function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-fade">
      <Skel className="h-4 w-32 mb-4" />
      <Box className="p-5 flex items-center gap-4 mb-5"><Skel className="size-14 rounded-full" /><div className="flex-1 space-y-2"><Skel className="h-6 w-56" /><Skel className="h-3.5 w-72 max-w-full" /></div><Skel className="h-10 w-32 rounded-xl hidden sm:block" /></Box>
      <StatsRow />
      <div className="grid lg:grid-cols-[1fr_340px] gap-5">
        <Box className="p-5 space-y-3">{Array.from({ length: 8 }, (_, i) => <Skel key={i} className="h-4 w-full" />)}</Box>
        <Box className="p-5 space-y-3">{Array.from({ length: 6 }, (_, i) => <Skel key={i} className="h-4 w-full" />)}</Box>
      </div>
    </div>
  );
}

/** A form in cards (New application, Edit, Import). */
export function FormSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-fade max-w-3xl">
      <Skel className="h-4 w-32 mb-4" />
      <Skel className="h-9 w-64 mb-5" />
      {Array.from({ length: 3 }, (_, i) => (
        <Box key={i} className="p-5 mb-4 grid sm:grid-cols-2 gap-3">
          <Skel className="h-3 w-24 sm:col-span-2" />
          {Array.from({ length: 4 }, (_, j) => <div key={j} className="space-y-1.5"><Skel className="h-3 w-20" /><Skel className="h-11 w-full rounded-xl" /></div>)}
        </Box>
      ))}
    </div>
  );
}

/** Setting cards with switch rows (Admission Settings). */
export function SettingsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-fade">
      <Head />
      <div className="max-w-5xl space-y-5">
        {Array.from({ length: 3 }, (_, i) => (
          <Box key={i} className="p-5 space-y-4">
            <Skel className="h-5 w-56" />
            {Array.from({ length: 4 }, (_, j) => <div key={j} className="flex items-center gap-3"><div className="flex-1 space-y-1.5"><Skel className="h-3.5 w-1/3" /><Skel className="h-3 w-1/2" /></div><Skel className="h-6 w-11 rounded-full" /></div>)}
          </Box>
        ))}
      </div>
    </div>
  );
}

/** The success card after an admission is confirmed. */
export function DoneSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-fade max-w-[640px] mx-auto">
      <Box className="p-7 flex flex-col items-center gap-3">
        <Skel className="size-16 rounded-full" /><Skel className="h-6 w-64" /><Skel className="h-4 w-48" />
        <div className="w-full space-y-3 pt-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="flex items-center gap-3"><Skel className="size-9 rounded-xl" /><Skel className="h-4 flex-1" /></div>)}</div>
      </Box>
    </div>
  );
}
