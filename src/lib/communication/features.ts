// Communication's optional pages (11-communication.md §2), switched on school by school with the
// School Feature record (CLAUDE.md: "let new features be switched on school by school").
export const COMM_FEATURES = {
  /** WhatsApp Inbox: for schools connecting WhatsApp Business. */
  inbox: "whatsapp-inbox",
  /** Surveys: for schools running surveys. */
  surveys: "surveys",
  /** Push alerts on staff phones and computers (00-global.md §4 rule 8; src/lib/push.ts keeps the same key). */
  push: "push-alerts",
} as const;

export const COMM_FEATURE_LIST = [
  { key: COMM_FEATURES.inbox, label: "WhatsApp Inbox", description: "All school WhatsApp chats in one place; each staff member sees the chats given to them." },
  { key: COMM_FEATURES.surveys, label: "Surveys", description: "Short surveys for parents, staff and students, with the answers counted." },
  { key: COMM_FEATURES.push, label: "Push alerts", description: "Staff can get notifications as alerts on their phone or computer, even with School OS closed. Each person chooses which kinds in My profile." },
] as const;
