"use server";

// Team actions (07-super-admin.md §3.8). Owner only, checked on the server;
// each one writes an Activity Log line.

import { changeTeamRole, disableTeamMember, inviteTeamMember, resendTeamInvite } from "@/lib/console/team";
import { deliveredWords } from "@/lib/console/outbox";
import { CONSOLE_ROLES } from "@/lib/console/roles";
import type { FormState } from "@/lib/forms";
import { consoleAct, str, uuid } from "../_lib/act";

export async function inviteTeamAction(_p: FormState, fd: FormData) {
  return consoleAct("team", fd, (c) => inviteTeamMember(c.actor, { name: str(fd, "name"), mobile: str(fd, "mobile"), email: str(fd, "email") || null, role: str(fd, "role") }),
    (r) => ({ message: `Invite sent to ${r.name}. It works for 3 days.${deliveredWords(r.delivered) ? ` ${deliveredWords(r.delivered)}` : ""}`, tone: "success" }));
}

export async function resendTeamAction(_p: FormState, fd: FormData) {
  return consoleAct("team", fd, (c) => resendTeamInvite(c.actor, uuid(fd, "userId")),
    (r) => `Invite sent to ${r.name}.${deliveredWords(r.delivered) ? ` ${deliveredWords(r.delivered)}` : ""}`);
}

export async function changeRoleAction(_p: FormState, fd: FormData) {
  return consoleAct("team", fd, (c) => changeTeamRole(c.actor, uuid(fd, "userId"), str(fd, "role")),
    (r) => (r.changed ? `${r.name} is now ${CONSOLE_ROLES[r.role as keyof typeof CONSOLE_ROLES].label}.` : "No change."));
}

export async function disableTeamAction(_p: FormState, fd: FormData) {
  return consoleAct("team", fd, (c) => disableTeamMember(c.actor, uuid(fd, "userId"), str(fd, "reason")),
    (r) => `${r.name} can no longer sign in. Their history stays in the Activity Log.`);
}
