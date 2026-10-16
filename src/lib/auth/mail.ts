// Email from School OS (one-time codes and invites), through the SMTP server
// set in the environment: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and
// MAIL_FROM. Nothing about the mail server is ever kept in the code.
import nodemailer, { type Transporter } from "nodemailer";

export function mailIsSetUp() {
  return Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM);
}

let transport: Transporter | null = null;

function smtp() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 587);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transport;
}

/** Sends one plain email. Throws if the mail server refuses or cannot be reached. */
export async function sendMail(to: string, subject: string, text: string) {
  await smtp().sendMail({ from: process.env.MAIL_FROM, to, subject, text });
}
