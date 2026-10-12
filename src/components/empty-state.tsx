import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

// An empty screen says what is missing, why, and offers one way forward (00-global.md P6).
export function EmptyState({ title, children, icon, Icon = Inbox, action, bare }: { title: string; children?: React.ReactNode; icon?: React.ReactNode; Icon?: LucideIcon; action?: React.ReactNode; bare?: boolean }) {
  const body = (
    <div className="flex flex-col items-center text-center px-6 py-14 gap-3">
      <span className="w-14 h-14 rounded-2xl bg-sunken text-ink3 grid place-items-center" aria-hidden="true">{icon ?? <Icon size={26} />}</span>
      <h2 className="font-semibold text-[15px]">{title}</h2>
      {children && <div className="text-sm text-ink3 max-w-sm">{children}</div>}
      {action}
    </div>
  );
  if (bare) return body;
  return <section className="bg-surface rounded-2xl border border-line/70 shadow-card">{body}</section>;
}
