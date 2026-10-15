"use client";

// The small browser parts of Reports & Analytics: pins, "Prepare the report",
// one-tap buttons and menus that run a server action. Each action checks the
// person's role on the server; the page refreshes and shows the toast.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Download, FileDown, FileText, Pin, Play, Printer, type LucideIcon } from "lucide-react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { MoreMenu } from "@/components/ui/more-menu";
import { cx } from "@/components/ui/cx";
import { prepareAction, togglePinAction } from "../actions";

/** Runs a one-tap action; shows its problem under the button. */
function useQuick() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const run = (fn: () => Promise<string | null>) => start(async () => {
    setProblem(null);
    const p = await fn();
    if (p) setProblem(p);
    else router.refresh();
  });
  return { pending, problem, run };
}

/** The pin on a report row: keeps the report at the top of All Reports for this person. */
export function PinButton({ reportKey, name, on }: { reportKey: string; name: string; on: boolean }) {
  const q = useQuick();
  return (
    <button type="button" disabled={q.pending} onClick={() => q.run(() => togglePinAction("report", reportKey, name))}
      aria-label={on ? `Unpin ${name}` : `Pin ${name}`} aria-pressed={on} title={q.problem ?? (on ? "Unpin" : "Pin to the top")}
      className={cx("w-9 h-9 rounded-lg grid place-items-center shrink-0 transition disabled:opacity-60", on ? "text-brand bg-brand/8" : "text-ink3 hover:bg-sunken hover:text-ink")}>
      <Pin size={16} className={on ? "fill-current" : ""} aria-hidden="true" />
    </button>
  );
}

/** A button that runs a one-tap server action (Remind, Send now, Not a concern...). */
export function QuickButton({ run, children, icon, variant = "secondary", size = "sm", className }: { run: () => Promise<string | null>; children: React.ReactNode; icon?: LucideIcon; variant?: ButtonVariant; size?: "sm" | "md"; className?: string }) {
  const q = useQuick();
  return (
    <span className={className}>
      <Button size={size} variant={variant} icon={icon} loading={q.pending} onClick={() => q.run(run)}>{children}</Button>
      {q.problem && <span role="alert" className="block mt-1 text-[12.5px] text-bad max-w-[280px]">{q.problem}</span>}
    </span>
  );
}

/** "Prepare the report": asks for the heavy report in the background and shows that it is being prepared. */
export function PrepareButton({ reportKey, params, words, href }: { reportKey: string; params: Record<string, string>; words: string; href: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-center gap-1">
      <Button variant="primary" icon={Play} loading={pending} loadingText="Starting…" onClick={() => start(async () => {
        setProblem(null);
        const r = await prepareAction(reportKey, params, words, "xlsx");
        if (r.problem || !r.runId) setProblem(r.problem ?? "That did not work. Please try again.");
        else router.replace(`${href}${href.includes("?") ? "&" : "?"}run=${r.runId}`, { scroll: false });
      })}>Prepare the report</Button>
      {problem && <span role="alert" className="text-[12.5px] text-bad">{problem}</span>}
    </span>
  );
}

/** The report's "..." menu: PDF, CSV, Print, pin, and "Email this every week". */
export function ReportMenu({ exportHref, reportKey, name, pinned, scheduleHref, canExport }: { exportHref: string; reportKey: string; name: string; pinned: boolean; scheduleHref: string | null; canExport: boolean }) {
  const q = useQuick();
  const sep = exportHref.includes("?") ? "&" : "?";
  const items = [
    ...(canExport ? [
      { label: "PDF", href: `${exportHref}${sep}format=pdf`, file: true, icon: <FileText size={16} aria-hidden="true" /> },
      { label: "CSV", href: `${exportHref}${sep}format=csv`, file: true, icon: <FileDown size={16} aria-hidden="true" /> },
      { label: "Print", href: `${exportHref}${sep}format=pdf&print=1`, file: true, icon: <Printer size={16} aria-hidden="true" /> },
    ] : []),
    { label: pinned ? "Unpin from the top" : "Pin to the top", onClick: () => q.run(() => togglePinAction("report", reportKey, name)), icon: <Pin size={16} aria-hidden="true" /> },
    ...(scheduleHref ? [{ label: "Email this every week", href: scheduleHref, icon: <CalendarClock size={16} aria-hidden="true" /> }] : []),
  ];
  return <MoreMenu size="sm" label={`${name}: more`} items={items} />;
}

/** A chart's "..." menu: export the chart data, pin it to the Dashboard. */
export function ChartMenu({ title, chartKey, exportHref, pinned, canExport }: { title: string; chartKey: string; exportHref: string; pinned: boolean; canExport: boolean }) {
  const q = useQuick();
  return (
    <MoreMenu size="sm" label={`${title}: more`} items={[
      ...(canExport ? [{ label: "Export the chart data", href: exportHref, file: true, icon: <Download size={16} aria-hidden="true" /> }] : []),
      { label: pinned ? "Remove from my Dashboard" : "Pin to my Dashboard", onClick: () => q.run(() => togglePinAction("chart", chartKey, title)), icon: <Pin size={16} aria-hidden="true" /> },
    ]} />
  );
}
