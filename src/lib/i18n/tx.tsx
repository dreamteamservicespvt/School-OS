// Shared screen pieces (fields, cards, alerts, buttons) put their words through tx(): words given
// as plain text are shown in the screen's language when the catalogue has them (src/lib/i18n/t.ts);
// anything else passes through. Usable on the server and in the browser.
import { Any } from "./client";

export function tx(node: React.ReactNode): React.ReactNode {
  return typeof node === "string" && node.trim() ? <Any text={node} /> : node;
}
