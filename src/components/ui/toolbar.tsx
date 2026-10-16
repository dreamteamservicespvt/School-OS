import { cx } from "./cx";

// The row of search and filters at the top of a list card (design/ui-prototype/src/kit.jsx Toolbar).
export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("flex flex-col md:flex-row md:flex-wrap md:items-center gap-2.5 p-3 border-b border-line", className)}>{children}</div>;
}
