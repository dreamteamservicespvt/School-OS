// Loading shapes for module pages in the approved design (P15: never a blank screen).
// They follow the page they stand in for: the module header with its tabs, the
// numbers band, and a list card; or a record's cover header, number strip and tabs.
import { Skel } from "./skeleton";

function Head({ tabs = 6 }: { tabs?: number }) {
  return (
    <>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2.5"><Skel className="h-8 w-44" /><Skel className="h-4 w-72 max-w-full" /></div>
        <div className="flex gap-2"><Skel className="h-11 w-28 rounded-xl" /><Skel className="h-11 w-36 rounded-xl" /></div>
      </div>
      <div className="mb-5 flex gap-4 overflow-hidden border-b border-line pb-3">{Array.from({ length: tabs }, (_, i) => <Skel key={i} className="h-5 w-24 shrink-0" />)}</div>
    </>
  );
}

function Band({ n = 4 }: { n?: number }) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line/70 bg-line/70 shadow-card xl:grid-cols-4">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="space-y-2 bg-surface px-5 py-4"><Skel className="h-3 w-24" /><Skel className="h-6 w-16" /><Skel className="h-3 w-32 max-w-full" /></div>
      ))}
    </div>
  );
}

function ListCard({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line/70 bg-surface shadow-card">
      <div className="flex gap-2.5 border-b border-line p-3"><Skel className="h-11 flex-1 rounded-xl" /><Skel className="hidden h-11 w-40 rounded-xl md:block" /><Skel className="hidden h-11 w-40 rounded-xl md:block" /></div>
      <div className="divide-y divide-line">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skel className="size-[38px] rounded-full" />
            <div className="flex-1 space-y-1.5"><Skel className="h-3.5 w-1/3" /><Skel className="h-3 w-1/5" /></div>
            <Skel className="hidden h-3.5 w-24 md:block" />
            <Skel className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A module list page: header and tabs, numbers, filter chips and the list. */
export function ListPageSkeleton({ band = true, chips = true, tabs }: { band?: boolean; chips?: boolean; tabs?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-fade">
      <Head tabs={tabs} />
      {band && <Band />}
      {chips && <div className="mb-3 flex gap-2 overflow-hidden">{Array.from({ length: 6 }, (_, i) => <Skel key={i} className="h-10 w-28 shrink-0 rounded-xl" />)}</div>}
      <ListCard />
    </div>
  );
}

/** A page of cards beside each other (settings, forms, a record's details). */
export function CardsPageSkeleton({ tabs }: { tabs?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-fade">
      <Head tabs={tabs} />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {[5, 4].map((n, c) => (
            <div key={c} className="space-y-3 rounded-2xl border border-line/70 bg-surface p-5 shadow-card">
              <Skel className="h-4 w-40" />
              <div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: n }, (_, i) => <div key={i} className="space-y-1.5"><Skel className="h-3 w-20" /><Skel className="h-4 w-40 max-w-full" /></div>)}</div>
            </div>
          ))}
        </div>
        <div className="space-y-3 rounded-2xl border border-line/70 bg-surface p-5 shadow-card">
          <Skel className="h-4 w-28" />
          {Array.from({ length: 4 }, (_, i) => <Skel key={i} className="h-4 w-full" />)}
        </div>
      </div>
    </div>
  );
}

/** One record (a student, parent or staff member): cover header, numbers and tabs. */
export function RecordSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-fade">
      <Skel className="mb-3 h-5 w-40" />
      <div className="overflow-hidden rounded-2xl border border-line/70 bg-surface shadow-card">
        <Skel className="h-16 rounded-none md:h-20" />
        <div className="flex items-end gap-4 px-4 pb-5 md:px-6">
          <Skel className="-mt-10 size-[96px] shrink-0 rounded-full border-4 border-surface md:-mt-12" />
          <div className="flex-1 space-y-2 pt-3"><Skel className="h-7 w-56 max-w-full" /><Skel className="h-4 w-72 max-w-full" /></div>
          <Skel className="hidden h-11 w-40 rounded-xl md:block" />
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-line bg-line/70 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="space-y-2 bg-surface px-5 py-3.5"><Skel className="h-3 w-20" /><Skel className="h-5 w-16" /></div>)}
        </div>
      </div>
      <div className="mb-5 mt-5 flex gap-4 overflow-hidden border-b border-line pb-3">{Array.from({ length: 7 }, (_, i) => <Skel key={i} className="h-5 w-20 shrink-0" />)}</div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-3 rounded-2xl border border-line/70 bg-surface p-5 shadow-card">
          <Skel className="h-4 w-40" />
          <div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: 8 }, (_, i) => <div key={i} className="space-y-1.5"><Skel className="h-3 w-20" /><Skel className="h-4 w-40 max-w-full" /></div>)}</div>
        </div>
        <div className="space-y-3 rounded-2xl border border-line/70 bg-surface p-5 shadow-card">
          <Skel className="h-4 w-28" />
          {Array.from({ length: 4 }, (_, i) => <Skel key={i} className="h-4 w-full" />)}
        </div>
      </div>
    </div>
  );
}
