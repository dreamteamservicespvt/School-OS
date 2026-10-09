// Payment gateway providers a school can connect (20-settings.md, Payment
// Gateways). Each says which details it needs; secret ones are encrypted and
// never shown again. More can be added here by DREAM TEAM SERVICES.

export type ProviderField = {
  key: string;
  label: string;
  /** Secrets are encrypted, never shown again, and only the last 4 characters are shown. */
  secret: boolean;
  help?: string;
  pattern?: RegExp;
  patternHelp?: string;
};

export type Provider = {
  key: string;
  name: string;
  type: "online" | "cash-deposit" | "pos";
  /** Can School OS ask the provider itself whether the details work? */
  liveCheck: boolean;
  /** The field shown in full in the list (a public id). */
  publicField?: string;
  fields: ProviderField[];
  /** Webhook secret for confirmations the provider sends later. */
  webhookSecret?: { label: string; help: string };
  dashboardHelp: string;
};

export const PROVIDERS: readonly Provider[] = [
  {
    key: "razorpay", name: "Razorpay", type: "online", liveCheck: true, publicField: "keyId",
    fields: [
      { key: "keyId", label: "Key ID", secret: false, pattern: /^rzp_(test|live)_[A-Za-z0-9]{8,}$/, patternHelp: "A Key ID starts with rzp_test_ or rzp_live_.", help: "Razorpay Dashboard, Account & Settings, API Keys." },
      { key: "keySecret", label: "Key Secret", secret: true, help: "Shown by Razorpay only once, when the key is made." },
    ],
    webhookSecret: { label: "Webhook secret", help: "The secret you typed when adding the webhook address below in Razorpay (Account & Settings, Webhooks). Choose the events payment.captured, payment.failed and order.paid." },
    dashboardHelp: "Razorpay Dashboard: Account & Settings, then API Keys and Webhooks.",
  },
  {
    key: "phonepe", name: "PhonePe", type: "online", liveCheck: false, publicField: "merchantId",
    fields: [
      { key: "merchantId", label: "Merchant ID", secret: false },
      { key: "saltKey", label: "Salt key", secret: true },
      { key: "saltIndex", label: "Salt index", secret: false, pattern: /^\d{1,3}$/, patternHelp: "The salt index is a number, usually 1." },
    ],
    dashboardHelp: "PhonePe Business dashboard, Developer settings.",
  },
  {
    key: "cashfree", name: "Cashfree", type: "online", liveCheck: false, publicField: "appId",
    fields: [
      { key: "appId", label: "App ID", secret: false },
      { key: "secretKey", label: "Secret key", secret: true },
    ],
    webhookSecret: { label: "Webhook secret", help: "From Cashfree, Developers, Webhooks." },
    dashboardHelp: "Cashfree Merchant dashboard, Developers, API Keys.",
  },
  {
    key: "easebuzz", name: "Easebuzz", type: "online", liveCheck: false, publicField: "merchantKey",
    fields: [
      { key: "merchantKey", label: "Merchant key", secret: false },
      { key: "salt", label: "Salt", secret: true },
    ],
    dashboardHelp: "Easebuzz dashboard, Settings, API Keys.",
  },
  {
    key: "payu", name: "PayU", type: "online", liveCheck: false, publicField: "merchantKey",
    fields: [
      { key: "merchantKey", label: "Merchant key", secret: false },
      { key: "salt", label: "Salt", secret: true },
    ],
    dashboardHelp: "PayU dashboard, Developers, Key and Salt.",
  },
  {
    key: "paytm", name: "Paytm", type: "online", liveCheck: false, publicField: "mid",
    fields: [
      { key: "mid", label: "Merchant ID (MID)", secret: false },
      { key: "merchantKey", label: "Merchant key", secret: true },
      { key: "website", label: "Website name", secret: false, help: "WEBSTAGING for test, DEFAULT for live, unless Paytm gave you another." },
    ],
    dashboardHelp: "Paytm for Business dashboard, Developer Settings, API Keys.",
  },
  {
    key: "sabpaisa", name: "SabPaisa", type: "online", liveCheck: false, publicField: "clientCode",
    fields: [
      { key: "clientCode", label: "Client code", secret: false },
      { key: "username", label: "Username", secret: false },
      { key: "password", label: "Password", secret: true },
      { key: "authKey", label: "Auth key", secret: true },
      { key: "authIv", label: "Auth IV", secret: true },
    ],
    dashboardHelp: "Sent by SabPaisa when the account is opened.",
  },
  {
    key: "hdfc-smartgateway", name: "HDFC SmartGateway", type: "online", liveCheck: false, publicField: "merchantId",
    fields: [
      { key: "merchantId", label: "Merchant ID", secret: false },
      { key: "apiKey", label: "API key", secret: true },
    ],
    webhookSecret: { label: "Webhook password", help: "The password set for webhooks in the SmartGateway dashboard." },
    dashboardHelp: "HDFC SmartGateway dashboard, Settings, Security.",
  },
  {
    key: "stripe", name: "Stripe", type: "online", liveCheck: false, publicField: "publishableKey",
    fields: [
      { key: "publishableKey", label: "Publishable key", secret: false, pattern: /^pk_(test|live)_/, patternHelp: "A publishable key starts with pk_test_ or pk_live_." },
      { key: "secretKey", label: "Secret key", secret: true, pattern: /^(sk|rk)_(test|live)_/, patternHelp: "A secret key starts with sk_test_ or sk_live_." },
    ],
    webhookSecret: { label: "Webhook signing secret", help: "Starts with whsec_, from Stripe, Developers, Webhooks." },
    dashboardHelp: "Stripe Dashboard, Developers, API keys.",
  },
  {
    key: "pos", name: "POS (card machine)", type: "pos", liveCheck: false, publicField: "terminalId",
    fields: [
      { key: "terminalId", label: "Terminal ID", secret: false },
      { key: "bankName", label: "Bank", secret: false },
    ],
    dashboardHelp: "Printed on the card machine or its set-up letter.",
  },
  {
    key: "cash-deposit", name: "Cash or cash deposit", type: "cash-deposit", liveCheck: false, publicField: "bankName",
    fields: [
      { key: "bankName", label: "Bank", secret: false },
      { key: "accountName", label: "Account name", secret: false },
    ],
    dashboardHelp: "Cash and cash deposits need no connection. Payments are verified in Fee Management.",
  },
];

export function findProvider(key: string) {
  return PROVIDERS.find((p) => p.key === key);
}

export const TYPE_WORDS: Record<Provider["type"], string> = { online: "Online", "cash-deposit": "Cash deposit", pos: "Card machine" };
