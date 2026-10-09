"use client";

// The bar of bulk actions that appears once students are chosen (P11). Each
// action opens its own page with the chosen students, where the change is
// previewed and confirmed; nothing changes from this bar alone.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/button";

export type BulkAction = { label: string; href: string; primary?: boolean; /** A file (PDF, CSV): opened directly instead of as a page. */ file?: boolean };

export function BulkBar({ form, actions, noun = "student" }: { form: string; actions: BulkAction[]; noun?: string }) {
  const [count, setCount] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const visible = () => [...document.querySelectorAll<HTMLInputElement>(`input[data-bulk-row][form="${form}"]`)].filter((i) => i.offsetParent !== null);
    const recount = () => {
      const ids = new Set([...document.querySelectorAll<HTMLInputElement>(`input[data-bulk-row][form="${form}"]:checked`)].map((i) => i.value));
      setCount(ids.size);
      const all = document.querySelector<HTMLInputElement>("input[data-bulk-all]");
      const v = visible();
      if (all) {
        all.checked = v.length > 0 && v.every((i) => i.checked);
        all.indeterminate = !all.checked && v.some((i) => i.checked);
      }
    };
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.matches("input[data-bulk-all]")) visible().forEach((i) => { i.checked = t.checked; });
      if (t.matches("input[data-bulk-row]")) {
        // Keep the hidden twin (table on computers, card on phones) in step.
        document.querySelectorAll<HTMLInputElement>(`input[data-bulk-row][form="${form}"][value="${CSS.escape(t.value)}"]`).forEach((i) => { i.checked = t.checked; });
      }
      recount();
    };
    document.addEventListener("change", onChange);
    recount();
    return () => document.removeEventListener("change", onChange);
  }, [form]);

  const clear = () => {
    document.querySelectorAll<HTMLInputElement>(`input[data-bulk-row][form="${form}"], input[data-bulk-all]`).forEach((i) => { i.checked = false; i.indeterminate = false; });
    setCount(0);
  };

  return (
    <form id={form} method="get" onSubmit={(e) => {
      // Send each chosen student once, as one list.
      e.preventDefault();
      const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
      const target = submitter?.dataset.href;
      if (!target) return;
      const ids = [...new Set([...document.querySelectorAll<HTMLInputElement>(`input[data-bulk-row][form="${form}"]:checked`)].map((i) => i.value))];
      const url = `${target}${target.includes("?") ? "&" : "?"}ids=${ids.join(",")}`;
      // A file (PDF, CSV) is downloaded by the browser, not shown as a page.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (submitter?.dataset.file) window.location.assign(url); else router.push(url);
    }}
      className={count ? "no-print fixed inset-x-2 bottom-20 z-30 rounded-2xl border border-line bg-surface p-3 shadow-pop sm:bottom-4 lg:left-[17rem]" : "hidden"}
      aria-hidden={count ? undefined : true}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-2 font-medium" aria-live="polite">{count} {noun}{count === 1 ? "" : "s"} chosen</p>
        {actions.map((a) => (
          <button key={a.label} type="submit" data-href={a.href} data-file={a.file ? "1" : undefined} className={buttonClass(a.primary ? "primary" : "secondary", "sm")}>{a.label}</button>
        ))}
        <button type="button" onClick={clear} className={buttonClass("ghost", "sm", "ml-auto")}>Clear</button>
      </div>
    </form>
  );
}
