-- Translation of typed messages into each parent's language (gap list G40;
-- 11-communication.md, Send Message, Translation). The language versions a
-- sender checked and confirmed are kept on the message for Message History:
-- [{ language, text, title, edited }]. Every existing message starts with
-- none, which is what it was: everyone got the text as typed.
ALTER TABLE "message" ADD COLUMN "translations" JSONB NOT NULL DEFAULT '[]';
