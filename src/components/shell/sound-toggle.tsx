"use client";

// The bell's sound On/Off switch (bell panel and My profile, Notifications).
// Saved on the person's own login, so it follows them to every device; the
// open page hears the change at once (bell-watch.tsx).
import { useState, useTransition } from "react";
import { Bell, BellOff } from "lucide-react";
import { setNotificationSound } from "@/app/(school)/profile/actions";
import { useT } from "@/lib/i18n/client";
import { cx } from "@/components/ui/cx";
import { SOUND_EVENT } from "./bell-watch";

export function SoundToggle({ on: initial, className, withHelp = false }: { on: boolean; className?: string; withHelp?: boolean }) {
  const t = useT();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const flip = () => {
    const next = !on;
    setOn(next);
    window.dispatchEvent(new CustomEvent(SOUND_EVENT, { detail: next }));
    start(async () => {
      const r = await setNotificationSound(next).catch(() => null);
      if (!r?.ok) { setOn(!next); window.dispatchEvent(new CustomEvent(SOUND_EVENT, { detail: !next })); }
    });
  };
  const Ic = on ? Bell : BellOff;
  return (
    <div className={cx("flex items-center gap-3", className)}>
      <button type="button" role="switch" aria-checked={on} aria-label={t("Notification sound")} onClick={flip} disabled={pending}
        className={cx("inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-semibold hover:bg-sunken disabled:opacity-60", on ? "text-brand" : "text-ink2 hover:text-ink")}>
        <Ic size={15} aria-hidden="true" />{on ? t("Sound on") : t("Sound off")}
      </button>
      {withHelp && <p className="text-[13px] text-ink3">{t("Short sounds when a notification comes and when something is saved, sent or paid, while School OS is open on this device.")}</p>}
    </div>
  );
}
