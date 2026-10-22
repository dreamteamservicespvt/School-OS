import { Bell, Mail, MessageCircle, MessageSquareText, type LucideIcon } from "lucide-react";
import { Pill, type PillTone } from "@/components/ui/badge";
import { Words } from "@/lib/i18n/client";

export const CHANNEL_ICON: Record<string, LucideIcon> = { whatsapp: MessageCircle, sms: MessageSquareText, email: Mail, app: Bell };
export const CHANNEL_NAME: Record<string, string> = { whatsapp: "WhatsApp", sms: "SMS", email: "Email", app: "App notice" };
const TONE: Record<string, PillTone> = { whatsapp: "ok", sms: "info", email: "neutral", app: "neutral" };

/** The channels a message went by, as small pills (design/ui-prototype/src/mod-communication.jsx ChannelPills). */
export function ChannelPills({ channels, backup }: { channels: string[]; backup?: boolean }) {
  return (
    <span className="inline-flex gap-1 flex-wrap">
      {channels.map((c) => {
        const Ic = CHANNEL_ICON[c] ?? Bell;
        return <Pill key={c} tone={TONE[c] ?? "neutral"} className="!h-[22px] !text-[11.5px]"><Ic size={12} aria-hidden="true" />{CHANNEL_NAME[c] ?? c}</Pill>;
      })}
      {backup && <Pill tone="warn" className="!h-[22px] !text-[11.5px]"><Words k="SMS backup" /></Pill>}
    </span>
  );
}
