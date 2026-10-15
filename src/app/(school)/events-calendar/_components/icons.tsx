// The icons Events & Calendar names by word (entry types, event types).
import {
  Bus, CalendarDays, ClipboardCheck, Copy, FerrisWheel, FlaskConical, Flag, Flame, GraduationCap, Image, Medal, Mic, PalmtreeIcon, PartyPopper, PencilLine,
  Sparkles, Sun, Trophy, Users, Heart, Camera, Send, X, Globe, type LucideIcon,
} from "lucide-react";

export const EV_ICONS: Record<string, LucideIcon> = {
  Bus, CalendarDays, ClipboardCheck, Copy, FerrisWheel, FlaskConical, Flag, Flame, GraduationCap, Image, Medal, Mic, Palmtree: PalmtreeIcon, PartyPopper, PencilLine,
  Sparkles, Sun, Trophy, Users, Heart, Camera, Send, X, Globe,
};

export function EvIcon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  const I = EV_ICONS[name] ?? CalendarDays;
  return <I size={size} className={className} aria-hidden="true" />;
}
