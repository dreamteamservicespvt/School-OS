import "server-only";

import { PROVIDERS, TYPE_WORDS } from "@/lib/payments/providers";
import type { ProviderInfo } from "./gateway-form";

/** Providers that have a webhook route in School OS. */
export const WEBHOOK_PROVIDERS = new Set(["razorpay"]);

/** What the browser form needs to know about each provider (no patterns or secrets). */
export function providerInfo(): ProviderInfo[] {
  return PROVIDERS.map((p) => ({
    key: p.key,
    name: p.name,
    typeWords: p.type === "online" ? TYPE_WORDS.online : TYPE_WORDS[p.type],
    fields: p.fields.map((f) => ({ key: f.key, label: f.label, secret: f.secret, help: f.help, patternHelp: f.patternHelp })),
    webhookSecret: p.webhookSecret,
    dashboardHelp: p.dashboardHelp,
    hasWebhook: WEBHOOK_PROVIDERS.has(p.key),
  }));
}
