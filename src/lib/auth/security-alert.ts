// Security alerts to one person (00-global.md §4, rule 7): a sign-in from a new
// device and a changed password. They cannot be switched off. They show in the
// app and go on the channels the person chose for "Security alerts" (email by
// default) through Communication. When the school's own email is not set up,
// the email goes from School OS's own mail server instead, as sign-in codes do,
// so the person hears about it even while someone else is signed in as them.
import "server-only";

import type { Tx } from "../db";
import { notify } from "../notifications";
import { channelsForType } from "../notification-kinds";
import { mailIsSetUp, sendMail } from "./mail";

/** Work to do once the change is saved (an email is never sent from inside a transaction). */
export type AfterSave = () => Promise<void>;

export async function securityAlert(tx: Tx, schoolId: string, userLoginId: string, input: { text: string; subject: string; link?: string }): Promise<AfterSave> {
  // Rule 4 ("not for your own actions") does not apply: the alert matters most when it was not them.
  const ctx = { schoolId, userId: null };
  await notify(tx, ctx, { to: userLoginId, type: "security", text: input.text, link: input.link ?? "/profile#devices" });
  const login = await tx.userLogin.findUnique({ where: { id: userLoginId }, select: { email: true, displayName: true, notificationPrefs: true } });
  const email = login?.email;
  if (!login || !email || !channelsForType(login.notificationPrefs, "security").includes("email") || !mailIsSetUp()) return async () => {};
  const { channelSetups } = await import("../messaging/channels");
  // The school's email is on: the copy has gone through Communication already.
  if ((await channelSetups(tx, ctx)).email.isOn) return async () => {};
  return async () => {
    try {
      await sendMail(email, input.subject, `Hello ${login.displayName},\n\n${input.text}\n`);
    } catch (e) {
      console.error(JSON.stringify({ level: "error", event: "security-alert-mail-failed", error: e instanceof Error ? e.message : String(e) }));
    }
  };
}
