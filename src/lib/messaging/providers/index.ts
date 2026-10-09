// Picks the adapter for a channel from the school's setup. Test mode, or no
// real provider chosen, always means the Sandbox: nothing is sent.
import type { ChannelSetup } from "../channels";
import { msg91Provider } from "./msg91";
import { sandboxProvider } from "./sandbox";
import { smtpProvider } from "./smtp";
import type { Provider } from "./types";
import { whatsappProvider } from "./whatsapp";

export function providerFor(setup: ChannelSetup, secrets: Record<string, string>): Provider {
  if (setup.environment !== "live") return sandboxProvider;
  const p = { config: setup.config, secrets };
  if (setup.channel === "sms" && setup.provider === "msg91") return msg91Provider(p);
  if (setup.channel === "whatsapp" && setup.provider === "meta-cloud") return whatsappProvider(p);
  if (setup.channel === "email" && setup.provider === "smtp") return smtpProvider(p);
  return sandboxProvider;
}

export type { Outgoing, Provider, SendResult } from "./types";
