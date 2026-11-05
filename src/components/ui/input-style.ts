// The shared look of a text box, select or text area. Kept apart from ./field.tsx
// (a browser component) so a server page can style its own <select> with it.
import { cx } from "./cx";

export const inputCls = (error?: unknown) => cx(
  "w-full rounded-xl bg-surface border px-3.5 text-[15px] text-ink placeholder:text-ink3 outline-none transition disabled:bg-sunken disabled:text-ink3",
  error ? "border-bad ring-4 ring-bad/10" : "border-line hover:border-ink3/50 focus:border-brand focus:ring-4 focus:ring-brand/15",
);
