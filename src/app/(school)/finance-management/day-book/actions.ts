"use server";

// Close the day, reopen it, and remind the accountant (Day Book). The role is
// checked on the server: closing is the accountant's desk work (people who
// only read the Day Book, such as the Principal, are refused even with Full
// Finance), reopening needs Finance approval and someone other than the
// person who closed it, and Remind is for the people who read the Day Book.
import { formatDate, formatRupees } from "@/lib/format";
import { dateOf, id, needRupees, optionalText, text } from "@/lib/fees/act";
import { MoneyProblem } from "@/lib/fees/problem";
import { todayIn } from "@/lib/staff/dates";
import { closeDay, closesDays, remindToClose, reopenDay } from "@/lib/finance/day-close";
import { financeAction } from "../_lib/action";

/** Close the day: cash counted against the books; the day and every day before it are locked. */
export async function closeDayAction(_prev: unknown, fd: FormData) {
  return financeAction("create", fd, async (tx, ctx, _v, current) => {
    if (!closesDays(current)) throw new MoneyProblem("Closing the day is the accountant's work. Use Remind to ask them.");
    const date = dateOf(fd, "date", "Day");
    const counted = needRupees(fd, "counted", "Cash counted", { allowZero: true });
    const r = await closeDay(tx, ctx, { date, countedPaise: counted, reason: optionalText(fd, "reason", "Why it is different", 300), today: todayIn(current.school.timeZone) });
    return { id: r.close.id, date: formatDate(date), difference: r.difference };
  }, (r) => ({
    message: `${r.date} is closed. ${r.difference === BigInt(0) ? "Cash matched the books." : `Cash was ${r.difference > BigInt(0) ? `${formatRupees(r.difference)} more` : `${formatRupees(-r.difference)} short`}; the Principal is told.`} Later entries go into the next open day.`,
    undo: { kind: "finance-day-close", id: r.id },
  }));
}

/** Reopen the latest closed day, with a reason (not by the person who closed it). */
export async function reopenDayAction(_prev: unknown, fd: FormData) {
  return financeAction("approve", fd, async (tx, ctx) => {
    const c = await reopenDay(tx, ctx, id(fd, "closeId", "closed day"), text(fd, "reason", "Reason", { min: 5, max: 300 }));
    return formatDate(c.date);
  }, (d) => `${d} is open again. The person who closed it is told to count and close it again.`);
}

/** Remind the accountant to count the cash and close a day. */
export async function remindCloseAction(_prev: unknown, fd: FormData) {
  return financeAction("view", fd, async (tx, ctx, _v, current) => {
    if (closesDays(current)) throw new MoneyProblem("You close the day yourself. Use Close the day.");
    const date = dateOf(fd, "date", "Day");
    const r = await remindToClose(tx, ctx, date, todayIn(current.school.timeZone));
    return { sent: r.sent, date: formatDate(date) };
  }, (r) => `Reminder sent to ${r.sent === 1 ? "the accountant" : `${r.sent} accountants`} to count the cash and close ${r.date}.`);
}
