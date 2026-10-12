import type { Metadata } from "next";
import { withSchool } from "@/lib/db";
import { commOfficePage } from "@/lib/communication/access";
import { channelSetups } from "@/lib/messaging/channels";
import { PageHeader } from "@/components/shell/page-header";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { ParentLinkNav } from "../sub-nav";
import { whoOptions } from "../who-options";
import { FamiliesForm } from "./families-form";

export const metadata: Metadata = { title: "Send to existing families" };

export default async function SendFamiliesPage() {
  const access = await commOfficePage("create");
  const { current } = access;
  const data = await withSchool(current.ctx, async (tx) => ({ who: await whoOptions(tx, current.ctx), setups: await channelSetups(tx, current.ctx) }));
  const channels = (["whatsapp", "sms"] as const).filter((c) => data.setups[c].isOn).map((c) => ({ value: c, label: c === "sms" ? "SMS" : "WhatsApp" }));
  return (
    <>
      <PageHeader title="Parent Link" href="/communication/parent-link/send" userId={current.user.id} />
      <ParentLinkNav on="send" />
      <h2 className="mb-1 text-lg font-semibold">Send to existing families</h2>
      <p className="mb-4 text-ink-2">Makes a personal link for each guardian who has no active link, and sends it to their registered mobile. Guardians who already have a link are left out; use Resend on their link instead.</p>
      {channels.length === 0 ? (
        <Alert tone="warning" action={<ButtonLink href="/settings/messaging" size="sm">Open settings</ButtonLink>}>Neither WhatsApp nor SMS is switched on, so links cannot be sent. Switch one on in Settings, SMS, WhatsApp &amp; Email.</Alert>
      ) : (
        <FamiliesForm who={data.who} channels={channels} />
      )}
    </>
  );
}
