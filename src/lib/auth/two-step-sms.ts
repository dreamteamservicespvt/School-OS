// The two-step sign-in code by SMS, through Communication's messaging API
// (docs/BUILDING.md §5), from the school being opened. Used only when that
// school's SMS channel is on, its DLT entity ID and sender header are saved,
// and its "Sign-in code (SMS)" template has a DLT template ID (rule 34).
// Otherwise the caller falls back to email.
import "server-only";

import { withSchool, type SchoolContext, type Tx } from "../db";
import { channelSetups } from "../messaging/channels";
import { MessagingProblem, sendMessage } from "../messaging/send";
import { ensureReadyTemplates, templateByKey } from "../messaging/templates";

export const SIGN_IN_CODE_TEMPLATE = "sign-in-code";

/** The SMS template to use for sign-in codes, or null when SMS cannot be used now. */
export async function signInSmsTemplate(tx: Tx, ctx: SchoolContext): Promise<string | null> {
  const setups = await channelSetups(tx, ctx);
  if (!setups.sms.isOn) return null;
  // Test mode sends nothing; on a live server that would leave the person with no code at all.
  if (setups.sms.provider === "sandbox" && process.env.NODE_ENV === "production") return null;
  const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { smsDltEntityId: true, smsSenderHeader: true } });
  if (!school?.smsDltEntityId || !school.smsSenderHeader) return null;
  await ensureReadyTemplates(tx, ctx);
  const t = await templateByKey(tx, ctx, SIGN_IN_CODE_TEMPLATE, "sms");
  if (!t) return null;
  const ready = await tx.templateVersion.count({ where: { schoolId: ctx.schoolId, templateId: t.id, isCurrent: true, dltTemplateId: { not: null } } });
  return ready ? t.id : null;
}

export async function sendCodeBySms(input: { schoolId: string; userLoginId: string; phone: string; code: string; key: string | null }): Promise<{ sent: boolean; messageId?: string }> {
  const ctx: SchoolContext = { schoolId: input.schoolId, userId: input.userLoginId };
  try {
    return await withSchool(ctx, async (tx) => {
      const templateId = await signInSmsTemplate(tx, ctx);
      if (!templateId) return { sent: false };
      const r = await sendMessage(tx, ctx, {
        to: { loginIds: [input.userLoginId] },
        channels: ["sms"],
        templates: { sms: templateId },
        values: { code: input.code },
        single: true,
        emergency: true,
        trigger: "Sign-in code (two-step login)",
        source: { type: "User Login", id: input.userLoginId },
        audienceLabel: "Sign-in code",
        idempotencyKey: input.key ? `two-step:${input.key}` : null,
      });
      const setups = await channelSetups(tx, ctx);
      if (setups.sms.provider === "sandbox") {
        console.info(JSON.stringify({ level: "info", event: "two-step-code", note: "SMS is in test mode; development only", to: input.userLoginId, code: input.code }));
      }
      return { sent: true, messageId: r.messageId };
    });
  } catch (e) {
    // No credits, no number on the login, or a template problem: the code goes by email instead.
    if (e instanceof MessagingProblem) return { sent: false };
    throw e;
  }
}
