"use client";

// Bulk actions on ticked enquiries (design: Enquiries BulkBar): Run campaign
// (02 §2, optional, sent through Communication) and Assign owner.

import { useState } from "react";
import { Megaphone, Send, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BulkBar, useSelection } from "@/app/(school)/admission-management/_components/data-list";
import { SelectField, TextArea, TextField, type Option } from "@/components/ui/field";
import { FormSheet, SegField } from "../_components/forms";
import { bulkAssignAction, campaignAction } from "./actions";

export function EnquiryBulk({ owners, campaigns, schoolName }: { owners: Option[]; campaigns: boolean; schoolName: string }) {
  const { ids, set } = useSelection();
  const [sheet, setSheet] = useState<"campaign" | "assign" | null>(null);
  const [text, setText] = useState("");
  const n = ids.size;
  const idInputs = [...ids].map((id) => <input key={id} type="hidden" name="ids" value={id} />);
  const preview = text.replace(/\{parent\}/g, "Sunita Rao").replace(/\{child\}/g, "Arjun");
  return (
    <>
      <BulkBar>
        {campaigns && <Button size="sm" variant="secondary" icon={Megaphone} onClick={() => setSheet("campaign")}>Run campaign</Button>}
        <Button size="sm" variant="secondary" icon={UserCog} onClick={() => setSheet("assign")}>Assign owner</Button>
      </BulkBar>
      <FormSheet open={sheet === "campaign"} onClose={() => setSheet(null)} title={`Run campaign for ${n} ${n === 1 ? "enquiry" : "enquiries"}`} sub="Sent through Communication. Each enquiry then shows the campaign name."
        action={campaignAction} submitLabel={`Send to ${n} ${n === 1 ? "family" : "families"}`} busyLabel="Sending…" submitIcon={Send} onSaved={() => { set(new Set()); setText(""); }}>
        {(f) => <>
          {idInputs}
          <TextField label="Campaign" name="name" required maxLength={80} placeholder="Open House on Saturday" defaultValue={f.val("name")} error={f.err("name")} help="Shown on each enquiry it reaches." />
          <SegField name="channel" label="Send by" options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "sms", label: "SMS" }, { value: "email", label: "Email" }]} defaultValue={f.val("channel", "whatsapp")!} />
          <TextArea label="Message" name="message" required rows={4} maxLength={1000} defaultValue={f.val("message")} error={f.err("message")} onChange={(e) => setText(e.target.value)}
            help={`Use {parent} and {child} for names. Sent from ${schoolName}; it cannot be unsent.`} />
          {preview && <div className="rounded-xl bg-sunken p-3.5 text-[14px] leading-relaxed text-ink2 whitespace-pre-wrap">{preview}</div>}
          <p className="text-[13px] text-ink3 tnum">{n} {n === 1 ? "message" : "messages"} · closed enquiries are skipped</p>
        </>}
      </FormSheet>
      <FormSheet open={sheet === "assign"} onClose={() => setSheet(null)} title={`Assign ${n} ${n === 1 ? "enquiry" : "enquiries"}`} sub="The history keeps the old and new owner." action={bulkAssignAction} submitLabel="Assign owner" onSaved={() => set(new Set())}>
        {(f) => <>
          {idInputs}
          <SelectField label="New owner" name="ownerStaffId" required options={owners} placeholder="Choose" defaultValue={f.val("ownerStaffId")} error={f.err("ownerStaffId")} />
          <TextField label="Reason" name="reason" required maxLength={300} placeholder="For example: Divya on leave this week" defaultValue={f.val("reason")} error={f.err("reason")} />
        </>}
      </FormSheet>
    </>
  );
}
