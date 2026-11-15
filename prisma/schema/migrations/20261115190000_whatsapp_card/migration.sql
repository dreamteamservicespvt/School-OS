-- WhatsApp cards (docs/design/whatsapp-messages.md, 15-11-2026): a WhatsApp
-- template version can carry a header (text, or the fee receipt PDF as a
-- document), a footer and buttons (a link to the parent's own Parent Link,
-- receipt or invite, or the school's phone), and Meta's MARKETING category for
-- birthday wishes. Also, once it is sent for approval, the exact header and
-- buttons Meta was given, so every message is sent with the same parts.
--
-- One nullable JSON column: every existing version has none and keeps sending
-- exactly as before (plain body, the old "Open receipt" line trick). Existing
-- schools' untouched ready templates get the card as a NEW version through
-- Message Templates, "Make N templates ready for WhatsApp"; the last approved
-- version keeps sending until WhatsApp approves the new one. The table already
-- has school_id, row-level security, its policy and grants; a new column is
-- covered by them.

-- AlterTable
ALTER TABLE "template_version" ADD COLUMN "whatsapp_card" JSONB;
