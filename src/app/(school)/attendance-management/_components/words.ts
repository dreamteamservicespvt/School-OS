// Plain words for attendance record states, shared by several screens.
import type { BadgeTone } from "@/components/ui/badge";

export const CORRECTION_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  WAITING: { label: "Waiting", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Not approved", tone: "danger" },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
};
