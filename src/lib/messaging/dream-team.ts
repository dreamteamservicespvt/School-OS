// DREAM TEAM's own WhatsApp Business number, shared by every school that does
// not bring its own (console, Add School, "WhatsApp for this school"). The
// number, its WhatsApp Business account and its access token are set once in
// the server's environment, never in the code or the database
// (08-platform-security.md §3). They are the same ones the console uses for its
// own invites (outbox.ts):
//   CONSOLE_WHATSAPP_PHONE_NUMBER_ID      the number's phone number ID in Meta
//   CONSOLE_WHATSAPP_ACCESS_TOKEN         the permanent access token
//   CONSOLE_WHATSAPP_BUSINESS_ACCOUNT_ID  the WhatsApp Business account ID, for
//                                         sending a school's templates for approval
//   CONSOLE_WHATSAPP_DISPLAY_NUMBER       optional: the 10-digit number parents see
// Each one falls back to the same name without CONSOLE_ (WHATSAPP_BUSINESS_ACCOUNT_ID…).
// A school on the shared number keeps its own templates (their names carry the
// template's id, so two schools never clash), its own credits and its own
// Message History; only the sending number is shared.

/** The provider key of a school that sends from DREAM TEAM's shared number. */
export const DREAM_TEAM_PROVIDER = "dream-team";

/** Both WhatsApp providers that really send through Meta's WhatsApp Cloud API. */
export function isMetaWhatsapp(provider: string | null | undefined) {
  return provider === "meta-cloud" || provider === DREAM_TEAM_PROVIDER;
}

function env(name: string) {
  const read = (n: string) => { const v = process.env[n]; return v && v.trim() ? v.trim() : ""; };
  // The owner's server already has the plain WHATSAPP_* names; CONSOLE_* wins when both are set.
  return read(name) || (name.startsWith("CONSOLE_WHATSAPP_") ? read(name.replace("CONSOLE_", "")) : "");
}

/** The shared number's plain settings (never the token): shown on screens and used to send. */
export function dreamTeamWhatsappConfig(): Record<string, string> {
  const out: Record<string, string> = {};
  const id = env("CONSOLE_WHATSAPP_PHONE_NUMBER_ID");
  const waba = env("CONSOLE_WHATSAPP_BUSINESS_ACCOUNT_ID");
  const shown = env("CONSOLE_WHATSAPP_DISPLAY_NUMBER").replace(/\D/g, "").slice(-10);
  if (id) out.phoneNumberId = id;
  if (waba) out.businessAccountId = waba;
  if (shown) out.displayNumber = shown;
  return out;
}

/** The shared number's access token, for the provider adapter only. Never sent to a browser. */
export function dreamTeamWhatsappSecrets(): Record<string, string> {
  const token = env("CONSOLE_WHATSAPP_ACCESS_TOKEN");
  return token ? { accessToken: token } : {};
}

/** Can schools send from DREAM TEAM's number on this server? */
export function dreamTeamWhatsappReady() {
  return Boolean(env("CONSOLE_WHATSAPP_PHONE_NUMBER_ID") && env("CONSOLE_WHATSAPP_ACCESS_TOKEN"));
}
