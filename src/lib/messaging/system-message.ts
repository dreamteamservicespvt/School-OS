// Messages School OS sends that carry a person's own link (QA LABEL-01): the
// Parent Link message (a guardian's link, from the Parent Link page, a
// student's profile, an approved admission or going live) and the invite to a
// new School OS login.
//
// Like a one-time code (./one-time-code.ts), such a message is a required
// system message, not an emergency broadcast, and is not counted as one:
// - it reaches a person who opted out of messages, because it is their own
//   key into School OS, not news;
// - its Message Type says what it is ("parent-link" or "staff-invite"), and
//   is_emergency stays off;
// - nobody is its sender: Message History says "School OS (Parent Link)" or
//   "School OS (staff invite)";
// - the Audit Log says "system-message-sent", with the person who asked for
//   it as the person on the line.
// A real emergency broadcast (Send Message, a critical notice) is unchanged.

/** Message.messageType of each such message, and its sender in words. */
export const SYSTEM_MESSAGES = {
  "parent-link": "School OS (Parent Link)",
  "staff-invite": "School OS (staff invite)",
} as const;

export type SystemPurpose = keyof typeof SYSTEM_MESSAGES;

/** What each one is, for the message page. */
const WHAT: Record<SystemPurpose, string> = {
  "parent-link": "a parent's own Parent Link",
  "staff-invite": "an invite to a new School OS login",
};

/** The Audit Log action of such a message. */
export const SYSTEM_MESSAGE_SENT = "system-message-sent";

export const isSystemMessage = (m: { messageType: string | null | undefined }) => Object.hasOwn(SYSTEM_MESSAGES, m.messageType ?? "");

/** Which system message this is, or null for any other message. */
export const systemPurposeOf = (m: { messageType: string | null | undefined }): SystemPurpose | null => (isSystemMessage(m) ? (m.messageType as SystemPurpose) : null);

export const systemSenderWords = (purpose: SystemPurpose) => SYSTEM_MESSAGES[purpose];
export const systemWhatWords = (purpose: SystemPurpose) => WHAT[purpose];
