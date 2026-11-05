"use client";

// One way to share a message or link everywhere (owner's testing, 2026-11-04): three
// choices side by side. WhatsApp opens WhatsApp with the words filled in; Share opens the
// phone's own share list (shown only where the browser has one); Copy puts the words on
// the clipboard and says "Copied".

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Copy, MessageCircle, Share2 } from "lucide-react";
import { buttonClass, type ButtonSize } from "./button";
import { cx } from "./cx";
import { whatsappHref } from "@/lib/share";
import { Words } from "@/lib/i18n/client";

const noChange = () => () => {};

export function ShareMenu({ text, phone, title, copyText, size = "sm", className, label }: {
  /** The whole message, with any link in it. */
  text: string;
  /** A 10-digit Indian mobile: WhatsApp opens that chat. Leave out to pick the chat in WhatsApp. */
  phone?: string | null;
  /** Title for the phone's share list. */
  title?: string;
  /** What Copy puts on the clipboard, when not the whole message (for example the link alone). */
  copyText?: string;
  size?: ButtonSize;
  className?: string;
  /** Read out before the buttons, for screen readers. */
  label?: string;
}) {
  // The phone's share list exists only in some browsers; the server draws without it.
  const canShare = useSyncExternalStore(noChange, () => typeof navigator.share === "function", () => false);
  const [copied, setCopied] = useState<"" | "yes" | "no">("");
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(""), 2500);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    const words = copyText ?? text;
    try {
      await navigator.clipboard.writeText(words);
      setCopied("yes");
    } catch {
      // Older browsers and pages without clipboard access: copy through a hidden box.
      try {
        const box = document.createElement("textarea");
        box.value = words;
        box.setAttribute("readonly", "");
        box.style.position = "fixed";
        box.style.opacity = "0";
        document.body.appendChild(box);
        box.select();
        const ok = document.execCommand("copy");
        box.remove();
        setCopied(ok ? "yes" : "no");
      } catch {
        setCopied("no");
      }
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title, text });
    } catch {
      // Closed by the person, or not allowed here: nothing to do.
    }
  };

  const btn = buttonClass("secondary", size);
  return (
    <div role="group" aria-label={label ?? "Share"} className={cx("flex flex-wrap items-center gap-2", className)}>
      <a className={btn} href={whatsappHref(text, phone)} target="_blank" rel="noopener noreferrer">
        <MessageCircle size={16} aria-hidden="true" /><Words k="WhatsApp" />
      </a>
      {canShare && (
        <button type="button" className={btn} onClick={share}>
          <Share2 size={16} aria-hidden="true" /><Words k="Share" />
        </button>
      )}
      <button type="button" className={btn} onClick={copy}>
        {copied === "yes" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        {copied === "yes" ? <Words k="Copied" /> : <Words k="Copy" />}
      </button>
      <span role="status" className={copied === "no" ? "text-[12.5px] text-bad" : "sr-only"}>
        {copied === "yes" ? <Words k="Copied" /> : copied === "no" ? <Words k="Could not copy. Select the words and copy them by hand." /> : null}
      </span>
    </div>
  );
}
