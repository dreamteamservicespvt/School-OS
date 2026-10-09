"use client";

// Work on one query: reply, internal note, assign, pick up, priority, resolve, close.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { assignAction, noteAction, pickUpAction, priorityAction, ratingAction, replyAction, statusAction } from "../actions";

type Opt = { value: string; label: string };

export function QueryPanel({ id, status, canPickUp, replyChannels, owners, priority, priorities, rating }: {
  id: string; status: string; canPickUp: boolean; replyChannels: Opt[]; owners: Opt[]; priority: string; priorities: Opt[]; rating: number | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const [channel, setChannel] = useState(replyChannels[0]?.value ?? "app");
  const [owner, setOwner] = useState("");
  const [resolution, setResolution] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const open = status === "OPEN" || status === "IN_PROGRESS";

  const go = (fn: () => Promise<string | void>, clear = false) => start(async () => {
    setMsg(null);
    const m = await fn();
    if (m) setMsg(m);
    else { if (clear) setText(""); router.refresh(); }
  });

  return (
    <div className="space-y-4">
      {msg && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{msg}</p>}
      {status !== "CLOSED" && (
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
          <div role="tablist" className="mb-3 flex gap-1">
            {(["reply", "note"] as const).map((t) => (
              <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`min-h-11 rounded-lg px-4 ${tab === t ? (t === "note" ? "bg-warn-bg font-medium text-warn-text" : "bg-brand-soft font-medium text-brand-text") : "text-ink-2 hover:bg-surface-2"}`}>
                {t === "reply" ? "Reply to requester" : "🔒 Internal note"}
              </button>
            ))}
          </div>
          <label htmlFor="q-text" className="sr-only">{tab === "reply" ? "Reply" : "Internal note"}</label>
          <textarea id="q-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={tab === "reply" ? 900 : 2000}
            placeholder={tab === "reply" ? "Your reply. It is sent with the ticket number." : "Only staff see this. It never leaves the school."}
            className={`w-full rounded-lg border px-3 py-2 ${tab === "note" ? "border-warn/50 bg-warn-bg/40" : "border-line-strong bg-surface"}`} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {tab === "reply" && replyChannels.length > 0 && (
              <label className="flex items-center gap-2 text-sm">Send by
                <select value={channel} onChange={(e) => setChannel(e.target.value)} className="h-11 rounded-lg border border-line-strong bg-surface px-3">
                  {replyChannels.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </label>
            )}
            <Button loading={pending} loadingText={tab === "reply" ? "Sending" : "Saving"} disabled={text.trim().length < 2 || (tab === "reply" && !replyChannels.length)}
              onClick={() => go(() => (tab === "reply" ? replyAction(id, text, channel) : noteAction(id, text)), true)}>
              {tab === "reply" ? "Send reply" : "Add note"}
            </Button>
            {tab === "reply" && !replyChannels.length && <p className="text-sm text-ink-2">No channel is switched on for this person. Call them, then add an internal note.</p>}
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
        {canPickUp && <Button className="w-full" onClick={() => go(() => pickUpAction(id))} loading={pending}>Pick up (make it mine)</Button>}
        {open && (
          <div>
            <label htmlFor="q-assign" className="mb-1 block text-sm font-medium">Assign to</label>
            <div className="flex gap-2">
              <select id="q-assign" value={owner} onChange={(e) => setOwner(e.target.value)} className="h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3">
                <option value="">Choose…</option>
                {owners.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <Button variant="secondary" disabled={!owner || pending} onClick={() => go(() => assignAction(id, owner, owners.find((o) => o.value === owner)!.label.replace(/^Department: /, "")))}>Assign</Button>
            </div>
          </div>
        )}
        {open && (
          <div>
            <label htmlFor="q-priority" className="mb-1 block text-sm font-medium">Priority</label>
            <select id="q-priority" value={priority} onChange={(e) => go(() => priorityAction(id, e.target.value))} className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3">
              {priorities.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        )}
        {open && (
          <div>
            <label htmlFor="q-resolution" className="mb-1 block text-sm font-medium">Resolution notes</label>
            <textarea id="q-resolution" rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} maxLength={2000} className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2" placeholder="What was done" />
            <Button className="mt-2 w-full" disabled={resolution.trim().length < 5 || pending} onClick={() => go(() => statusAction(id, "RESOLVED", resolution))}>Resolve</Button>
          </div>
        )}
        {status === "RESOLVED" && (
          <ConfirmButton trigger="Close query" triggerClassName="w-full" title="Close this query?" confirmLabel="Close query"
            onConfirm={async () => { const m = await statusAction(id, "CLOSED", null); if (!m) router.refresh(); return m; }}>
            The requester may be asked to rate how it was handled (1 to 5), if that is switched on in Message Settings.
          </ConfirmButton>
        )}
        {(status === "RESOLVED" || status === "CLOSED") && (
          <>
            <Button variant="secondary" className="w-full" onClick={() => go(() => statusAction(id, "OPEN", null))} loading={pending}>Reopen</Button>
            <div>
              <p className="mb-1 text-sm font-medium">Rating from the requester{rating ? `: ${rating} of 5` : ""}</p>
              <div className="flex gap-1">{[1, 2, 3, 4, 5].map((r) => (
                <button key={r} type="button" aria-label={`Record rating ${r} of 5`} onClick={() => go(() => ratingAction(id, r))}
                  className={`grid size-11 place-items-center rounded-lg border ${rating === r ? "border-brand bg-brand-soft font-semibold text-brand-text" : "border-line-strong hover:bg-surface-2"}`}>{r}</button>
              ))}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
