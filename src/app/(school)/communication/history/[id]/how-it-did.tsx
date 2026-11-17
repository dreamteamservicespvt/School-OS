// "How did this message do": delivered, read and failed rings, and one bar per channel used
// (research 2026-11-15, Inkwelly section 3 row 9). Real counts from messageSummary(); a channel
// with no delivery reports says so instead of showing 0% read.
import { ChartColumn } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Ring } from "@/components/ui/display";
import { CHANNEL_LABEL, type Channel } from "@/lib/messaging/channels";
import { share, type ChannelSummary, type MessageSummary } from "@/lib/communication/summary";
import { Any, Words } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/t";

const num = (n: number) => n.toLocaleString("en-IN");

type RingItem = { label: MessageKey; n: number; tone: "ok" | "info" | "bad"; known: boolean; none?: MessageKey };

function RingCell({ item, total, going }: { item: RingItem; total: number; going: boolean }) {
  const pct = share(item.n, total);
  return (
    <li className="flex min-w-0 flex-col items-center text-center">
      <Ring value={item.known ? pct ?? 0 : 0} size={72} stroke={8} tone={item.tone} track="sunken">
        <span className="text-[15px] font-bold tnum">{!item.known ? "–" : going ? num(item.n) : `${pct ?? 0}%`}</span>
      </Ring>
      <p className="mt-2 text-[13px] font-semibold leading-tight"><Words k={item.label} /></p>
      <p className="mt-0.5 text-[12px] leading-snug text-ink3 tnum">
        {item.known ? <Words k="{n} of {total}" vars={{ n: num(item.n), total: num(total) }} /> : <Words k={item.none ?? "No read reports"} />}
      </p>
    </li>
  );
}

type Segment = { key: string; n: number; label: MessageKey; bg: string };

function segments(c: ChannelSummary): Segment[] {
  const all: Segment[] = [
    ...(c.readReports ? [{ key: "read", n: c.read, label: "Read" as const, bg: "bg-ok" }] : []),
    { key: "delivered", n: c.readReports ? c.delivered - c.read : c.delivered, label: c.readReports ? "Delivered, not read yet" : "Delivered", bg: "bg-info" },
    { key: "sent", n: c.sent, label: c.reports ? "Sent, no report" : "Sent", bg: "bg-ink3/50" },
    { key: "test", n: c.testMode, label: "Test mode", bg: "bg-warn" },
    { key: "going", n: c.going, label: "Sending", bg: "bg-line" },
    { key: "failed", n: c.failed, label: "Failed", bg: "bg-bad" },
  ];
  return all.filter((s) => s.n > 0);
}

function ChannelRow({ c }: { c: ChannelSummary }) {
  const parts = segments(c);
  return (
    <li className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13.5px] font-semibold"><Any text={CHANNEL_LABEL[c.channel as Channel] ?? c.channel} /></span>
        <span className="shrink-0 text-[12.5px] text-ink3 tnum"><Words k={c.total === 1 ? "{n} person" : "{n} people"} vars={{ n: num(c.total) }} /></span>
      </div>
      <div className="mt-1.5 flex h-2.5 w-full overflow-hidden rounded-full bg-sunken" aria-hidden="true">
        {parts.map((s) => <span key={s.key} className={`h-full ${s.bg}`} style={{ width: `${(s.n / c.total) * 100}%` }} />)}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-ink2">
        {parts.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <span className={`size-2 shrink-0 rounded-full ${s.bg}`} aria-hidden="true" />
            <span><Words k={s.label} /> <span className="font-semibold tnum">{num(s.n)}</span></span>
          </li>
        ))}
      </ul>
      {!c.reports && c.sent > 0 && <p className="mt-1 text-[12.5px] text-ink3"><Words k={c.channel === "whatsapp" ? "Delivery reports are not connected" : "No delivery report came back"} /></p>}
      {c.reports && !c.readReports && c.delivered > 0 && <p className="mt-1 text-[12.5px] text-ink3"><Words k="Read is not reported for this channel" /></p>}
    </li>
  );
}

export function HowItDid({ s, campusOnly, resend }: { s: MessageSummary; campusOnly: boolean; resend?: React.ReactNode }) {
  // No channel sent a delivery report: one honest "Sent" ring, never "Delivered 0%" (as the Stats do, L6-41).
  const rings: RingItem[] = [
    s.reports ? { label: "Delivered", n: s.delivered, tone: "ok", known: true } : { label: "Sent", n: s.sent, tone: "info", known: true },
    { label: "Read", n: s.read, tone: "ok", known: s.readReports },
    { label: "Failed", n: s.failed, tone: "bad", known: true },
  ];
  return (
    <Card>
      <CardHeader title="How did this message do" icon={ChartColumn} description={campusOnly ? "People of your campus only" : undefined} />
      <div className="flex flex-col gap-4 px-5 pb-5">
        {s.stillGoing && (
          <p role="status" className="rounded-xl bg-warn-bg px-3 py-2 text-[13px] text-ink2">
            <span className="font-semibold text-ink"><Words k="Still sending: {n} left" vars={{ n: num(s.going) }} /></span>{" "}
            <Words k="So far: the numbers change until everyone has been sent it." />
          </p>
        )}
        <ul className="grid grid-cols-3 gap-2 sm:gap-4">
          {rings.map((r) => <RingCell key={r.label} item={r} total={s.total} going={s.stillGoing} />)}
        </ul>
        {(s.reports && s.sent > 0) || s.backup > 0 ? (
          <p className="text-[12.5px] text-ink3">
            {s.reports && s.sent > 0 && <Words k="{n} more sent with no delivery report" vars={{ n: num(s.sent) }} />}
            {s.reports && s.sent > 0 && s.backup > 0 && " · "}
            {s.backup > 0 && <Words k="{n} also sent by SMS backup" vars={{ n: num(s.backup) }} />}
          </p>
        ) : null}
        {resend && <div className="flex flex-wrap gap-2">{resend}</div>}
        {s.channels.length > 0 && (
          <div className="border-t border-line pt-4">
            <h3 className="mb-2.5 text-[13px] font-semibold text-ink2"><Words k="By channel" /></h3>
            <ul className="flex flex-col gap-3.5">
              {s.channels.map((c) => <ChannelRow key={c.channel} c={c} />)}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
