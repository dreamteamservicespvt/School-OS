import { Alert } from "@/components/ui/alert";

/**
 * Shown when no SMS provider is set up. On a tester's computer the code is
 * written to the server log so people can work (src/lib/dev-codes.ts, `inLog`);
 * a live server never writes codes anywhere, so there the screen must not say
 * it did (QA audit: it claimed so).
 */
export function TestCodeNote({ inLog = false }: { inLog?: boolean }) {
  if (process.env.NODE_ENV === "production" && !inLog) {
    return <Alert tone="danger" title="The code could not be sent">No SMS provider is set up on this server yet, so no code went to the phone. DREAM TEAM must connect SMS before anyone can finish signing in here.</Alert>;
  }
  return <Alert tone="info">No SMS provider is set up on this server, so the code was written to the server log.</Alert>;
}

/** The same, in one line, for the invite card in the console. */
export const testMessageNote = (inLog = false) =>
  process.env.NODE_ENV === "production" && !inLog
    ? "No WhatsApp or SMS provider is set up on this server, so the invite was not sent. Send it from the school's page once messaging is connected."
    : "Messaging is in test mode here: the text went to the server log, not a phone.";

/** True when the screen must not say a code went out: test mode on a live server. */
export const codeNotSent = (test: boolean | undefined, inLog = false) => Boolean(test) && process.env.NODE_ENV === "production" && !inLog;
