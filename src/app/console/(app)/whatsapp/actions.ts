"use server";

// WhatsApp settings actions. Owner only, checked on the server; each change
// writes an Activity Log line (src/lib/console/whatsapp.ts).

import { disconnectWhatsapp, refreshConsoleTemplates, saveWhatsapp, sendWhatsappTest, submitConsoleTemplates } from "@/lib/console/whatsapp";
import type { FormState } from "@/lib/forms";
import { consoleAct, str } from "../_lib/act";

export async function saveWhatsappAction(_p: FormState, fd: FormData) {
  return consoleAct("messaging", fd, (c) => saveWhatsapp(c.actor, { phoneNumberId: str(fd, "phoneNumberId"), businessAccountId: str(fd, "businessAccountId"), accessToken: str(fd, "accessToken"), language: str(fd, "language") }),
    (r) => `WhatsApp connected: ${r.words}.`);
}

export async function testWhatsappAction(_p: FormState, fd: FormData) {
  return consoleAct("messaging", fd, (c) => sendWhatsappTest(c.actor, str(fd, "mobile")),
    (r) => `Test message sent to ${r.to}. Check that phone’s WhatsApp.`);
}

export async function submitTemplatesAction(_p: FormState, fd: FormData) {
  return consoleAct("messaging", fd, (c) => submitConsoleTemplates(c.actor),
    (r) => (r.problems.length
      ? { message: `${r.sent} sent for approval. ${r.problems[0]}`, tone: r.sent ? "info" : "danger" }
      : `${r.sent} template${r.sent === 1 ? "" : "s"} sent to Meta for approval. Approval usually takes a few minutes to a day.`));
}

export async function refreshTemplatesAction(_p: FormState, fd: FormData) {
  return consoleAct("messaging", fd, () => refreshConsoleTemplates(),
    (r) => `${r.approved} of ${r.total} templates approved.`);
}

export async function disconnectWhatsappAction(_p: FormState, fd: FormData) {
  return consoleAct("messaging", fd, (c) => disconnectWhatsapp(c.actor),
    () => "WhatsApp disconnected. Console messages are not sent until it is connected again.");
}
