"use client";

// The online application link for parents (02 §2 "Online application"):
// copy it, or share it by WhatsApp, SMS or email (design: OnlineLinkSheet).
import { useEffect, useState } from "react";
import { Copy, IndianRupee, Link as LinkIcon, Mail, MessageCircle, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FieldShell, inputCls } from "@/components/ui/field";
import { useNotice } from "@/components/ui/notice";
import { cx } from "@/components/ui/cx";

export function OnlineLinkButton({ code, classes, schoolName, feeOn, yearName }: { code: string; classes: { value: string; label: string }[]; schoolName: string; feeOn: boolean; yearName: string }) {
  const [open, setOpen] = useState(false);
  const [cls, setCls] = useState("");
  const [origin, setOrigin] = useState("");
  const notice = useNotice();
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}/apply/${encodeURIComponent(code)}${cls ? `?class=${cls}` : ""}`;
  const text = `${schoolName}: apply for admission ${yearName} online here: ${url}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      notice.show({ title: "Link copied", body: url });
    } catch {
      notice.show({ title: "Could not copy", body: "Select the link and copy it by hand.", tone: "bad" });
    }
  };
  const share = [
    { label: "WhatsApp", Icon: MessageCircle, href: `https://wa.me/?text=${encodeURIComponent(text)}` },
    { label: "SMS", Icon: Smartphone, href: `sms:?&body=${encodeURIComponent(text)}` },
    { label: "Email", Icon: Mail, href: `mailto:?subject=${encodeURIComponent(`Admission ${yearName}, ${schoolName}`)}&body=${encodeURIComponent(text)}` },
  ];
  return (
    <>
      <Button variant="secondary" icon={LinkIcon} onClick={() => setOpen(true)}>Online application</Button>
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
            <Button size="sm" variant="secondary" icon={Copy} onClick={copy}>Copy</Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {share.map((s) => (
              <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-line bg-surface text-[14px] font-semibold hover:bg-sunken transition">
                <s.Icon size={17} aria-hidden="true" />{s.label}
              </a>
            ))}
          </div>
          <ul className="text-[13px] text-ink3 flex flex-col gap-1.5">
            <li className="flex gap-2"><ShieldCheck size={15} className="shrink-0 mt-0.5" aria-hidden="true" />Consent is confirmed with a one-time code to the parent’s phone.</li>
            {feeOn && <li className="flex gap-2"><IndianRupee size={15} className="shrink-0 mt-0.5" aria-hidden="true" />The application fee is paid by Razorpay at the end of the form.</li>}
          </ul>
        </div>
      </Dialog>
      {notice.view}
    </>
  );
}
