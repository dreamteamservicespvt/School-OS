"use client";

// The online application link for parents (02 §2 "Online application"):
// share it by WhatsApp, the phone's share list, or copy it (design: OnlineLinkSheet).
import { useState } from "react";
import { IndianRupee, Link as LinkIcon, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FieldShell, inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { Words } from "@/lib/i18n/client";
import { ShareMenu } from "@/components/ui/share-menu";

export function OnlineLinkButton({ code, classes, schoolName, feeOn, yearName }: { code: string; classes: { value: string; label: string }[]; schoolName: string; feeOn: boolean; yearName: string }) {
  const [open, setOpen] = useState(false);
  const [cls, setCls] = useState("");
  // Only read in the open dialog, which never renders on the server.
  const origin = open && typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/apply/${encodeURIComponent(code)}${cls ? `?class=${cls}` : ""}`;
  const text = `${schoolName}: apply for admission ${yearName} online here: ${url}`;
  return (
    <>
      <Button variant="secondary" icon={LinkIcon} onClick={() => setOpen(true)}><Words k="Online application" /></Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Online application" sub="Parents fill the form on their phone, without a login. It arrives here as “Submitted online”.">
        <div className="flex flex-col gap-4">
          <FieldShell label="Link for" id="ol-cls">
            <select id="ol-cls" value={cls} onChange={(e) => setCls(e.target.value)} className={cx(inputCls(false), "h-11 pr-9")}>
              <option value="">All classes</option>
              {classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </FieldShell>
          <div className="flex items-center gap-2 rounded-xl bg-sunken pl-3.5 pr-1.5 py-1.5">
            <LinkIcon size={16} className="text-ink3 shrink-0" aria-hidden="true" />
            <span className="font-mono text-[12.5px] truncate flex-1 select-all">{url}</span>
          </div>
          <ShareMenu text={text} copyText={url} title={`Admission ${yearName}, ${schoolName}`} size="md" />
          <ul className="text-[13px] text-ink3 flex flex-col gap-1.5">
            <li className="flex gap-2"><ShieldCheck size={15} className="shrink-0 mt-0.5" aria-hidden="true" /><Words k="Consent is confirmed with a one-time code to the parent’s phone." /></li>
            {feeOn && <li className="flex gap-2"><IndianRupee size={15} className="shrink-0 mt-0.5" aria-hidden="true" /><Words k="The application fee is paid by Razorpay at the end of the form." /></li>}
          </ul>
        </div>
      </Dialog>
    </>
  );
}
