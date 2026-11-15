// The words a parent's phone needs for the browser parts of Parent Link (and the shared album):
// only these go to the page, never the whole app's word list. The full list made the Parent Link
// page 2.1 MB, several seconds of blank screen on a cheap phone (layman test loop 3).
//
// Everything else on the page is put into the parent's language on the server (makeT), and
// the actions' answers are too (src/app/p/[token]/*-actions.ts). Add a line here when a browser
// component under src/components/parent-link (or one it uses) gets new words in t();
// a missing line shows those words in English, never a blank.
import "server-only";

import { catalogueFor } from "../i18n/server";
import type { Lang } from "../i18n/languages";

export const PARENT_BROWSER_WORDS: readonly string[] = [
  // Day and month names (dayWords in the month picker).
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
  // Fee states (the Pay list).
  "Not due", "Due", "Overdue", "Paid",
  // src/components/parent-link/*.tsx, language-picker.tsx and attendance/month-select.tsx.
  "1 free time",
  "6-digit code",
  "A one-time code goes to {phone} to confirm it is you.",
  "After this, photos of your child are not shared.",
  "After this, the school stops what this form allows.",
  "Back",
  "Book a time",
  "Book this time",
  "Book {time}",
  "Booked",
  "Booked by the school",
  "Booking",
  "Booking closed",
  "Booking closed the day before.",
  "Break {time}",
  "Cancel",
  "Cancel meeting",
  "Cancel the meeting",
  "Cancel {child}’s meeting with {teacher} at {time}? The time goes back to other parents.",
  "Cancelling",
  "Change my answer",
  "Change the time",
  "Change to {time}",
  "Changes closed the day before. To change, please call the school.",
  "Checking",
  "Confirm",
  "Confirm it’s you",
  "Confirmed with a one-time code. Any fee is in fees due.",
  "Consent given",
  "Consent needed",
  "Due on {date}",
  "Earlier month",
  "Every time with {name} is booked.",
  "Free times with {name}",
  "Give consent",
  "Keep it",
  "Keep {time}",
  "Language",
  "Later month",
  "Meet",
  "Month",
  "No teacher meets parents of {child}’s class at this PTM. Please call the school.",
  "Not going",
  "Not this time",
  "Opening payment page",
  "PTM on {date}",
  "Parents can change the time or cancel here until {date}.",
  "Parent–teacher meeting",
  "Pay {amount}",
  "Pay {fee}",
  "Pick a new time",
  "Pick a time",
  "Pick another teacher, or call the school.",
  "Please call the school.",
  "Please come 5 minutes early.",
  "Please pay at the school office. Online payment is not switched on for this class.",
  "Please reply by {date}",
  "Preview only",
  "Remove consent",
  "Remove consent for",
  "Saved. Nothing is charged.",
  "Say yes for",
  "Send a new code",
  "Send code",
  "Sending",
  "Sending code",
  "The reply-by date has passed. Please call the school.",
  "The school books PTM times.",
  "The school books PTM times. To change, please call the school.",
  "This link is being opened on a new phone. We will send a 6-digit code by SMS to {phone}.",
  "This link is being opened on a new phone. We will send a 6-digit code on WhatsApp to {phone}.",
  "The school could not send your code. Please call the school office on {phone}.",
  "We could not send the code just now. Please contact the school office.",
  "We sent a 6-digit code on WhatsApp to {phone}.",
  "We sent a 6-digit code by SMS to {phone}.",
  "Tick a fee to pay",
  "To change these meetings, please call the school.",
  "To meet the teacher, please call the school.",
  "UPI, card or net banking. Your receipt comes here once the payment is confirmed.",
  "We sent a 6-digit code to {phone}.",
  "Why this step?",
  "You are removing your consent for “{title}”. To confirm, enter the 6-digit code sent to {phone}.",
  "You are saying yes for {title}. To confirm, enter the 6-digit code sent to {phone}.",
  "You are saying yes for “{title}”. To confirm, enter the 6-digit code sent to {phone}.",
  "You can change the time or cancel until {date}.",
  "Your link shows your children’s records. The code makes sure only you can open it on a new phone. After this, this phone will not need a code each time. If this is not your number, please call the school.",
  "booked by the school",
  "fully booked",
  "until {date}",
  "{child} is going to {event}",
  "{child} is not going",
  "{n} free times",
  "{time} with {teacher}",
];

const made = new Map<Lang, Record<string, string>>();

function pick(lang: Lang, keys: readonly string[]): Record<string, string> {
  const all = catalogueFor(lang);
  const out: Record<string, string> = {};
  for (const k of keys) if (all[k]) out[k] = all[k];
  return out;
}

/**
 * The words for <I18nProvider> on a parent's page: PARENT_BROWSER_WORDS in one language, plus a
 * page's own extra words. English needs none (the words are the keys).
 */
export function parentDict(lang: Lang, extra: readonly string[] = []): Record<string, string> {
  if (lang === "en") return {};
  let base = made.get(lang);
  if (!base) made.set(lang, (base = pick(lang, PARENT_BROWSER_WORDS)));
  return extra.length ? { ...base, ...pick(lang, extra) } : base;
}
