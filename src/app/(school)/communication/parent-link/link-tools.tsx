"use client";

// Parent Link page tools in the approved design (mod-communication.jsx ParentLinkPage):
// the "What parents see" switches, saved at once, and the bar to resend links to ticked guardians.
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Smartphone } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/controls";
import { SettingRow } from "@/components/ui/rows";
import { cx } from "@/components/ui/cx";
import { saveParentLinkAction } from "../settings/actions";
import { resendManyAction } from "./actions";
import { Words } from "@/lib/i18n/client";

type Settings = { on: boolean; shows: Record<string, boolean>; autoSendOnAdmission: boolean; codeMinutes: number; deviceDays: number };

export function ShowsCard({ settings, switches, previewHref }: { settings: Settings; switches: { key: string; label: string; description: string }[]; previewHref: string | null }) {
  const router = useRouter();
  const [s, setS] = useState(settings);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const save = (next: Settings, title: string) => {
    const before = s;
    setS(next);
    start(async () => {
      const m = await saveParentLinkAction(next);
      if (m) { setS(before); setNote({ text: m, bad: true }); return; }
      setNote({ text: `${title}. Saved and recorded in the audit log.` });
      router.refresh();
    });
  };
  return (
    <Card>
      <CardHeader title="What parents see" description="Switch parts on or off for the whole school" icon={Smartphone}
        action={<Switch id="pl-on" on={s.on} disabled={pending} label="Parent Link on" onChange={(v) => save({ ...s, on: v }, v ? "Parent Link switched on" : "Parent Link switched off")} />} />
      <ul className={cx("border-t border-line/70 divide-y divide-line/70", !s.on && "opacity-50")}>
        {switches.map((sw) => (
          <li key={sw.key}>
            <SettingRow title={sw.label} sub={sw.description} id={`pl-${sw.key}`}>
              <Switch id={`pl-${sw.key}`} label={sw.label} on={s.on && s.shows[sw.key] !== false} disabled={!s.on || pending}
                onChange={(v) => save({ ...s, shows: { ...s.shows, [sw.key]: v } }, `${sw.label}: ${v ? "shown" : "hidden"} on Parent Link`)} />
            </SettingRow>
          </li>
        ))}
      </ul>
      {note && <p role={note.bad ? "alert" : "status"} className={cx("px-5 py-2.5 border-t border-line/70 text-[13px]", note.bad ? "text-bad" : "text-ok")}>{note.text}</p>}
      {previewHref && <div className="p-4 border-t border-line/70"><ButtonLink href={previewHref} variant="soft" icon={Smartphone} className="w-full"><Words k="See what parents see" /></ButtonLink></div>}
    </Card>
  );
}

/** Appears once guardians are ticked in the list; resends their same link. */
export function ResendBar({ form }: { form: string }) {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const boxes = () => [...document.querySelectorAll<HTMLInputElement>(`input[data-bulk-row][form="${form}"]`)];
  const chosen = () => [...new Set(boxes().filter((i) => i.checked).map((i) => i.value))];
  useEffect(() => {
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (!t.matches?.(`input[data-bulk-row][form="${form}"]`)) return;
      document.querySelectorAll<HTMLInputElement>(`input[data-bulk-row][form="${form}"][value="${CSS.escape(t.value)}"]`).forEach((i) => { i.checked = t.checked; });
      setNote(null);
      setCount(new Set([...document.querySelectorAll<HTMLInputElement>(`input[data-bulk-row][form="${form}"]:checked`)].map((i) => i.value)).size);
    };
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, [form]);
  const clear = () => { boxes().forEach((i) => { i.checked = false; }); setCount(0); setNote(null); };
  const resend = () => start(async () => {
    const r = await resendManyAction(chosen(), "");
    if (!r.ok) { setNote({ text: r.message, bad: true }); return; }
    clear();
    setNote({ text: `The same link was resent to ${r.sent} guardian${r.sent === 1 ? "" : "s"}.${r.failed ? ` ${r.failed} could not be sent (revoked, or no mobile).` : ""}` });
    router.refresh();
  });
  return (
    <form id={form} onSubmit={(e) => e.preventDefault()} aria-hidden={count || note ? undefined : true}
      className={count || note ? "fixed inset-x-2 bottom-20 z-30 rounded-2xl border border-line bg-surface p-3 shadow-pop sm:bottom-4 lg:left-[17rem] lg:right-6" : "hidden"}>
      <div className="flex flex-wrap items-center gap-2">
        <p className={cx("mr-2 text-[14px]", note ? (note.bad ? "text-bad" : "text-ok") : "font-semibold")} aria-live="polite">{note ? note.text : `${count} guardian${count === 1 ? "" : "s"} chosen`}</p>
        {count > 0 && <Button size="sm" variant="secondary" icon={Send} loading={pending} loadingText="Sending" onClick={resend}><Words k="Resend link" /></Button>}
        <Button size="sm" variant="ghost" onClick={clear} className="ml-auto">{count ? "Clear" : "Close"}</Button>
      </div>
    </form>
  );
}
