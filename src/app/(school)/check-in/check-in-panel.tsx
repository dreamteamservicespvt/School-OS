"use client";

// Check-in on the person's own phone: asks for the location (needed when the
// campus area is on), then sends the scan. The answer is shown big and plain.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { checkInAction, type CheckInAnswer } from "./actions";

type Loc = { lat: number; lng: number; accuracy: number | null } | null;

function getLocation(): Promise<Loc> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  });
}

export function CheckInPanel({ code, schoolId, mobile }: { code: string | null; schoolId: string | null; mobile: boolean }) {
  const [answer, setAnswer] = useState<CheckInAnswer | null>(null);
  const [step, setStep] = useState<"idle" | "locating" | "sending">("idle");
  const started = useRef(false);

  const run = useCallback(async (method: "qr" | "mobile") => {
    setAnswer(null);
    setStep("locating");
    const location = await getLocation();
    setStep("sending");
    try {
      setAnswer(await checkInAction({ method, code, schoolId, location }));
    } catch {
      setAnswer({ ok: false, message: "No internet. Check in again when your phone is online." });
    } finally {
      setStep("idle");
    }
  }, [code, schoolId]);

  // A scanned QR checks in straight away; the person only waits.
  useEffect(() => {
    if (code && !started.current) {
      started.current = true;
      const t = setTimeout(() => { void run("qr"); }, 0);
      return () => clearTimeout(t);
    }
  }, [code, run]);

  return (
    <div className="space-y-5 text-center">
      {step !== "idle" && (
        <p role="status" className="text-lg text-ink-2">{step === "locating" ? "Checking where you are… Allow location if your phone asks." : "Checking you in…"}</p>
      )}
      {answer && (
        <div role={answer.ok ? "status" : "alert"} className={`rounded-2xl border px-5 py-8 ${answer.ok ? "border-success/30 bg-success-soft text-success" : "border-danger/30 bg-danger-soft text-danger"}`}>
          <p className="text-2xl font-semibold">{answer.ok ? "Checked in" : "Not checked in"}</p>
          <p className="mt-2 text-lg">{answer.message}</p>
        </div>
      )}
      {code && answer && !answer.ok && <Button size="lg" onClick={() => void run("qr")}>Try again</Button>}
      {!code && mobile && step === "idle" && !answer?.ok && (
        <Button size="lg" className="w-full" onClick={() => void run("mobile")}>Check in now</Button>
      )}
      {!code && !mobile && !answer && (
        <p className="text-ink-2">Scan the QR poster at the school entrance with your phone camera to check in.</p>
      )}
    </div>
  );
}
