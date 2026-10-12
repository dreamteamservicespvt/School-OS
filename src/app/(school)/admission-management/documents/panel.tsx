"use client";

// One applicant's papers, against the list for the class applied for
// (design: mod-admissions.jsx Documents, UploadSheet, RejectDocSheet).
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Camera, Check, Eye, FileCheck, FileClock, FileText, FileWarning, FileX, Send, Stamp, Upload, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/rows";
import { Switch } from "@/components/ui/controls";
import { FieldShell, inputCls, SelectField, TextField } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { ActionButton, FormSheet } from "../_components/forms";
import { originalSeenAction, rejectDocAction, remindAction, uploadDocAction, verifyDocAction } from "../applications/actions";

export type PanelDoc = {
  type: string; label: string; required: boolean; id: string | null; status: "NOT_RECEIVED" | "RECEIVED" | "VERIFIED" | "REJECTED";
  detail: string; fileHref: string | null; originalSeen: boolean; rejectReason: string | null;
};
export type PanelApp = {
  id: string; name: string; className: string; yearLabel: string; applicationNo: string; parent: string; phone: string;
  verified: number; required: number; docs: PanelDoc[]; missing: string[];
};

const TONE = { VERIFIED: "ok", RECEIVED: "info", NOT_RECEIVED: "warn", REJECTED: "bad" } as const;
const WORD = { VERIFIED: "Verified", RECEIVED: "Received", NOT_RECEIVED: "Not received", REJECTED: "Rejected" } as const;
const ICON = { VERIFIED: FileCheck, RECEIVED: FileClock, NOT_RECEIVED: FileWarning, REJECTED: FileX } as const;
const SOFT = { ok: "bg-ok/10 text-ok", info: "bg-info/10 text-info", warn: "bg-warn/12 text-warn", bad: "bg-bad/10 text-bad" } as const;
const REASONS = ["Photo not clear", "Wrong document", "Name does not match", "Page missing"];

export function DocumentsPanel({ a, closeHref, canWork }: { a: PanelApp; closeHref: string; canWork: boolean }) {
  const [up, setUp] = useState<string | null>(null);
  const [rej, setRej] = useState<PanelDoc | null>(null);
  const [remind, setRemind] = useState(false);
  const [reason, setReason] = useState("");
  const [tell, setTell] = useState(true);
  const [fileName, setFileName] = useState<string | null>(null);
  const required = a.docs.filter((d) => d.required);
  const optional = a.docs.filter((d) => !d.required);
  const done = a.required > 0 && a.verified >= a.required;

  const row = (d: PanelDoc) => {
    const tone = TONE[d.status];
    const Ic = ICON[d.status];
    return (
      <li key={d.type} className="px-5 py-3.5 flex items-start gap-3">
        <span className={cx("w-10 h-10 rounded-xl grid place-items-center shrink-0", SOFT[tone])}><Ic size={19} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-[14px] leading-snug">{d.label} <span className="text-[12px] text-ink3 font-normal">· {d.required ? "Required" : "Optional"}</span></p>
            <Pill tone={tone} className="!h-[22px] !text-[11.5px] shrink-0">{WORD[d.status]}</Pill>
          </div>
          <p className={cx("text-[12.5px] mt-0.5", d.status === "REJECTED" ? "text-bad" : "text-ink3")}>{d.detail}</p>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {d.fileHref && <a href={d.fileHref} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-semibold text-ink2 hover:bg-sunken"><Eye size={15} aria-hidden="true" />View</a>}
            {canWork && d.id && d.status === "RECEIVED" && <ActionButton action={verifyDocAction} hidden={{ docId: d.id }} variant="soft" icon={Check} busyLabel="Verifying…" className="inline-flex">Verify</ActionButton>}
            {canWork && d.id && d.status === "RECEIVED" && <Button size="sm" variant="ghost" icon={X} onClick={() => { setReason(""); setTell(true); setRej(d); }}>Reject</Button>}
            {canWork && (d.status === "NOT_RECEIVED" || d.status === "REJECTED") && <Button size="sm" variant="secondary" icon={Upload} onClick={() => { setFileName(null); setUp(d.type); }}>Upload</Button>}
            {canWork && d.id && d.status === "VERIFIED" && !d.originalSeen && <ActionButton action={originalSeenAction} hidden={{ docId: d.id }} variant="ghost" icon={Stamp} className="inline-flex">Original seen</ActionButton>}
          </div>
        </div>
      </li>
    );
  };

  return (
    <Card className="min-w-0 animate-rise">
      <div className="flex items-center justify-between px-3 pt-2.5">
        <Link href={closeHref} className="xl:invisible inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink h-8 px-1 rounded-lg"><ArrowLeft size={17} aria-hidden="true" />All applicants</Link>
        <Link href={closeHref} aria-label="Close" className="hidden xl:grid w-9 h-9 place-items-center rounded-xl text-ink2 hover:bg-sunken"><X size={18} aria-hidden="true" /></Link>
      </div>
      <div className="px-5 pb-4 flex items-center gap-3.5">
        <Avatar name={a.name} size={46} />
        <div className="min-w-0 flex-1">
          <h2 className="font-display font-semibold text-[19px] leading-tight"><Link href={`/admission-management/applications/${a.id}`} className="hover:underline">{a.name}</Link></h2>
          <p className="text-[13px] text-ink3">{a.className} · {a.yearLabel} · <span className="font-mono text-[12px]">{a.applicationNo}</span></p>
        </div>
      </div>
      <div className="px-5 pb-4">
        <div className="flex items-center justify-between text-[13px] mb-1.5"><span className="font-semibold">{a.verified} of {a.required} verified</span><span className="text-ink3">List for {a.className}</span></div>
        <Progress value={a.required ? (a.verified / a.required) * 100 : 100} tone={done ? "ok" : "warn"} />
      </div>
      {canWork && a.missing.length > 0 && (
        <div className="px-5 pb-4"><Button variant="soft" icon={Send} className="w-full" onClick={() => setRemind(true)}>Remind parent about {a.missing.length} {a.missing.length === 1 ? "paper" : "papers"}</Button></div>
      )}
      <ul className="border-t border-line/70 divide-y divide-line/70">{required.map(row)}</ul>
      {required.length === 0 && <p className="px-5 py-4 text-[13.5px] text-ink3 border-t border-line/70">No papers are required for this class.</p>}
      {optional.length > 0 && (
        <div className="border-t border-line/70">
          <p className="eyebrow text-ink3 px-5 pt-4">Optional papers</p>
          <ul className="divide-y divide-line/70">{optional.map(row)}</ul>
        </div>
      )}

      <FormSheet open={up !== null} onClose={() => setUp(null)} title="Upload document" sub={`${a.name} · ${a.className}`} action={uploadDocAction} hidden={{ id: a.id }} submitLabel="Upload" busyLabel="Uploading…" submitIcon={Upload}>
        {(f) => (
          <>
            <SelectField label="Document type" name="docType" required options={a.docs.filter((d) => d.status !== "VERIFIED").map((d) => ({ value: d.type, label: d.label }))} defaultValue={f.val("docType", up ?? undefined)} error={f.err("docType")} />
            <FieldShell label="File" id="up-file" required error={f.err("file")} help="PDF, JPG or PNG, up to 5 MB">
              <div className="grid grid-cols-2 gap-2">
                <label className={cx(inputCls(f.err("file")), "h-11 flex items-center justify-center gap-2 font-semibold cursor-pointer")}>
                  <Camera size={17} aria-hidden="true" />Take photo
                  <input type="file" name="file" accept="image/jpeg,image/png" capture="environment" className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
                </label>
                <label className={cx(inputCls(f.err("file")), "h-11 flex items-center justify-center gap-2 font-semibold cursor-pointer")}>
                  <Upload size={17} aria-hidden="true" />Choose file
                  <input id="up-file" type="file" name="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
                </label>
              </div>
              {fileName && <p className="flex items-center gap-2 text-[13.5px] font-semibold mt-1"><FileText size={16} className="text-ink3" aria-hidden="true" />{fileName}</p>}
            </FieldShell>
            <TextField label="Note" name="note" maxLength={300} placeholder="Optional" defaultValue={f.val("note")} />
          </>
        )}
      </FormSheet>

      <FormSheet open={rej !== null} onClose={() => setRej(null)} title={`Reject ${rej?.label ?? "paper"}`} sub={`${a.name}. A new copy will be needed.`} action={rejectDocAction} hidden={{ docId: rej?.id ?? "", tellParent: tell ? "on" : "" }} submitLabel="Reject paper" submitVariant="danger">
        {(f) => (
          <>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((x) => <button type="button" key={x} onClick={() => setReason(x)} className={cx("h-8 px-3 rounded-full text-[13px] font-medium transition", reason === x ? "bg-ink text-bg" : "bg-sunken hover:bg-line")}>{x}</button>)}
            </div>
            <FieldShell label="Reason" id="rj-r" required error={f.err("reason")}>
              <input id="rj-r" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className={cx(inputCls(f.err("reason")), "h-11")} />
            </FieldShell>
            <div className="flex items-center gap-3 text-[14px]"><Switch on={tell} onChange={setTell} label="Message the parent" /><span><b className="font-semibold">Message the parent</b><span className="block text-[12.5px] text-ink3">WhatsApp with the reason, SMS if WhatsApp is not set up</span></span></div>
          </>
        )}
      </FormSheet>

      <FormSheet open={remind} onClose={() => setRemind(false)} title={`Remind ${a.parent}`} sub={`To +91 ${a.phone}, by WhatsApp or SMS`} action={remindAction} hidden={{ id: a.id }} submitLabel={`Send to ${a.parent}`} submitIcon={Send}>
        {() => (
          <div className="rounded-xl bg-sunken p-3.5 text-[14px] leading-relaxed text-ink2">
            Dear {a.parent}, for {a.name}’s admission (application {a.applicationNo}) please bring: <b className="text-ink">{a.missing.join(", ")}</b>.
          </div>
        )}
      </FormSheet>
    </Card>
  );
}
