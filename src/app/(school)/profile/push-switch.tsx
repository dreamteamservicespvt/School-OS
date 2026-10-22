"use client";

// Push alerts on this phone or computer (00-global.md §4 rules 6 and 8, §6).
// Switching on asks the browser's permission, registers public/push-sw.js and
// gets this browser's push address from Firebase Cloud Messaging, which the
// server keeps as a Push Device. The Firebase script is loaded only when a
// person switches push on here, never on other pages.

import { useEffect, useState, useSyncExternalStore } from "react";
import { Switch } from "@/components/ui/controls";
import { Toast } from "@/components/ui/toast";
import { removePushDevice, savePushDevice } from "./actions";
import { Words } from "@/lib/i18n/client";

export type PushWebConfig = { apiKey: string; projectId: string; messagingSenderId: string; appId: string; vapidKey: string | null };

const SW_URL = "/push-sw.js";
const SW_SCOPE = "/push-alerts/";
const FLAG = "sos-push-token";

function readFlag(): string | null {
  try { return localStorage.getItem(FLAG); } catch { return null; }
}
// The switch reads the browser itself; anything that changes it says so here.
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const changed = () => listeners.forEach((cb) => cb());

function writeFlag(v: string | null) {
  try { if (v) localStorage.setItem(FLAG, v); else localStorage.removeItem(FLAG); } catch { /* private window: push still works, the switch just forgets */ }
  changed();
}

type Support = "ok" | "no" | "ios-home" | "blocked";

function support(): Support {
  if (typeof window === "undefined") return "no";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return "ios-home";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "no";
  if (Notification.permission === "denied") return "blocked";
  return "ok";
}

async function pushToken(config: PushWebConfig): Promise<string> {
  const [{ initializeApp, getApps }, { getMessaging, getToken, isSupported }] = await Promise.all([import("firebase/app"), import("firebase/messaging")]);
  if (!(await isSupported())) throw new Error("This browser cannot get push alerts.");
  const app = getApps().find((a) => a.name === "school-os-push") ?? initializeApp({ apiKey: config.apiKey, projectId: config.projectId, messagingSenderId: config.messagingSenderId, appId: config.appId }, "school-os-push");
  const registration = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
  await navigator.serviceWorker.ready.catch(() => undefined);
  return getToken(getMessaging(app), { serviceWorkerRegistration: registration, ...(config.vapidKey ? { vapidKey: config.vapidKey } : {}) });
}

async function dropToken() {
  try {
    const [{ getApps }, { getMessaging, deleteToken }] = await Promise.all([import("firebase/app"), import("firebase/messaging")]);
    const app = getApps().find((a) => a.name === "school-os-push");
    if (app) await deleteToken(getMessaging(app));
  } catch { /* the server copy is archived anyway */ }
  const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE).catch(() => undefined);
  await reg?.unregister().catch(() => undefined);
}

export function PushSwitch({ config, schoolAllows }: { config: PushWebConfig | null; schoolAllows: boolean }) {
  const state = useSyncExternalStore(subscribe, support, () => "no" as Support);
  const on = useSyncExternalStore(subscribe, () => Boolean(readFlag()) && support() === "ok" && Notification.permission === "granted", () => false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ n: number; message: string; tone: "success" | "info" | "danger" } | null>(null);
  const say = (message: string, tone: "success" | "info" | "danger") => setToast((t) => ({ n: (t?.n ?? 0) + 1, message, tone }));

  // Firebase asks for the address to be refreshed now and then; opening My profile does it quietly.
  useEffect(() => {
    const saved = readFlag();
    if (!saved || support() !== "ok" || Notification.permission !== "granted" || !config || !schoolAllows) return;
    pushToken(config).then((t) => { if (t !== saved) writeFlag(t); return savePushDevice(t); }).catch(() => undefined);
  }, [config, schoolAllows]);

  if (!config || !schoolAllows) return null;

  const flip = async (next: boolean) => {
    setBusy(true);
    try {
      if (next) {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          changed();
          say("Allow notifications for School OS in the browser to get push alerts.", "info");
          return;
        }
        const token = await pushToken(config);
        const r = await savePushDevice(token);
        if (!r?.ok) { say(r?.message ?? "Push alerts could not be switched on.", "danger"); return; }
        writeFlag(token);
        say(r.message, "success");
      } else {
        const token = readFlag();
        if (token) await removePushDevice(token);
        await dropToken();
        writeFlag(null);
        say("Push alerts are off for this device", "success");
      }
    } catch {
      say("This browser could not switch on push alerts. Try again, or use Chrome, Edge or Firefox.", "danger");
    } finally {
      setBusy(false);
    }
  };

  const help =
    state === "ios-home" ? "On iPhone and iPad, add School OS to the Home Screen first (Share, then Add to Home Screen), then open it from there. Needs iOS 16.4 or later."
    : state === "blocked" ? "Notifications are blocked for School OS in this browser. Allow them in the browser's site settings, then switch this on."
    : state === "no" ? "This browser cannot get push alerts. Use Chrome, Edge, Firefox or Safari."
    : on ? "Alerts for the kinds ticked under Push reach this device, even when School OS is closed."
    : "Get alerts for the kinds ticked under Push on this phone or computer, even when School OS is closed.";

  return (
    <div className="flex items-start gap-3 px-5 py-3.5 border-t border-line">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[14px]"><Words k="Push alerts on this device" /></p>
        <p className="text-[12.5px] text-ink3">{help}</p>
      </div>
      <Switch on={on} onChange={(v) => void flip(v)} label="Push alerts on this device" disabled={busy || state !== "ok"} />
      {toast && <Toast key={toast.n} flash={{ message: toast.message, tone: toast.tone }} />}
    </div>
  );
}
