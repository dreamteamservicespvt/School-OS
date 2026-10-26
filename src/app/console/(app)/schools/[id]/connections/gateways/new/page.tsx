import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireConsolePage } from "@/lib/console/current";
import { withConsoleSchool } from "@/lib/db";
import { appUrl } from "@/lib/parent-link/token";
import { BackLink } from "@/components/console/bits";
import { Card, CardBody } from "@/components/ui/card";
import { GatewayForm } from "../gateway-form";
import { providerInfo } from "../providers-info";

export const metadata: Metadata = { title: "Add a payment gateway" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewGatewayPage({ params }: { params: Promise<{ id: string }> }) {
  await requireConsolePage("connect");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const school = await withConsoleSchool(id, (tx) => tx.school.findUnique({ where: { id }, select: { id: true, name: true } }));
  if (!school) notFound();
  return (
    <div className="space-y-5">
      <div>
        <BackLink href={`/console/schools/${id}/connections#gateways`} label="Connections" extra={school.name} />
        <h1 className="font-display text-2xl font-bold">Add a payment gateway</h1>
        <p className="mt-1 max-w-prose text-ink2">
          For {school.name}. Use the keys from the school’s own Razorpay account. A new gateway starts switched off; test it, then switch it on. The school sees it in Settings, Payment Gateways and chooses which classes use it in Fee Settings.
        </p>
      </div>
      <Card className="max-w-3xl">
        <CardBody>
          <GatewayForm schoolId={id} mode="new" id={randomUUID()} providers={providerInfo()}
            webhookBase={`${appUrl()}/api/v1/payments/razorpay/webhook?s=${id}`} />
        </CardBody>
      </Card>
    </div>
  );
}
