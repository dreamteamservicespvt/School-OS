export default function Loading() {
  return (
    <div className="min-h-dvh bg-bg" aria-busy="true" aria-label="Loading the survey">
      <div className="mx-auto max-w-xl">
        <div className="bg-brand px-5 pt-5 pb-16 sm:rounded-b-[28px]">
          <div className="h-9 w-40 rounded-xl bg-white/15" />
          <div className="mt-5 h-4 w-20 rounded bg-white/15" />
          <div className="mt-2 h-7 w-48 rounded-lg bg-white/20" />
        </div>
        <div className="px-4 -mt-12 relative flex flex-col gap-4">
          <div className="skeleton h-28 !rounded-3xl" />
          <div className="skeleton h-40 !rounded-3xl" />
          <div className="skeleton h-40 !rounded-3xl" />
        </div>
      </div>
    </div>
  );
}
