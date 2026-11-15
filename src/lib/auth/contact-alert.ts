// After a person changes their own mobile number or email in My profile, the
// OLD number or address is told (owner decision 3, 15 Nov 2026), so the real
// owner hears about it even when someone else made the change:
// - the old mobile: through Communication, by WhatsApp or SMS where the school
//   can carry typed words to staff (the "Message to staff" template);
// - the old email: from School OS's own mail server, as sign-in codes are, or
//   else through the school's email in Communication;
// - and in the app, as a security notice to the login.
// A message that cannot go never stops the change; the Audit Log says which
// ways it went.
import "server-only";

import { withSchool, type SchoolContext } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { mailIsSetUp, sendMail } from "./mail";
import { maskEmail, maskPhone, type ContactKind } from "./two-step";

import type { MessageKey } from "../i18n/t";
export const OLD_CONTACT_WORDS: Record<ContactKind, MessageKey> = {
  phone: "Your School OS mobile number was changed. If this was not you, contact your school.",
  email: "Your School OS email was changed. If this was not you, contact your school.",
};

const SUBJECT: Record<ContactKind, string> = {
  phone: "Your School OS mobile number was changed",
  email: "Your School OS email was changed",
};

/** One way of telling the old contact; it says whether the message went (was handed on). */
type Teller = (input: { schoolId: string; userLoginId: string; name: string; kind: ContactKind; old: string; text: string }) => Promise<boolean>;

/** The old mobile, through Communication (WhatsApp, else SMS), from nobody (a School OS message). */
export const byMessaging: Teller = async ({ schoolId, userLoginId, kind, old, text }) => {
  const ctx: SchoolContext = { schoolId, userId: null };
  const { sendMessage } = await import("../messaging/send");
  try {
    return await withSchool(ctx, async (tx) => {
      const r = await sendMessage(tx, ctx, {
        to: { loginIds: [userLoginId], loginContact: { [userLoginId]: kind === "phone" ? { phone: old, email: null } : { phone: null, email: old } } },
        channels: kind === "phone" ? ["whatsapp"] : ["email"],
        fallback: kind === "phone" ? ["sms"] : [],
        text,
        title: SUBJECT[kind],
        single: true,
        trigger: kind === "phone" ? "Security alert (mobile number changed)" : "Security alert (email changed)",
        source: { type: "User Login", id: userLoginId },
        audienceLabel: "Security alert",
        onNoCredits: "fail",
      });
      return r.queued > 0;
    });
  } catch (e) {
    console.error(JSON.stringify({ level: "warn", event: "old-contact-not-told", by: "messaging", kind, error: e instanceof Error ? e.message : String(e) }));
    return false;
  }
};

/** The old email, from School OS's own mail server. */
export const byMail: Teller = async ({ name, kind, old, text }) => {
  if (kind !== "email" || !mailIsSetUp()) return false;
  try {
    await sendMail(old, SUBJECT[kind], `Hello ${name},\n\n${text}\n`);
    return true;
  } catch (e) {
    console.error(JSON.stringify({ level: "warn", event: "old-contact-not-told", by: "mail", kind, error: e instanceof Error ? e.message : String(e) }));
    return false;
  }
};

/**
 * Tells the old mobile number or email, and the login in the app, that it was
 * changed. Called once the change is saved, never inside its transaction.
 * Returns the ways it went ("mail", "messaging"); the app notice always goes.
 */
export async function tellOldContact(
  input: { schoolId: string; userLoginId: string; name: string; kind: ContactKind; old: string | null; now?: Date },
  tellers: { mail?: Teller; messaging?: Teller } = {},
): Promise<string[]> {
  const text = OLD_CONTACT_WORDS[input.kind];
  const by: string[] = [];
  if (input.old) {
    const job = { schoolId: input.schoolId, userLoginId: input.userLoginId, name: input.name, kind: input.kind, old: input.old, text };
    // An old email: School OS's own mail first (it does not depend on the school's setup), else the school's email.
    if (input.kind === "email" && (await (tellers.mail ?? byMail)(job))) by.push("mail");
    else if (await (tellers.messaging ?? byMessaging)(job)) by.push("messaging");
  }
  // In the app too: from nobody, so the person gets it although they made the change (rule 4 is for news, not this).
  const ctx: SchoolContext = { schoolId: input.schoolId, userId: null };
  await withSchool(ctx, async (tx) => {
    await notify(tx, ctx, { to: input.userLoginId, type: "security", key: text, link: "/profile" });
    await writeAudit(tx, ctx, {
      action: "told-old-contact", recordType: "User Login", recordId: input.userLoginId,
      after: { kind: input.kind, old: input.old ? (input.kind === "phone" ? maskPhone(input.old) : maskEmail(input.old)) : null, by: by.length ? by : ["app only"] },
    });
  });
  return by;
}
