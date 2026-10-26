"use server";

// Message Templates: save (a new version per changed language), archive or
// restore, and WhatsApp approval. Only people with school-wide Communication
// access change templates; everyone else can read and use them.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import { commAction } from "@/lib/communication/access";
import { archiveTemplate, checkTemplate, refreshApproval, saveTemplate, submitForApproval, TemplateProblem, WHATSAPP_STATUS_LABEL, type TemplateInput } from "@/lib/communication/templates-admin";
import { isChannel } from "@/lib/messaging/channels";

export type TemplateState = { ok: boolean; message?: string; errors?: Record<string, string> } | null;

const uuid = /^[0-9a-f-]{36}$/;

async function fullAccess(action: "create" | "edit" | "archive") {
  const access = await commAction(action);
  if (!access.full) throw new TemplateProblem("Only the Principal and School Admin can change message templates.");
  return access;
}

function clean(raw: unknown): TemplateInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const channel = String(r.channel ?? "");
  if (!isChannel(channel)) return null;
  const texts = Array.isArray(r.texts) ? r.texts.slice(0, 8) : [];
  return {
    name: String(r.name ?? "").trim(),
    category: String(r.category ?? ""),
    channel,
    texts: texts.map((t) => {
      const x = (t ?? {}) as Record<string, unknown>;
      const subject = String(x.subject ?? "").trim();
      // DREAM TEAM adds DLT template IDs in the console, never here: undefined keeps the saved one while the text is unchanged.
      return { language: String(x.language ?? ""), subject: channel === "email" || channel === "app" ? subject || null : null, body: String(x.body ?? "").replace(/\r\n/g, "\n").trim(), dltTemplateId: channel === "sms" ? undefined : null };
    }),
  };
}

export async function saveTemplateAction(id: string | null, raw: unknown): Promise<TemplateState> {
  let access;
  try {
    access = await fullAccess(id ? "edit" : "create");
  } catch (e) {
    if (e instanceof TemplateProblem) return { ok: false, message: e.message };
    throw e;
  }
  const input = clean(raw);
  if (!input) return { ok: false, message: "Choose a channel." };
  const errors = checkTemplate(input);
  if (Object.keys(errors).length) return { ok: false, errors, message: Object.keys(errors).length === 1 ? Object.values(errors)[0] : `Please fix ${Object.keys(errors).length} things before saving.` };
  let saved;
  try {
    const ctx = access.current.ctx;
    saved = await withSchool(ctx, async (tx) => {
      const r = await saveTemplate(tx, ctx, id && uuid.test(id) ? id : null, input);
      const noDlt = input.channel === "sms" && (await tx.templateVersion.count({ where: { schoolId: ctx.schoolId, templateId: r.id, isCurrent: true, dltTemplateId: null } })) > 0;
      return { ...r, noDlt };
    });
  } catch (e) {
    if (e instanceof TemplateProblem) return { ok: false, message: e.message };
    throw e;
  }
  const noDlt = saved.noDlt;
  await flash({
    message: saved.changed.length ? `Template saved.${id ? " A new version was made for each changed language; messages already sent keep theirs." : ""}${noDlt ? " DREAM TEAM registers the new text on the DLT portal and adds its DLT template ID; SMS waits until then." : ""}` : "Nothing changed in the text, so no new version was made.",
    tone: noDlt ? "info" : "success",
  });
  revalidatePath("/communication/templates");
  redirect(`/communication/templates/${saved.id}`);
}

export async function archiveTemplateAction(id: string, archive: boolean): Promise<string | void> {
  if (!uuid.test(id)) return "This template was not found.";
  try {
    const access = await fullAccess("archive");
    const t = await withSchool(access.current.ctx, (tx) => archiveTemplate(tx, access.current.ctx, id, archive));
    await flash({ message: `"${t.name}" ${archive ? "archived. Automatic messages no longer use it" : "restored"}.`, tone: "success" });
  } catch (e) {
    if (e instanceof TemplateProblem) return e.message;
    throw e;
  }
  revalidatePath("/communication/templates");
}

export async function submitApprovalAction(versionId: string): Promise<string | void> {
  if (!uuid.test(versionId)) return "This version was not found.";
  try {
    const access = await fullAccess("edit");
    const status = await withSchool(access.current.ctx, (tx) => submitForApproval(tx, access.current.ctx, versionId));
    await flash({ message: `Sent for WhatsApp approval. Status: ${WHATSAPP_STATUS_LABEL[status]}.`, tone: status === "REJECTED" ? "danger" : "success" });
  } catch (e) {
    if (e instanceof TemplateProblem) return e.message;
    throw e;
  }
  revalidatePath("/communication/templates");
}

export async function refreshApprovalAction(templateId: string): Promise<string | void> {
  if (!uuid.test(templateId)) return "This template was not found.";
  try {
    const access = await fullAccess("edit");
    const n = await withSchool(access.current.ctx, (tx) => refreshApproval(tx, access.current.ctx, templateId));
    await flash({ message: n ? "WhatsApp approval status updated." : "No change yet. WhatsApp usually answers within a day.", tone: "info" });
  } catch (e) {
    if (e instanceof TemplateProblem) return e.message;
    throw e;
  }
  revalidatePath("/communication/templates");
}
