import type { BadgeTone } from "@/components/ui/badge";

export const EXIT_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  WAITING_APPROVAL: { label: "Waiting for approval", tone: "warning" },
  IN_PROGRESS: { label: "In progress", tone: "brand" },
  COMPLETED: { label: "Completed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};
