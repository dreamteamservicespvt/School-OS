"use server";

import { changeOwnPassword } from "@/lib/console/team";
import { ConsoleProblem } from "@/lib/console/schools";
import type { FormState } from "@/lib/forms";
import { consoleAct } from "../_lib/act";

/** Anyone in the console can change their own password; other devices are signed out. */
export async function changePasswordAction(_p: FormState, fd: FormData) {
  return consoleAct(null, fd, async (c) => {
    const next = String(fd.get("next") ?? "");
    if (next !== String(fd.get("again") ?? "")) throw new ConsoleProblem("The two new passwords are not the same.", "again");
    if (!c.actor.id) throw new ConsoleProblem("Your login was not found.");
    await changeOwnPassword({ ...c.actor, id: c.actor.id }, { current: String(fd.get("current") ?? ""), next, sessionId: c.session.id });
    return true;
  }, () => "Password changed. Other devices were signed out.");
}
