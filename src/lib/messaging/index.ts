// ─────────────────────────────────────────────────────────────────────────────
// Communication's messaging API. Every message to parents, students and staff
// goes through here; no module calls a provider directly (docs/BUILDING.md §5).
//
// 1. A message a person sends, or one-off software messages:
//
//      import { sendMessage } from "@/lib/messaging";
//      await withSchool(ctx, async (tx) => {
//        const r = await sendMessage(tx, ctx, {
//          to: { guardiansOf: [studentId] },        // or guardianIds, staffIds, studentIds,
//                                                   // or kinds + classIds/sectionIds/roleKeys
//          channels: "preferred",                   // per person: WhatsApp, else SMS, email, app; or ["sms", "app"]
//          templates: { whatsapp: templateId },     // per channel; SMS needs one with a DLT ID (rule 34)
//          text: "Typed text with {student_name}",  // for channels without a template
//          values: { due_amount: "₹12,500" },       // blanks for everyone
//          perStudent: { [studentId]: { ... } },    // blanks per child (one message per child)
//          trigger: "Payment link", source: { type: "Payment Link", id },
//          idempotencyKey: `payment-link:${id}`,    // the same key never sends twice
//        });
//        // r = { messageId, queued, people, skipped: [{ reason, count, names }], cost, scheduled }
//      });
//
//    It resolves the people (main contact or all guardians, opted-out parents
//    skipped unless emergency: true, the sender's scope applied, duplicates by
//    phone dropped), picks each person's language version of the template,
//    fills the blanks (a person with a missing blank is skipped and listed;
//    single: true blocks instead), checks credits (blocked when short, or
//    onNoCredits: "fail" to record failures), and saves one Message with one
//    Message Recipient per person and channel in YOUR transaction. Delivery
//    happens in the background job "messaging:deliver" (safe to run twice).
//    When no channel can carry it to someone, the preview says so and the
//    person is kept as Failed "Not sent: <why>"; when that is everyone, the
//    send is refused, or recorded as not sent with onNobody: "record" (for
//    messages the software sends by itself, so they show as not delivered).
//    Use planMessage() with the same input for a preview (count, cost, skips)
//    without saving anything.
//
// 2. An automatic message (absence, fee due, fee paid, results, PTM, birthday...):
//
//      import { sendAutomatic } from "@/lib/messaging";
//      await sendAutomatic(tx, ctx, {
//        rule: "absence",                                         // see RULES in automatic.ts
//        event: { key: `attendance:${date}:${studentId}`, label: `Absent on ${formatDate(day)}` },
//        to: { guardiansOf: [studentId] },
//        perStudent: { [studentId]: { date: formatDate(day) } },
//      });
//
//    The rule's on/off switch, template and channels come from Message
//    Settings; it never sends the same event to the same person twice, uses
//    SMS backup for fee, attendance and result messages when the school has it
//    on, and writes the automation log. Returns { status: "sent" | "off" | ... }.
//
// 3. Delivery status for a module's own history (e.g. reminder history in
//    Defaulters): read Message where sourceType/sourceId is your record, and its
//    MessageRecipient rows (status Queued, Sending, Sent, Delivered, Read, Failed).
//
// Providers: Sandbox (test mode, the default: nothing leaves School OS and the
// text shows in Message History), MSG91 for SMS, Meta WhatsApp Cloud API, and
// SMTP email. Keys are kept encrypted in Messaging Channel.
// ─────────────────────────────────────────────────────────────────────────────
import "server-only";

export { sendMessage, planMessage, recordSend, MessagingProblem, skippedWords, notSentWords, NOT_SENT, MAX_TEXT, type SendInput, type SendResult, type Plan, type PlannedRow, type NotSentRow, type SkipGroup } from "./send";
export { sendAutomatic, RULES, ruleStates, type AutomaticInput, type AutomaticResult } from "./automatic";
export { cancelScheduled, retryFailed, applyStatus } from "./deliver";
export { CHANNELS, CHANNEL_LABEL, type Channel } from "./channels";
export type { AudienceRule } from "./recipients";
export { ensureReadyTemplates, templateByKey } from "./templates";
