// "Check a pass" at the gate (16 §2, mod-frontoffice.jsx ScanSheet and
// ScanResult): a visitor pass or a pickup gate pass, scanned or typed, shows
// whether it is valid, with "Record exit" or "Let them out" for the gate.
import { ShieldCheck, ShieldX } from "lucide-react";
import type { checkPass } from "@/lib/front-office/visitors";
import { clockAt, dayMonth } from "@/lib/front-office/time";
import { fileLink } from "@/lib/files";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { UrlSheet } from "@/components/ui/url-sheet";
import { cx } from "@/components/ui/cx";
import { PassCheckForm } from "./visitor-sheets";
import { ActButton } from "./fields";
import { checkOutAction, letOutAction } from "../actions";

type CheckRes = Awaited<ReturnType<typeof checkPass>> | null;

/** "Check a pass" at the gate (16 §2 Visitors, mod-frontoffice.jsx ScanSheet and ScanResult). */
export function CheckSheet({ close, code, res, tz, gateWork, today, schoolId, title }: { title?: string; close: string; code: string; res: CheckRes; tz: string; gateWork: boolean; today: Date; schoolId: string }) {
  return (
    <UrlSheet title={title ?? "Check a pass"} sub="Scan the QR on paper or on the visitor’s phone, or type the pass number." closeHref={close}>
      <div className="flex flex-col gap-4 pb-1">
        <PassCheckForm base={close} code={code} />
        {code && res && <CheckResult res={res} tz={tz} gateWork={gateWork} today={today} schoolId={schoolId} />}
      </div>
    </UrlSheet>
  );
}

function CheckResult({ res, tz, gateWork, today, schoolId }: { res: NonNullable<CheckRes>; tz: string; gateWork: boolean; today: Date; schoolId: string }) {
  const photo = (id: string | null) => (id ? fileLink(id, schoolId) : null);
  if (res.kind === "none") {
    return (
      <div className="rounded-2xl bg-bad/10 p-4 flex gap-3 animate-rise" role="alert">
        <ShieldX size={22} className="text-bad shrink-0" aria-hidden="true" />
        <div><p className="font-semibold text-bad">No pass with number {res.code || "this"}</p><p className="text-[13.5px] text-ink2">Do not let them in. Send them to the reception desk to register.</p></div>
      </div>
    );
  }
  if (res.kind === "visitor") {
    const exp = res.status === "Expired";
    const out = res.status === "Out";
    const dayWords = res.visitDate.getTime() === today.getTime() ? "today" : dayMonth(res.visitDate);
    return (
      <div className={cx("rounded-2xl p-4 flex flex-col gap-3 animate-rise", exp || out ? "bg-bad/10" : "bg-ok/10")} role="status">
        <div className="flex items-center gap-3">
          <Avatar name={res.name} size={52} src={photo(res.photoFileId)} />
          <div className="min-w-0 flex-1"><p className="font-semibold text-[15.5px]">{res.name}</p><p className="text-[13px] text-ink2">{res.purpose}{res.meet ? ` · to meet ${res.meet}` : ""}</p></div>
          {exp ? <Pill tone="bad">Expired</Pill> : out ? <Pill tone="bad">Already out</Pill> : <Pill tone="ok" dot>Valid</Pill>}
        </div>
        <p className={cx("text-[14px] font-semibold flex items-center gap-2", exp || out ? "text-bad" : "text-ok")}>
          {exp ? <><ShieldX size={17} aria-hidden="true" />Pass {res.passNo} expired at {clockAt(res.expiresAt, tz)} on {dayWords}. Register the visitor again.</>
            : out ? <><ShieldX size={17} aria-hidden="true" />Checked out at {clockAt(res.timeOut!, tz)}{dayWords === "today" ? "" : ` on ${dayWords}`}. This pass no longer works.</>
              : <><ShieldCheck size={17} aria-hidden="true" />Valid until {clockAt(res.expiresAt, tz)} today.</>}
        </p>
        {!exp && !out && gateWork && <ActButton action={checkOutAction} fields={{ visitorId: res.id }} label="Record exit" icon="logout" variant="secondary" size="md" className="w-full" pendingText="Recording…" />}
      </div>
    );
  }
  const left = res.status === "LEFT";
  return (
    <div className={cx("rounded-2xl p-4 flex flex-col gap-3 animate-rise", left ? "bg-bad/10" : "bg-ok/10")} role="status">
      <p className="eyebrow text-ink3">Gate pass · Pickup · {res.passNo}</p>
      <div className="grid grid-cols-2 gap-3">
        {([[res.student, `${res.section ?? ""} · student`.replace(/^ · /, ""), res.studentPhotoFileId], [res.collector, `${res.relation ?? "Guardian"} · on the pickup list`, res.guardianPhotoFileId]] as const).map(([n, s, ph]) => (
          <div key={`${n}-${s}`} className="flex items-center gap-2.5 min-w-0"><Avatar name={n} size={44} src={photo(ph)} /><div className="min-w-0"><p className="font-semibold text-[14px] truncate">{n}</p><p className="text-[12px] text-ink3 truncate">{s}</p></div></div>
        ))}
      </div>
      <p className={cx("text-[14px] font-semibold flex items-center gap-2", left ? "text-bad" : "text-ok")}>
        {left ? <><ShieldX size={17} aria-hidden="true" />Already used at {res.leftAt ? clockAt(res.leftAt, tz) : "an earlier time"}.</>
          : <><ShieldCheck size={17} aria-hidden="true" />Released at {clockAt(res.timeOut, tz)}{res.issuedBy ? ` by ${res.issuedBy}` : ""}. Match both faces with the photos.</>}
      </p>
      {!left && gateWork && <ActButton action={letOutAction} fields={{ gatePassId: res.id }} label="Let them out" icon="door" variant="primary" size="md" className="w-full" pendingText="Recording…" />}
    </div>
  );
}
