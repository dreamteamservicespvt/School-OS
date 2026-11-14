// THE switch for SMS in the school app (owner, 15 Nov 2026: "WhatsApp messages
// only. Everywhere, stop the normal SMS by default; we are not going to
// implement that now"). School staff are not technical, so SMS choices that
// cannot work (DLT templates, SMS backup) only confuse them.
//
// While this is false: no school screen offers SMS as a channel, nothing is
// sent by SMS by default or by accident (planMessage treats SMS as not
// connected), and SMS backup is never used. The code, the provider adapter,
// templates and stored settings all stay, so turning this to true brings SMS
// back everywhere with this ONE change.
//
// Not affected on purpose: sign-in and confirmation codes (login security,
// src/lib/auth/*) and the Super Admin console keep their SMS path.
//
// Client-safe (no "server-only"), so screens can read it too.
export const SMS_OFFERED: boolean = false;

/** The channels a school screen may offer: SMS is left out while SMS_OFFERED is false. */
export function offeredChannels<T extends string>(list: readonly T[]): T[] {
  return list.filter((c) => SMS_OFFERED || c !== "sms");
}
