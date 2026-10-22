import type { Metadata } from "next";
import { withSchool } from "@/lib/db";
import { commOfficePage } from "@/lib/communication/access";
import { channelSetups } from "@/lib/messaging/channels";
import { Banner } from "@/components/ui/banner";
import { ButtonLink } from "@/components/ui/button";
import { BackLink, RecordHead } from "@/components/ui/split";
import { whoOptions } from "../who-options";
import { FamiliesForm } from "./families-form";

export const metadata: Metadata = { title: "Send to existing families" };

export default async function SendFamiliesPage() {
  const access = await commOfficePage("create");
  const { current } = access;
  const data = await withSchool(current.ctx, async (tx) => ({ who: await whoOptions(tx, current.ctx, access.scope.campusId), setups: await channelSetups(tx, current.ctx) }));
  const channels = (["whatsapp", "sms"] as const).filter((c) => data.setups[c].isOn).map((c) => ({ value: c, label: c === "sms" ? "SMS" : "WhatsApp" }));
  return (
    <>
      <BackLink href="/communication/parent-link" label="Parent Link" />
      <RecordHead title="Send Parent Link to existing families"
        sub={<span className="text-[14px] text-ink3">Makes a personal link for each guardian with no active link and sends it to their registered mobile.</span>} />
      {channels.length === 0 ? (
        <Banner tone="warn" title="Neither WhatsApp nor SMS is switched on." action={<ButtonLink href="/settings/messaging" size="sm" variant="secondary">Open settings</ButtonLink>}>
          Links cannot be sent. Switch one on in Settings, SMS, WhatsApp &amp; Email.
        </Banner>
      ) : (
        <FamiliesForm who={data.who} channels={channels} />
      )}
    </>
  );
}
