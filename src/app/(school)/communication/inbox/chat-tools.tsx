"use client";

// WhatsApp Inbox, the parts that act (mod-communication.jsx Inbox): the reply box with quick replies,
// and the chat's buttons (assign, make it a query, mark resolved).
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, ClipboardList, RotateCcw, SendHorizontal, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cx } from "@/components/ui/cx";
import { assignChatAction, chatToQueryAction, markReadAction, replyChatAction, resolveChatAction } from "./actions";
import { Words } from "@/lib/i18n/client";

export function Composer({ chatId, firstName, quick, canSend }: { chatId: string; firstName: string; quick: string[]; canSend: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => { void markReadAction(chatId); }, [chatId]);
  const send = () => start(async () => {
    setMsg(null);
    const m = await replyChatAction(chatId, draft);
    if (m) setMsg(m);
    else { setDraft(""); router.refresh(); }
  });
  if (!canSend) return null;
  return (
    <div className="border-t border-line p-3 flex flex-col gap-2">
      <div className="-mx-3 px-3 overflow-x-auto"><div className="flex gap-1.5 w-max">
        {quick.map((r) => <button key={r} type="button" onClick={() => setDraft(r)} className="h-8 px-3 rounded-full bg-sunken text-[12.5px] font-medium text-ink2 hover:bg-line whitespace-nowrap">{r}</button>)}
      </div></div>
      {msg && <p role="alert" className="text-[13px] text-bad">{msg}</p>}
      <form onSubmit={(e) => { e.preventDefault(); if (draft.trim()) send(); }} className="flex items-center gap-2">
        <label htmlFor="inbox-reply" className="sr-only"><Words k="Reply" /></label>
        <input id="inbox-reply" value={draft} maxLength={1000} onChange={(e) => setDraft(e.target.value)} placeholder={`Reply to ${firstName}`}
          className="h-11 flex-1 min-w-0 rounded-xl bg-surface border border-line px-3.5 text-[15px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
        <Button type="submit" icon={SendHorizontal} loading={pending} disabled={!draft.trim()} aria-label="Send reply" className="!px-3.5" />
      </form>
    </div>
  );
}

export function ChatButtons({ chatId, name, assigned, resolved, queryHref, office, people }: {
  chatId: string; name: string; assigned: boolean; resolved: boolean; queryHref: string | null; office: boolean; people: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<string | void>, after?: () => void) => start(async () => {
    setMsg(null);
    const m = await fn();
    if (m) setMsg(m);
    else { after?.(); router.refresh(); }
  });
  const toQuery = () => start(async () => {
    setMsg(null);
    const r = await chatToQueryAction(chatId);
    if (!r.ok) setMsg(r.message);
    else router.push(`/communication/queries/${r.id}`);
  });
  return (
    <div className="flex items-center gap-1.5 flex-wrap justify-end">
      {msg && <p role="alert" className="w-full text-right text-[12.5px] text-bad">{msg}</p>}
      {office && <Button size="sm" variant="secondary" icon={UserCheck} onClick={() => setOpen(true)}>{assigned ? "Reassign" : "Assign"}</Button>}
      {office && (queryHref ? <a href={queryHref} className="h-9 px-3 rounded-xl text-[13px] font-semibold text-brand hover:bg-brand/10 inline-flex items-center gap-1.5"><ClipboardList size={15} aria-hidden="true" /><Words k="Query" /></a>
        : <Button size="sm" variant="ghost" icon={ClipboardList} loading={pending} onClick={toQuery}><Words k="Make it a query" /></Button>)}
      <Button size="sm" variant={resolved ? "ghost" : "soft"} icon={resolved ? RotateCcw : CircleCheck} loading={pending} onClick={() => run(() => resolveChatAction(chatId, !resolved))}>{resolved ? "Reopen" : "Resolved"}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Give ${name}’s chat to`} sub="They see it under Assigned to me and get a notification">
        <ul className="flex flex-col max-h-[55vh] overflow-y-auto">
          {people.map((p) => (
            <li key={p.value}>
              <button type="button" disabled={pending} onClick={() => run(() => assignChatAction(chatId, p.value), () => setOpen(false))}
                className={cx("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-sunken/70 disabled:opacity-50")}>
                <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0 bg-sunken text-ink2"><UserCheck size={17} aria-hidden="true" /></span>
                <span className="font-semibold text-[14.5px]">{p.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}
