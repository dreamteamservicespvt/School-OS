// Runs one console action from a sheet: checks the person's console role on
// the server first, turns a problem into plain words next to its field, and
// on success shows a toast and refreshes the console.
import "server-only";

import { revalidatePath } from "next/cache";
import { formValues, type FormState } from "@/lib/forms";
import { flash, type Flash } from "@/lib/flash";
import { ConsoleDenied, requireConsole, type ConsoleCurrent } from "@/lib/console/current";
import { ConsoleProblem } from "@/lib/console/schools";
import { RazorpayProblem } from "@/lib/payments/razorpay";
import type { ConsoleAction } from "@/lib/console/roles";

export async function consoleAct<T>(
  action: ConsoleAction | null,
  fd: FormData,
  work: (c: ConsoleCurrent) => Promise<T>,
  done: (r: T) => string | Flash,
): Promise<FormState> {
  const c = await requireConsole();
  const values = formValues(fd);
  try {
    if (action && !c.can(action)) throw new ConsoleDenied();
    const r = await work(c);
    const f = done(r);
    await flash(typeof f === "string" ? { message: f, tone: "success" } : f);
    revalidatePath("/console", "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof ConsoleProblem) return { ok: false, message: e.message, errors: e.field ? { [e.field]: e.message } : undefined, values };
    if (e instanceof ConsoleDenied) return { ok: false, message: e.message, values };
    if (e instanceof RazorpayProblem) return { ok: false, message: e.message, values };
    throw e;
  }
}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const uuid = (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (!/^[0-9a-f-]{36}$/i.test(v)) throw new ConsoleProblem("This record was not found. Refresh the page and try again.");
  return v;
};
export const all = (fd: FormData, k: string) => fd.getAll(k).map(String);
