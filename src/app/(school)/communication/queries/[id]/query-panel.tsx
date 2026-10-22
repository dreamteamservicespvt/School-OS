"use client";

// Work on one query: reply, internal note, assign, pick up, priority, resolve, close (11-communication.md),
// in the approved design (design/ui-prototype/src/mod-communication.jsx QueryDetail).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Hand, Lock, RotateCcw, Send, Star, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/controls";
import { FieldShell, inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { assignAction, noteAction, pickUpAction, priorityAction, ratingAction, replyAction, statusAction } from "../actions";
import { Words } from "@/lib/i18n/client";

type Opt = { value: string; label: string };

function useRun() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<string | void>, after?: () => void) => start(async () => {
    setMsg(null);
    const m = await fn();
    if (m) setMsg(m);
    else { after?.(); router.refresh(); }
  });
  return { msg, pending, run };
}

/** Assign, pick up, resolve, close and reopen: the buttons at the top of a query. */
export function QueryHeadActions({ id, status, canPickUp, owners }: { id: string; status: string; canPickUp: boolean; owners: Opt[] }) {
  const { msg, pending, run } = useRun();
  const router = useRouter();
  const [assign, setAssign] = useState(false);
  const [resolve, setResolve] = useState(false);
  const [resolution, setResolution] = useState("");
  const open = status === "OPEN" || status === "IN_PROGRESS";
  return (
    <>
      {msg && <p role="alert" className="w-full text-[13px] text-bad">{msg}</p>}
      {canPickUp && <Button variant="secondary" icon={Hand} loading={pending} onClick={() => run(() => pickUpAction(id))}><Words k="Pick up" /></Button>}
      {open && <Button variant="secondary" icon={UserCheck} onClick={() => setAssign(true)}><Words k="Assign" /></Button>}
      {open && <Button icon={CircleCheck} onClick={() => setResolve(true)}><Words k="Resolve" /></Button>}
      {status === "RESOLVED" && (
        <ConfirmButton trigger="Close" title="Close this query?" confirmLabel="Close query"
          onConfirm={async () => { const m = await statusAction(id, "CLOSED", null); if (!m) router.refresh(); return m; }}>
          <Words k="The requester may be asked to rate how it was handled (1 to 5), if that is switched on in Message Settings." />
        </ConfirmButton>
      )}
      {(status === "RESOLVED" || status === "CLOSED") && <Button variant="ghost" icon={RotateCcw} loading={pending} onClick={() => run(() => statusAction(id, "OPEN", null))}><Words k="Reopen" /></Button>}

      <Dialog open={assign} onClose={() => setAssign(false)} title="Assign to" sub="A person, or a department where anyone can pick it up">
        <ul className="flex flex-col">
          {owners.map((o) => (
            <li key={o.value}>
              <button type="button" disabled={pending} onClick={() => run(() => assignAction(id, o.value, o.label.replace(/^Department: /, "")), () => setAssign(false))}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-sunken/70 disabled:opacity-50">
                <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-sunken text-ink2"><UserCheck size={19} aria-hidden="true" /></span>
                <span className="font-semibold text-[14.5px]">{o.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
      <Dialog open={resolve} onClose={() => setResolve(false)} title="Resolve this query" sub="The resolution is kept on the ticket and sent to the requester."
        footer={<>
          <Button variant="secondary" onClick={() => setResolve(false)}><Words k="Cancel" /></Button>
          <Button loading={pending} loadingText="Saving" disabled={resolution.trim().length < 5} onClick={() => run(() => statusAction(id, "RESOLVED", resolution), () => setResolve(false))}><Words k="Resolve" /></Button>
        </>}>
        <FieldShell label="Resolution notes" id="q-resolution" required error={resolution && resolution.trim().length < 5 ? "Say what was done, in a sentence" : undefined}>
          <textarea id="q-resolution" rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} maxLength={2000} className={cx(inputCls(), "py-2.5")}
            placeholder="For example: Late fee of ₹250 removed; the payment of 12 July was recorded late." />
        </FieldShell>
      </Dialog>
    </>
  );
}

/** The reply box under the conversation: a reply to the requester, or an internal note only staff see. */
export function QueryComposer({ id, fromName, replyChannels }: { id: string; fromName: string; replyChannels: Opt[] }) {
  const { msg, pending, run } = useRun();
  const [mode, setMode] = useState<"reply" | "note">(replyChannels.length ? "reply" : "note");
  const [text, setText] = useState("");
  const [channel, setChannel] = useState(replyChannels[0]?.value ?? "app");
  const first = fromName.split(" ")[0];
  return (
    <div className="p-5 flex flex-col gap-2.5 border-t border-line">
      <Segmented size="sm" label="Write" value={mode} onChange={(v) => setMode(v as "reply" | "note")} className="self-start"
        options={[{ value: "reply", label: `Reply to ${first}` }, { value: "note", label: "Internal note", icon: Lock }]} />
      <label htmlFor="q-text" className="sr-only">{mode === "reply" ? "Reply" : "Internal note"}</label>
      <textarea id="q-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={mode === "reply" ? 900 : 2000}
        placeholder={mode === "reply" ? `Goes to ${fromName} with the ticket number` : "Only staff can see this"}
        className={cx(inputCls(), "py-2.5", mode === "note" && "bg-warn/5")} />
      {msg && <p role="alert" className="text-[13px] text-bad">{msg}</p>}
      {mode === "reply" && !replyChannels.length && <p className="text-[12.5px] text-ink3"><Words k="No channel is switched on for this person. Call them, then add an internal note." /></p>}
      <div className="flex items-center gap-2 justify-end flex-wrap">
        {mode === "reply" && replyChannels.length > 1 && (
          <select aria-label="Send by" value={channel} onChange={(e) => setChannel(e.target.value)} className={cx(inputCls(), "h-10 !w-auto pr-9")}>
            {replyChannels.map((c) => <option key={c.value} value={c.value}>By {c.label}</option>)}
          </select>
        )}
        <Button variant={mode === "reply" ? "primary" : "secondary"} icon={mode === "reply" ? Send : Lock} loading={pending} loadingText={mode === "reply" ? "Sending" : "Saving"}
          disabled={text.trim().length < 2 || (mode === "reply" && !replyChannels.length)}
          onClick={() => run(() => (mode === "reply" ? replyAction(id, text, channel) : noteAction(id, text)), () => setText(""))}>
          {mode === "reply" ? "Send reply" : "Add note"}
        </Button>
      </div>
    </div>
  );
}

/** Priority while open, and the requester's rating once resolved. */
export function QuerySide({ id, status, priority, priorities, rating }: { id: string; status: string; priority: string; priorities: Opt[]; rating: number | null }) {
  const { msg, pending, run } = useRun();
  const open = status === "OPEN" || status === "IN_PROGRESS";
  return (
    <div className="px-5 pb-5 flex flex-col gap-3">
      {open && (
        <FieldShell label="Priority" id="q-priority">
          <select id="q-priority" value={priority} disabled={pending} onChange={(e) => run(() => priorityAction(id, e.target.value))} className={cx(inputCls(), "h-11 pr-9")}>
            {priorities.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </FieldShell>
      )}
      {!open && (
        <div>
          <p className="text-[13px] font-semibold text-ink2 mb-1.5"><Words k="Rating from the requester" />{rating ? `: ${rating} of 5` : ""}</p>
          <div className="flex gap-1">{[1, 2, 3, 4, 5].map((r) => (
            <button key={r} type="button" aria-label={`Record rating ${r} of 5`} aria-pressed={rating === r} disabled={pending} onClick={() => run(() => ratingAction(id, r))}
              className={cx("grid size-10 place-items-center rounded-xl border transition", rating !== null && r <= rating ? "border-warn/40 bg-warn/10 text-warn" : "border-line text-ink3 hover:bg-sunken")}>
              <Star size={17} className={rating !== null && r <= rating ? "fill-current" : ""} aria-hidden="true" />
            </button>
          ))}</div>
        </div>
      )}
      {msg && <p role="alert" className="text-[13px] text-bad">{msg}</p>}
    </div>
  );
}
