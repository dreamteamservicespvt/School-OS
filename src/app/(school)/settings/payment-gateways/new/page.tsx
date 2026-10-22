import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { appOrigin } from "@/lib/origin";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { GatewayForm } from "../gateway-form";
import { providerInfo } from "../providers-info";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Add a gateway" };

export default async function NewGatewayPage() {
  const { current } = await requireSettingsPage("payment-gateways", "create");
  const origin = await appOrigin();
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm"><Link href="/settings/payment-gateways" className="text-brand-text hover:underline"><Words k="Payment Gateways" /></Link></nav>
      <PageHeader title="Add a gateway" href="/settings/payment-gateways/new" userId={current.user.id} />
      <Card className="max-w-3xl">
        <CardBody>
          <GatewayForm mode="new" id={randomUUID()} providers={providerInfo()}
            webhookBase={`${origin}/api/v1/payments/razorpay/webhook?s=${current.school.id}`} />
        </CardBody>
      </Card>
    </>
  );
}
