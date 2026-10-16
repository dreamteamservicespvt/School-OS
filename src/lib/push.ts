// Push alerts on staff phones and computers through the installable web app
// (00-global.md §4 rules 6 and 8), sent with Firebase Cloud Messaging.
//
// A push goes only when all three hold: DREAM TEAM has set the Firebase
// settings (FIREBASE_* below), the school has switched on Push alerts (School
// Feature "push-alerts", Message Settings), and the person ticked Push for that
// kind of notification in My profile. Each push carries the same link as the
// in-app notification. Nothing here ever stops the change that caused the
// notification: the push is a background job sent after the change is saved.
//
// Settings (from the hosting provider's secret store, never from the code):
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY: the
//     Firebase service account that sends pushes (server only).
//   FIREBASE_WEB_API_KEY, FIREBASE_WEB_APP_ID, FIREBASE_MESSAGING_SENDER_ID:
//     the Firebase web app the browser uses to get its push address.
//   FIREBASE_WEB_VAPID_KEY (optional): the Web Push certificate's public key
//     from Firebase, Cloud Messaging. Unset: Firebase's default key is used.
import "server-only";

import { createSign } from "node:crypto";
import type { SchoolContext, Tx } from "./db";
import { defineJob, enqueue } from "./jobs";
import { channelsForType } from "./notification-kinds";

export const PUSH_FEATURE = "push-alerts";
/** A browser not seen for this long is no longer pushed to (inferred: 60 days, like Firebase's own stale-token advice). */
export const PUSH_DEVICE_STALE_MS = 60 * 24 * 60 * 60 * 1000;

type ServiceAccount = { projectId: string; clientEmail: string; privateKey: string };

function serviceAccount(env: NodeJS.ProcessEnv = process.env): ServiceAccount | null {
  const projectId = env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = env.FIREBASE_CLIENT_EMAIL?.trim();
  // Secret stores often keep the key on one line with "\n" written out.
  const privateKey = env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  return projectId && clientEmail && privateKey ? { projectId, clientEmail, privateKey } : null;
}

export type PushWebConfig = { apiKey: string; projectId: string; messagingSenderId: string; appId: string; vapidKey: string | null };

/** What the browser needs to get its push address. None of it is secret; it is still kept out of the code. */
export function pushWebConfig(env: NodeJS.ProcessEnv = process.env): PushWebConfig | null {
  const apiKey = env.FIREBASE_WEB_API_KEY?.trim();
  const projectId = env.FIREBASE_PROJECT_ID?.trim();
  const messagingSenderId = env.FIREBASE_MESSAGING_SENDER_ID?.trim();
  const appId = env.FIREBASE_WEB_APP_ID?.trim();
  if (!apiKey || !projectId || !messagingSenderId || !appId) return null;
  return { apiKey, projectId, messagingSenderId, appId, vapidKey: env.FIREBASE_WEB_VAPID_KEY?.trim() || null };
}

/** Has DREAM TEAM set up Firebase for this deployment? */
export function pushConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(serviceAccount(env) && pushWebConfig(env));
}

/** Can people in this school choose Push? */
export async function pushOn(tx: Tx, ctx: SchoolContext): Promise<boolean> {
  if (!pushConfigured()) return false;
  const f = await tx.schoolFeature.findUnique({ where: { schoolId_featureKey: { schoolId: ctx.schoolId, featureKey: PUSH_FEATURE } }, select: { isOn: true } });
  return f?.isOn ?? false;
}

// ---- Google sign-in for the service account (OAuth 2.0 JWT bearer) ----

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

/** The signed request Google swaps for an access token. Exported for tests. */
export function serviceAccountAssertion(sa: Pick<ServiceAccount, "clientEmail" | "privateKey">, nowSec = Math.floor(Date.now() / 1000)): string {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: nowSec,
    exp: nowSec + 3600,
  }));
  const signature = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(sa.privateKey);
  return `${head}.${claims}.${b64url(signature)}`;
}

let cachedToken: { value: string; until: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.until > Date.now()) return cachedToken.value;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: serviceAccountAssertion(sa) }),
    signal: AbortSignal.timeout(6000),
  });
  const json = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error_description?: string } | null;
  if (!res.ok || !json?.access_token) throw new Error(`Firebase did not accept the service account: ${json?.error_description ?? res.status}`);
  // Renewed a minute early so a push never goes with an expiring token.
  cachedToken = { value: json.access_token, until: Date.now() + Math.max(60, (json.expires_in ?? 3600) - 60) * 1000 };
  return cachedToken.value;
}

// ---- Sending ----

export type PushAlert = { title: string; body: string; link: string; tag: string };

/** Only addresses inside School OS. */
export function safeLink(link: string): string {
  return link.startsWith("/") && !link.startsWith("//") && !link.includes("\\") ? link : "/notifications";
}

/**
 * The FCM message for one browser. Sent as data only, so public/push-sw.js
 * shows it the same way on every browser and opens the link on a tap.
 */
export function fcmMessage(token: string, a: PushAlert) {
  return {
    message: {
      token,
      data: { title: a.title.slice(0, 80), body: a.body.slice(0, 240), link: safeLink(a.link), tag: a.tag },
      webpush: { headers: { Urgency: "high", TTL: String(24 * 60 * 60) } },
    },
  };
}

export type PushResult = { ok: true } | { ok: false; gone: boolean; retryable: boolean; reason: string };

/** Plain words for FCM's answer. "gone" means the browser's push address no longer works. */
export function readFcmAnswer(status: number, body: unknown): PushResult {
  if (status >= 200 && status < 300) return { ok: true };
  const err = (body as { error?: { status?: string; message?: string; details?: { errorCode?: string }[] } } | null)?.error;
  const code = err?.details?.find((d) => d.errorCode)?.errorCode ?? err?.status ?? "";
  if (status === 404 || code === "UNREGISTERED") return { ok: false, gone: true, retryable: false, reason: "This browser no longer accepts push alerts." };
  if (code === "INVALID_ARGUMENT" && /token/i.test(err?.message ?? "")) return { ok: false, gone: true, retryable: false, reason: "This browser's push address is not valid." };
  if (status === 429 || status >= 500 || code === "UNAVAILABLE" || code === "INTERNAL" || code === "QUOTA_EXCEEDED") return { ok: false, gone: false, retryable: true, reason: "Firebase is busy. It will be tried again." };
  if (status === 401 || status === 403 || code === "SENDER_ID_MISMATCH" || code === "THIRD_PARTY_AUTH_ERROR") return { ok: false, gone: false, retryable: false, reason: "Firebase did not accept the School OS push settings." };
  return { ok: false, gone: false, retryable: false, reason: `Firebase did not send it: ${(err?.message ?? String(status)).slice(0, 160)}` };
}

export async function sendPush(token: string, a: PushAlert): Promise<PushResult> {
  const sa = serviceAccount();
  if (!sa) return { ok: false, gone: false, retryable: false, reason: "Push alerts are not set up." };
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.projectId)}/messages:send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await accessToken(sa)}` },
      body: JSON.stringify(fcmMessage(token, a)),
      signal: AbortSignal.timeout(6000),
    });
    if (res.status === 401) cachedToken = null;
    return readFcmAnswer(res.status, await res.json().catch(() => null));
  } catch (e) {
    return { ok: false, gone: false, retryable: true, reason: e instanceof Error ? e.message : "Could not reach Firebase." };
  }
}

// ---- Queueing from notify() ----

/** Queues the push for a new notification when the person chose Push for its kind. Safe to call twice. */
export async function queuePush(tx: Tx, ctx: SchoolContext, n: { id: string; userLoginId: string; type: string }) {
  if (!pushConfigured()) return null;
  const login = await tx.userLogin.findUnique({ where: { id: n.userLoginId }, select: { notificationPrefs: true } });
  if (!channelsForType(login?.notificationPrefs, n.type).includes("push")) return null;
  if (!(await pushOn(tx, ctx))) return null;
  const devices = await tx.pushDevice.count({ where: { schoolId: ctx.schoolId, userLoginId: n.userLoginId, archivedAt: null } });
  if (!devices) return null;
  return enqueue(tx, ctx, "push-send", `push:${n.id}`, { notificationId: n.id });
}

defineJob("push-send", "Push alert", async (tx, ctx, payload) => {
  const id = String(payload.notificationId ?? "");
  const n = await tx.notification.findUnique({ where: { id } });
  // Already read in the app, or done: no need to buzz the phone.
  if (!n || n.readAt || n.doneAt) return { sent: 0, skipped: "read" };
  const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { name: true } });
  const since = new Date(Date.now() - PUSH_DEVICE_STALE_MS);
  const devices = await tx.pushDevice.findMany({ where: { schoolId: ctx.schoolId, userLoginId: n.userLoginId, archivedAt: null, lastSeenAt: { gte: since } } });
  const alert: PushAlert = { title: school?.name ?? "School OS", body: n.text, link: `/api/v1/push/open/${n.id}`, tag: n.groupKey ?? n.id };
  let sent = 0;
  let retry: string | null = null;
  for (const d of devices) {
    const r = await sendPush(d.token, alert);
    if (r.ok) sent++;
    else if (r.gone) await tx.pushDevice.update({ where: { id: d.id }, data: { archivedAt: new Date() } });
    else if (r.retryable) retry = r.reason;
  }
  // Tried again later only when nothing reached the person and Firebase was busy.
  if (!sent && retry) throw new Error(retry);
  return { sent, devices: devices.length };
});
