// An empty screen says what is missing, why, and offers one way forward (00-global.md P6).
export function EmptyState({ title, children, icon }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-dashed border-line bg-surface px-6 py-10 text-center">
      {icon && <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-brand-soft text-brand-text">{icon}</div>}
      <h2 className="text-lg font-semibold">{title}</h2>
      {children && <div className="mx-auto mt-2 max-w-prose text-ink-2">{children}</div>}
    </section>
  );
}
