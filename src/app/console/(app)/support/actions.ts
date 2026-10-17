"use server";

// Support Access from the console (07-super-admin.md §3.4). Each action checks
// the person's console role ("support": Support and the Owner) on the server
// and writes an Activity Log line.

import { redirect } from "next/navigation";
import { appUrl, deliveredWords } from "@/lib/console/outbox";
import { flash } from "@/lib/flash";
import { endSupportFromConsole, requestSupportAccess, startSupportEntry, withdrawSupportRequest } from "@/lib/console/support";
import { requireConsoleAction, ConsoleDenied } from "@/lib/console/current";
import { ConsoleProblem } from "@/lib/console/schools";
import type { FormState } from "@/lib/forms";
import { consoleAct, str, uuid } from "../_lib/act";

export async function requestSupportAction(_p: FormState, fd: FormData) {
  return consoleAct("support", fd, (c) => requestSupportAccess(c.actor, uuid(fd, "schoolId"), { reason: str(fd, "reason"), lengthMinutes: Number(str(fd, "lengthMinutes")) }), (r) => {
    const w = deliveredWords(r.delivered);
    return `Request sent to ${r.schoolName}. Their School Admin and Principal see it in Approvals${w ? ` and got a message ${w}` : ""}.`;
  });
}

export async function withdrawSupportAction(_p: FormState, fd: FormData) {
  return consoleAct("support", fd, (c) => withdrawSupportRequest(c.actor, uuid(fd, "requestId")), (r) => `Request to ${r.schoolName} withdrawn.`);
}

export async function endSupportAction(_p: FormState, fd: FormData) {
  return consoleAct("support", fd, (c) => endSupportFromConsole(c.actor, uuid(fd, "requestId")), (r) => `Support access to ${r.schoolName} ended. The school was told in its Audit Log.`);
}

/**
 * Opens the school's School Master: a one-time ticket to the school's own
 * address (/support/enter), which sets the support browser's cookie. When the
 * console has its own address (CONSOLE_HOST), the school's is APP_URL.
 */
export async function enterSupportAction(fd: FormData) {
  let to: string;
  try {
    const c = await requireConsoleAction("support");
    const r = await startSupportEntry(c.actor, c.session.id, uuid(fd, "requestId"));
    to = `${process.env.CONSOLE_HOST?.trim() ? appUrl() : ""}/support/enter?ticket=${encodeURIComponent(r.ticket)}`;
  } catch (e) {
    if (e instanceof ConsoleProblem || e instanceof ConsoleDenied) {
      await flash({ message: e.message, tone: "danger" });
      redirect("/console/support");
    }
    throw e;
  }
  redirect(to);
}
