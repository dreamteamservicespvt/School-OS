export default function Loading() {
  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 pt-4" aria-busy="true" aria-label="Loading your page">
      <div className="skeleton h-8 w-40" />
      <div className="flex gap-3"><div className="skeleton h-16 w-52" /><div className="skeleton h-16 w-52" /></div>
      <div className="skeleton h-40 w-full" />
      <div className="skeleton h-40 w-full" />
    </div>
  );
}
