import { Alert } from "@/components/ui/alert";

/**
 * Shown when WhatsApp is not connected. Outside production the code is written to
 * the server log so people can work; a production server never writes codes
 * anywhere, so there the screen must not say it did (QA audit: it claimed so).
 */
export function TestCodeNote() {
  if (process.env.NODE_ENV === "production") {
    return <Alert tone="danger" title="The code could not be sent">WhatsApp is not connected on this server yet, so no code went to the phone. The DREAM TEAM Owner must connect it in the console’s WhatsApp settings before anyone can finish signing in here.</Alert>;
  }
  return <Alert tone="info">WhatsApp is not connected on this server, so the code was written to the server log.</Alert>;
}

/** The same, in one line, for the invite card in the console. */
export const testMessageNote = () =>
  process.env.NODE_ENV === "production"
    ? "WhatsApp is not connected on this server, so the invite was not sent. Connect it in WhatsApp settings, then resend it from the school’s page."
    : "Messaging is in test mode here: the text went to the server log, not a phone.";

/** True when the screen must not say a code went out: test mode on a production server. */
export const codeNotSent = (test: boolean | undefined) => Boolean(test) && process.env.NODE_ENV === "production";
