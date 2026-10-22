"use server";

// One message: cancel before it goes, retry failed, resend to unread or failed.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import { commAction } from "@/lib/communication/access";
import { cancelScheduled, retryFailed } from "@/lib/messaging/deliver";
import { creditWords, MessagingProblem } from "@/lib/messaging/send";
import { planResend, resend, type ResendWho } from "@/lib/messaging/resend";
import { CHANNEL_LABEL, isChannel } from "@/lib/messaging/channels";
import { messageCampusWhere } from "@/lib/communication/history";

async function ownMessage(id: string) {
  const access = await commAction("create");
  // A message only to another campus's people is not found for a person limited to one campus.
  const ok = await withSchool(access.current.ctx, async (tx) => tx.message.findFirst({ where: { id, schoolId: access.current.ctx.schoolId, ...(access.full ? {} : { sentById: access.current.user.id }), AND: [await messageCampusWhere(tx, access.current.ctx, access.scope.campusId)] }, select: { id: true } }));
  if (!ok) throw new MessagingProblem("This message was not found, or you did not send it.");
  return access;
}

export async function cancelMessage(id: string): Promise<string | void> {
  try {
    const { current } = await ownMessage(id);
    await withSchool(current.ctx, (tx) => cancelScheduled(tx, current.ctx, id));
  } catch (e) {
    if (e instanceof MessagingProblem) return e.message;
    throw e;
  }
  await flash({ message: "Cancelled. Nobody will get this message and the credits are back.", tone: "success" });
  revalidatePath(`/communication/history/${id}`);
}

export async function retryMessage(id: string): Promise<string | void> {
  let n = 0;
  try {
    const { current } = await ownMessage(id);
    n = await withSchool(current.ctx, (tx) => retryFailed(tx, current.ctx, id));
  } catch (e) {
    if (e instanceof MessagingProblem) return e.message;
    throw e;
  }
  await flash({ message: `Retrying ${n} failed ${n === 1 ? "message" : "messages"}.`, tone: "success" });
  revalidatePath(`/communication/history/${id}`);
}

export type ResendPreview = { ok: true; people: number; cost: string; skipped: string[]; problem: string | null } | { ok: false; message: string };

export async function previewResend(id: string, who: ResendWho, channel: string): Promise<ResendPreview> {
  if (!isChannel(channel) && channel !== "preferred") return { ok: false, message: "Choose a channel." };
  try {
    const { current, scope } = await ownMessage(id);
    const plan = await withSchool(current.ctx, (tx) => planResend(tx, current.ctx, id, who, channel, scope));
    return {
      ok: true,
      people: plan.people,
      cost: creditWords(plan, channel === "preferred" ? "" : CHANNEL_LABEL[channel]),
      skipped: plan.skipped.map((g) => `${g.reason}: ${g.count}`),
      problem: plan.problems[0] ?? plan.creditProblem ?? (plan.people === 0 ? "Nobody can be reached on this channel. Choose another channel." : null),
    };
  } catch (e) {
    if (e instanceof MessagingProblem) return { ok: false, message: e.message };
    throw e;
  }
}

export async function doResend(id: string, who: ResendWho, channel: string): Promise<string | void> {
  if (!isChannel(channel) && channel !== "preferred") return "Choose a channel.";
  let newId: string;
  let people = 0;
  try {
    const { current, scope } = await ownMessage(id);
    const r = await withSchool(current.ctx, (tx) => resend(tx, current.ctx, id, who, channel, scope));
    newId = r.messageId;
    people = r.people;
  } catch (e) {
    if (e instanceof MessagingProblem) return e.message;
    throw e;
  }
  await flash({ message: `Resending to ${people} ${people === 1 ? "person" : "people"}${channel === "preferred" ? ", each by the best channel that can carry it" : ` by ${CHANNEL_LABEL[channel]}`}.`, tone: "success" });
  redirect(`/communication/history/${newId}`);
}
