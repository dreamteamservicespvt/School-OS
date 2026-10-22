// Messages that come back from the rules (a form error, a refused code) in the screen's
// language. Fixed messages come from the catalogue; the common ones with a name or a number in
// them are matched here. A message the catalogue does not have stays in English, never blank.
import type { T } from "./t";

const PATTERNS: [RegExp, (t: T, m: RegExpExecArray) => string][] = [
  [/^(.+) is needed\.$/, (t, m) => t("{field} is needed.", { field: t.any(m[1]) })],
  [/^(.+) can be at most (\d+) characters\.$/, (t, m) => t("{field} can be at most {n} characters.", { field: t.any(m[1]), n: m[2] })],
  [/^(.+) has (\d+) digits\. Indian mobile numbers have 10 digits\.$/, (t, m) => t("{field} has {n} digits. Indian mobile numbers have 10 digits.", { field: t.any(m[1]), n: m[2] })],
  [/^(.+): Indian mobile numbers start with 6, 7, 8 or 9\.$/, (t, m) => t("{field}: Indian mobile numbers start with 6, 7, 8 or 9.", { field: t.any(m[1]) })],
  [/^Too many tries in a short time\. Please wait (\d+) seconds and try again\.$/, (t, m) => t("Too many tries in a short time. Please wait {n} seconds and try again.", { n: m[1] })],
  [/^Too many tries in a short time\. Please wait (\d+) minutes and try again\.$/, (t, m) => t("Too many tries in a short time. Please wait {n} minutes and try again.", { n: m[1] })],
  [/^That code is not right\. (\d+) (?:try|tries) left\.$/, (t, m) => t("That code is not right. {n} tries left.", { n: m[1] })],
  [/^Code sent\. It works for (\d+) minutes\.$/, (t, m) => t("Code sent. It works for {n} minutes.", { n: m[1] })],
];

const TESTER = " (On this tester's computer the code is in the server log.)";

export function screenMessage(t: T, message: string): string;
export function screenMessage(t: T, message: string | null | undefined): string | undefined;
export function screenMessage(t: T, message: string | null | undefined): string | undefined {
  if (!message) return message ?? undefined;
  if (t.lang === "en") return message;
  if (message.endsWith(TESTER)) return `${screenMessage(t, message.slice(0, -TESTER.length))} ${t("(On this tester's computer the code is in the server log.)")}`;
  for (const [re, say] of PATTERNS) {
    const m = re.exec(message);
    if (m) return say(t, m);
  }
  return t.any(message);
}
