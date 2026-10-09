"use client";

// Attendance kept on this phone while offline, sent as soon as the phone is
// online (08 §10). Also registers the offline helper (public/sw.js) when the
// school has offline attendance on, and removes it when it is off.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { saveSheet } from "../actions";
import { isNetworkError, QUEUE_EVENT, readQueue, writeQueue, type QueuedSave } from "./offline-queue";

const SCOPE = "/attendance-management";

function useOnline() {
  return useSyncExternalStore(
    (cb) => { window.addEventListener("online", cb); window.addEventListener("offline", cb); return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); }; },
    () => navigator.onLine,
    () => true,
  );
}

function useQueue(userId: string) {
  const cache = useRef<{ raw: string; list: QueuedSave[] }>({ raw: "", list: [] });
  return useSyncExternalStore(
    (cb) => { window.addEventListener(QUEUE_EVENT, cb); window.addEventListener("storage", cb); return () => { window.removeEventListener(QUEUE_EVENT, cb); window.removeEventListener("storage", cb); }; },
    () => {
      const list = readQueue(userId);
      const raw = JSON.stringify(list);
      if (raw !== cache.current.raw) cache.current = { raw, list };
      return cache.current.list;
    },
    () => cache.current.list,
  );
}

export function OfflinePanel({ userId, offlineOn }: { userId: string; offlineOn: boolean }) {
  const router = useRouter();
  const online = useOnline();
  const queue = useQueue(userId);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const busy = useRef(false);

  // The offline helper: on for schools that use offline attendance, removed otherwise.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (offlineOn) {
      navigator.serviceWorker.register("/sw.js", { scope: SCOPE }).catch(() => undefined);
    } else {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const r of regs) {
          if (new URL(r.scope).pathname.startsWith(SCOPE)) {
            r.active?.postMessage({ type: "sos-clear" });
            r.unregister().catch(() => undefined);
          }
        }
      }).catch(() => undefined);
    }
  }, [offlineOn]);

  const flush = useCallback(async () => {
    if (busy.current || !navigator.onLine) return;
    const waiting = readQueue(userId).filter((q) => !q.problem);
    if (waiting.length === 0) return;
    busy.current = true;
    setSending(true);
    let sent = 0;
    const messages: string[] = [];
    try {
      for (const item of waiting) {
        let r;
        try {
          r = await saveSheet({ sectionId: item.sectionId, date: item.date, periodNo: item.periodNo, entries: item.entries, clientId: item.clientId, offline: { takenAt: item.takenAt, clientNow: new Date().toISOString() } });
        } catch (e) {
          if (isNetworkError(e)) break;
          continue;
        }
        const rest = readQueue(userId);
        if (r.ok) {
          writeQueue(userId, rest.filter((q) => q.clientId !== item.clientId));
          sent += 1;
          if (r.outcome === "correction") messages.push(`${item.sectionName}, ${item.dateText}: ${r.message}`);
        } else if (r.final) {
          writeQueue(userId, rest.map((q) => (q.clientId === item.clientId ? { ...q, problem: r.message, link: r.link ?? null } : q)));
        }
      }
    } finally {
      busy.current = false;
      setSending(false);
    }
    if (sent > 0) {
      setNote([`${sent} attendance ${sent === 1 ? "save" : "saves"} sent from this phone.`, ...messages].join(" "));
      router.refresh();
    }
  }, [router, userId]);

  // Send when the phone comes online, when the page opens, and every half a minute while something waits.
  useEffect(() => {
    const t0 = setTimeout(() => { void flush(); }, 0);
    const onOnline = () => { void flush(); };
    window.addEventListener("online", onOnline);
    const timer = setInterval(() => { if (readQueue(userId).some((q) => !q.problem)) void flush(); }, 30_000);
    return () => { clearTimeout(t0); window.removeEventListener("online", onOnline); clearInterval(timer); };
  }, [flush, userId]);

  const waiting = queue.filter((q) => !q.problem);
  const stuck = queue.filter((q) => q.problem);
  if (queue.length === 0 && !note && online) return null;

  return (
    <div className="mb-4 space-y-2">
      {!online && (
        <div role="status" className="rounded-xl border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn-text">
          <p className="font-semibold">You are offline.</p>
          <p>{offlineOn ? "You can still take attendance. It is saved on this phone and sent when you are online." : "Attendance cannot be saved until you are online. Your marks stay on the screen."}</p>
        </div>
      )}
      {note && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-success/30 bg-success-soft px-4 py-3 text-sm text-success">
          <p>{note}</p>
          <button type="button" onClick={() => setNote(null)} className="min-h-11 shrink-0 px-2 font-medium underline">Close</button>
        </div>
      )}
      {waiting.length > 0 && (
        <section aria-label="Waiting on this phone" className="rounded-xl border border-line bg-info-soft px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">Saved on this phone, will send when online</p>
            <Button size="sm" variant="secondary" onClick={() => void flush()} disabled={!online || sending} loading={sending} loadingText="Sending…">Send now</Button>
          </div>
          <ul className="mt-2 space-y-1">
            {waiting.map((q) => (
              <li key={q.clientId}>{q.sectionName}{q.periodLabel ? ` (${q.periodLabel})` : ""}, {q.dateText}: {q.summary}</li>
            ))}
          </ul>
        </section>
      )}
      {stuck.map((q) => (
        <section key={q.clientId} aria-label="Could not be saved" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          <p className="font-semibold">{q.sectionName}{q.periodLabel ? ` (${q.periodLabel})` : ""}, {q.dateText} was not saved</p>
          <p className="mt-0.5">{q.problem}</p>
          <p className="mt-0.5 text-ink-2">On this phone: {q.summary}.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {q.link && <Link href={q.link.href} className="min-h-11 content-center font-medium underline">{q.link.label}</Link>}
            <ConfirmButton trigger="Remove from this phone" triggerVariant="danger-outline" title="Remove this attendance from the phone?" confirmLabel="Remove" confirmVariant="danger"
              onConfirm={async () => { writeQueue(userId, readQueue(userId).filter((x) => x.clientId !== q.clientId)); }}>
              The marks for {q.sectionName} on {q.dateText} were never saved at school. After removing them, take the attendance again or request a correction.
            </ConfirmButton>
          </div>
        </section>
      ))}
    </div>
  );
}
