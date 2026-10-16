import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, FileText, KeyRound, MessageCircle, PlugZap, Send } from "lucide-react";
import { requireConsolePage } from "@/lib/console/current";
import { whatsappView, type TemplateState } from "@/lib/console/whatsapp";
import { appUrl } from "@/lib/console/outbox";
import { formatDate, formatTime } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { PageHead } from "@/components/ui/display";
import { Col, Split } from "@/components/ui/blocks";
import { SheetForm } from "@/components/ui/url-sheet";
import { SText } from "@/components/ui/sheet-fields";
import { disconnectWhatsappAction, refreshTemplatesAction, saveWhatsappAction, submitTemplatesAction, testWhatsappAction } from "./actions";

export const metadata: Metadata = { title: "WhatsApp settings" };

const BASE = "/console/whatsapp";

function statusPill(s: TemplateState | null) {
  if (!s) return <Pill tone="neutral">Not sent</Pill>;
  switch (s.status) {
    case "APPROVED": return <Pill tone="ok" dot>Approved</Pill>;
    case "PENDING": case "IN_APPEAL": return <Pill tone="warn" dot>Waiting for Meta</Pill>;
    case "REJECTED": return <Pill tone="bad" dot>Rejected</Pill>;
    case "PAUSED": case "DISABLED": return <Pill tone="bad" dot>{s.status === "PAUSED" ? "Paused" : "Disabled"}</Pill>;
    case "NOT_SENT": return <Pill tone="bad" dot>Could not send</Pill>;
    default: return <Pill tone="neutral">{s.status.toLowerCase()}</Pill>;
  }
}

export default async function WhatsappPage({ searchParams }: { searchParams: Promise<{ act?: string }> }) {
  await requireConsolePage("messaging");
  const { act } = await searchParams;
  const w = await whatsappView();
  const approved = w.templates.filter((t) => t.state?.status === "APPROVED").length;
  const fromConsole = w.from === "console";
  const rows: [string, React.ReactNode][] = [
    ["Phone number ID", w.phoneNumberId ? <span key="p" className="font-mono text-[12.5px]">{w.phoneNumberId}</span> : "Not set"],
    ["WhatsApp Business account ID", w.businessAccountId ? <span key="b" className="font-mono text-[12.5px]">{w.businessAccountId}</span> : "Not set"],
    ["Access token", w.tokenShown ?? "Not set"],
    ["Template language", <span key="l" className="font-mono text-[12.5px]">{w.language}</span>],
    ["Last check", w.testedAt ? `${w.testResult ?? ""} · ${formatDate(w.testedAt)} at ${formatTime(w.testedAt)}` : "Never"],
  ];
  if (w.updatedByName && w.updatedAt) rows.push(["Last changed", `${w.updatedByName} · ${formatDate(w.updatedAt)} at ${formatTime(w.updatedAt)}`]);
  return (
    <div>
      <PageHead title="WhatsApp settings" sub="DREAM TEAM’s own WhatsApp number for console messages: School Admin invites, one-time codes, team invites, invoices and notices. Schools connect their own WhatsApp in their Settings." />
      <Split side={380}>
        <Col>
          <Card>
            <CardHeader title="Connection" icon={PlugZap} divided
              action={w.connected ? <Pill tone="ok" dot>{fromConsole ? "Connected" : "Connected on the server"}</Pill> : <Pill tone="bad" dot>Not connected</Pill>} />
            <div className="p-5 flex flex-col gap-4">
              {!w.connected && <Alert tone="warning" title="Console messages are not going out">Until WhatsApp is connected, invites and codes are not sent to anyone. Connect it below.</Alert>}
              {w.from === "environment" && <Alert tone="info">This server uses the CONSOLE_WHATSAPP_* settings. Connect here to manage it from the console instead; what you save here is used first.</Alert>}
              <dl className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-x-4 gap-y-2.5 text-[14px]">
                {rows.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-ink3">{k}</dt>
                    <dd className="text-ink min-w-0 break-words">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex gap-2 flex-wrap">
                <Link href={`${BASE}?act=connect`} scroll={false} className={buttonClass(w.connected ? "secondary" : "primary")}><KeyRound size={17} aria-hidden="true" />{fromConsole ? "Change connection" : "Connect WhatsApp"}</Link>
                {w.connected && <Link href={`${BASE}?act=test`} scroll={false} className={buttonClass("secondary")}><Send size={17} aria-hidden="true" />Send a test message</Link>}
                {fromConsole && <Link href={`${BASE}?act=disconnect`} scroll={false} className={buttonClass("ghost")}>Disconnect</Link>}
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Message templates" description={`${approved} of ${w.templates.length} approved by Meta`} icon={FileText} divided
              action={fromConsole ? (
                <div className="flex gap-2">
                  {approved < w.templates.length && <Link href={`${BASE}?act=submit`} scroll={false} className={buttonClass("primary", "sm")}>Send for approval</Link>}
                  <Link href={`${BASE}?act=refresh`} scroll={false} className={buttonClass("secondary", "sm")}>Check approval</Link>
                </div>
              ) : null} />
            <p className="px-5 pt-4 text-[13.5px] text-ink2">WhatsApp lets a business start a chat only with a template Meta has approved. Until a template is approved, its message goes as plain text, which reaches only people who messaged this number in the last 24 hours.</p>
            <ul className="px-5 pb-4 pt-2 flex flex-col">
              {w.templates.map((t) => (
                <li key={t.purpose} className="py-3 border-t border-line/70 first:border-t-0 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <b className="font-semibold text-[14px]">{t.label}</b>
                    <span className="font-mono text-[12px] text-ink3">{t.name}</span>
                    <span className="ml-auto">{statusPill(t.state)}</span>
                  </div>
                  <p className="text-[13px] text-ink2 whitespace-pre-line leading-snug">{t.body || "{{1}} is your verification code. For your security, do not share this code. This code expires in 10 minutes. [Copy code]"}</p>
                  {t.state?.note && <p className="text-[12.5px] text-bad">{t.state.note}</p>}
                </li>
              ))}
            </ul>
          </Card>
        </Col>
        <Col>
          <Card>
            <CardHeader title="How to connect" icon={MessageCircle} divided />
            <ol className="p-5 flex flex-col gap-3 text-[13.5px] text-ink2 leading-snug list-decimal pl-9">
              <li>Open <b className="text-ink">developers.facebook.com</b>, make a <b className="text-ink">Business</b> app and add the <b className="text-ink">WhatsApp</b> product to it.</li>
              <li>In WhatsApp, API Setup, add DREAM TEAM’s business phone number and verify it. Copy its <b className="text-ink">Phone number ID</b> and the <b className="text-ink">WhatsApp Business account ID</b>.</li>
              <li>In Meta Business Settings, Users, System users, add a system user with the <b className="text-ink">Admin</b> role, give it the app and the WhatsApp account, and generate a token with <span className="font-mono text-[12px]">whatsapp_business_messaging</span> and <span className="font-mono text-[12px]">whatsapp_business_management</span>. Choose <b className="text-ink">Never</b> expire.</li>
              <li>Press <b className="text-ink">Connect WhatsApp</b> here and paste the three values. School OS checks them with Meta before saving.</li>
              <li>Press <b className="text-ink">Send for approval</b>. When the templates show Approved, invites and codes reach any WhatsApp number.</li>
              <li>Add a payment method in Meta Business Settings, WhatsApp accounts, so messages beyond the free ones are not stopped.</li>
            </ol>
          </Card>
          <Card>
            <CardHeader title="Kept safe" icon={BadgeCheck} divided />
            <ul className="p-5 flex flex-col gap-2 text-[13.5px] text-ink2 leading-snug">
              <li>The access token is stored encrypted and is never shown again, only its last 4 characters.</li>
              <li>Only the Owner sees this page. Every change goes in the Activity Log.</li>
              <li>Links and codes are never kept in the console’s message record.</li>
              <li>Messages link to <span className="font-mono text-[12px]">{appUrl().replace(/^https?:\/\//, "")}</span>.</li>
            </ul>
          </Card>
        </Col>
      </Split>
      {act === "connect" && (
        <SheetForm title={fromConsole ? "Change WhatsApp connection" : "Connect WhatsApp"} sub="Checked with Meta before it is saved" closeHref={BASE} action={saveWhatsappAction} submitLabel="Check and save" pendingText="Checking with Meta…">
          <SText name="phoneNumberId" label="Phone number ID" required inputMode="numeric" start={w.phoneNumberId ?? ""} help="From WhatsApp, API Setup. Digits only; this is not the phone number." />
          <SText name="businessAccountId" label="WhatsApp Business account ID" inputMode="numeric" start={w.businessAccountId ?? ""} help="Needed to send templates for approval." />
          <SText name="accessToken" label="Access token" type="password" autoComplete="off" required={!fromConsole} help={fromConsole ? "Leave empty to keep the saved token." : "A permanent system user token."} />
          <SText name="language" label="Template language" start={w.language} help="en for English. Must match the language the templates are approved in." />
        </SheetForm>
      )}
      {act === "test" && w.connected && (
        <SheetForm title="Send a test message" sub="Meta’s ready-made hello_world message" closeHref={BASE} action={testWhatsappAction} submitLabel="Send test" pendingText="Sending…">
          <SText name="mobile" label="WhatsApp mobile number" required inputMode="tel" help="10 digits. While the Meta app is in test mode, the number must be added as a recipient in API Setup." />
        </SheetForm>
      )}
      {act === "submit" && fromConsole && (
        <SheetForm title="Send templates for approval" sub={`${w.templates.length - approved} to send to Meta`} closeHref={BASE} action={submitTemplatesAction} submitLabel="Send for approval" pendingText="Sending to Meta…">
          <p className="text-[14px] text-ink2">Each template not yet approved or waiting goes to Meta for review, in the language <span className="font-mono">{w.language}</span>. Meta usually answers within minutes, at most a day. Come back and press Check approval.</p>
        </SheetForm>
      )}
      {act === "refresh" && fromConsole && (
        <SheetForm title="Check approval" sub="Asks Meta for each template’s status" closeHref={BASE} action={refreshTemplatesAction} submitLabel="Check now" pendingText="Asking Meta…">
          <p className="text-[14px] text-ink2">An approved template is used straight away for the next message.</p>
        </SheetForm>
      )}
      {act === "disconnect" && fromConsole && (
        <SheetForm title="Disconnect WhatsApp" sub="Console messages stop" closeHref={BASE} action={disconnectWhatsappAction} submitLabel="Disconnect" submitVariant="danger" pendingText="Disconnecting…">
          <p className="text-[14px] text-ink2">The saved access token is wiped. Invites and codes will not be sent until WhatsApp is connected again.</p>
        </SheetForm>
      )}
    </div>
  );
}
