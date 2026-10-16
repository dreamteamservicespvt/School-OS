"use server";

// A school's console actions (07-super-admin.md §3.3, §6, §7). Each checks the
// person's console role on the server and writes an Activity Log line.

import { deliveredWords, type Delivered } from "@/lib/console/outbox";
import { redirect } from "next/navigation";
import { addAdmin, addNote, cancelInvite, changeAdminMobile, changeStatus, deleteSchoolForGood, disableAdmin, editDetails, MOVES, resendInvite, resetAdminLogin, setGroup, type StatusMove } from "@/lib/console/schools";
import { sendInvoice, topupInvoice } from "@/lib/console/billing";
import type { ConsoleAction } from "@/lib/console/roles";
import type { FormState } from "@/lib/forms";
import { all, consoleAct, str, uuid } from "../_lib/act";

const sentWords = (d: Delivered[]) => {
  const w = deliveredWords(d);
  return w ? ` ${w}` : "";
};

export async function resendInviteAction(_p: FormState, fd: FormData) {
  return consoleAct("invite", fd, (c) => resendInvite(c.actor, uuid(fd, "schoolId"), uuid(fd, "inviteId")), (r) => `New invite sent to ${r.name}.${sentWords(r.delivered)} The old link stopped working.`);
}

export async function cancelInviteAction(_p: FormState, fd: FormData) {
  return consoleAct("invite", fd, (c) => cancelInvite(c.actor, uuid(fd, "schoolId"), uuid(fd, "inviteId"), str(fd, "reason")), (r) => `Invite to ${r.name} cancelled. The link no longer works.`);
}

export async function addAdminAction(_p: FormState, fd: FormData) {
  const roleKey = str(fd, "roleKey") === "principal" ? "principal" : "school-admin";
  return consoleAct("invite", fd, (c) => addAdmin(c.actor, uuid(fd, "schoolId"), { name: str(fd, "name"), mobile: str(fd, "mobile"), email: str(fd, "email") || null, roleKey, channels: all(fd, "channels"), checked: str(fd, "checked") || null }), (r) => `Admin added.${sentWords(r.delivered)}`);
}

export async function resetAdminAction(_p: FormState, fd: FormData) {
  return consoleAct("reset", fd, (c) => resetAdminLogin(c.actor, uuid(fd, "schoolId"), uuid(fd, "userLoginId"), { reason: str(fd, "reason"), channels: all(fd, "channels") }), (r) => `${r.name}’s login was reset. A reset link was sent.${sentWords(r.delivered)}`);
}

export async function disableAdminAction(_p: FormState, fd: FormData) {
  return consoleAct("disable", fd, (c) => disableAdmin(c.actor, uuid(fd, "schoolId"), uuid(fd, "userLoginId"), str(fd, "reason")), (r) => `${r.name} can no longer sign in to this school.`);
}

export async function changeMobileAction(_p: FormState, fd: FormData) {
  return consoleAct("reset", fd, (c) => changeAdminMobile(c.actor, uuid(fd, "schoolId"), uuid(fd, "userLoginId"), { mobile: str(fd, "mobile"), reason: str(fd, "reason"), checked: str(fd, "checked") }), (r) => `${r.name}’s mobile number changed. The other admins were told.`);
}

const MOVE_NEEDS: Record<StatusMove, ConsoleAction> = { activate: "activate", reactivate: "activate", suspend: "status", close: "status", reopen: "status" };
const MOVE_DONE: Record<StatusMove, string> = { activate: "is now Active", reactivate: "is Active again", suspend: "is Suspended. Its staff were signed out", close: "is Closed. Its data is kept for 90 days", reopen: "is open again" };

export async function statusAction(_p: FormState, fd: FormData) {
  const move = str(fd, "move") as StatusMove;
  if (!(move in MOVES)) return { ok: false, message: "Choose what to do." };
  return consoleAct(MOVE_NEEDS[move], fd, (c) => changeStatus(c.actor, uuid(fd, "schoolId"), move, { reason: str(fd, "reason"), typedName: str(fd, "typedName") || null }), (r) => `${r.name} ${MOVE_DONE[move]}.`);
}

/** Deletes an empty, closed school for good; Owner only (the "status" action). */
export async function deleteSchoolAction(_p: FormState, fd: FormData) {
  const r = await consoleAct("status", fd, (c) => deleteSchoolForGood(c.actor, uuid(fd, "schoolId"), { typedName: str(fd, "typedName"), reason: str(fd, "reason") }), (x) => `${x.name} was deleted for good. Its Audit Log is kept.`);
  if (r?.ok) redirect("/console/schools?status=closed");
  return r;
}

export async function editDetailsAction(_p: FormState, fd: FormData) {
  const approx = str(fd, "approxStudents").replace(/\D/g, "");
  return consoleAct("edit", fd, (c) => editDetails(c.actor, uuid(fd, "schoolId"), {
    name: str(fd, "name"), city: str(fd, "city"), state: str(fd, "state"), board: str(fd, "board"), schoolType: str(fd, "schoolType"),
    phone: str(fd, "phone"), email: str(fd, "email") || null, address: str(fd, "address") || null, approxStudents: approx ? Number(approx) : null,
  }), (r) => (r.changed ? `${r.name}’s details saved.` : "Nothing changed."));
}

export async function groupAction(_p: FormState, fd: FormData) {
  const pick = str(fd, "group");
  return consoleAct("group", fd, (c) => setGroup(c.actor, uuid(fd, "schoolId"), { groupId: pick && pick !== "none" && pick !== "new" ? pick : null, newGroupName: pick === "new" ? str(fd, "newGroupName") : null }), (r) => (r.groupName ? `${r.name} is now in ${r.groupName}.` : `${r.name} is in no group.`));
}

export async function noteAction(_p: FormState, fd: FormData) {
  return consoleAct(null, fd, (c) => addNote(c.actor, uuid(fd, "schoolId"), str(fd, "text")), () => "Note saved. Only DREAM TEAM sees it.");
}

export async function sendInvoiceAction(_p: FormState, fd: FormData) {
  return consoleAct("invoice", fd, (c) => sendInvoice(c.actor, uuid(fd, "invoiceId"), { reminder: str(fd, "reminder") || undefined }), (r) => ({
    message: `Invoice ${r.number} sent.${sentWords(r.delivered)}${r.link ? " Razorpay link included." : ""}${r.problem ? ` ${r.problem}` : ""}`,
    tone: r.problem ? "info" : "success",
  }));
}

export async function topupAction(_p: FormState, fd: FormData) {
  return consoleAct("topup", fd, async (c) => {
    const r = await topupInvoice(c.actor, uuid(fd, "schoolId"), { waitForOk: !c.can("approve") });
    return { ...r, waits: !c.can("approve") };
  }, (r) => (r.waits ? `Top-up invoice ${r.number} made. It waits for the Owner’s OK in Plans & Billing.` : `Top-up invoice ${r.number} made and sent.${r.sent ? sentWords(r.sent.delivered) : ""}`));
}

/** Resend the admin invite of each chosen school that has no admin signed in yet. */
export async function bulkResendAction(_p: FormState, fd: FormData) {
  return consoleAct("invite", fd, async (c) => {
    const pairs = str(fd, "pairs").split(",").map((p) => p.split(":")).filter((p) => p.length === 2 && p.every((x) => /^[0-9a-f-]{36}$/i.test(x)));
    let sent = 0;
    for (const [schoolId, inviteId] of pairs.slice(0, 100)) {
      await resendInvite(c.actor, schoolId, inviteId);
      sent += 1;
    }
    return sent;
  }, (n) => `${n} new ${n === 1 ? "invite" : "invites"} sent. The old links stopped working.`);
}

