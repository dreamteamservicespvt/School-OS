"use client";

// When a page fails, the person sees what happened and what to do, never a
// stack trace (00-global.md P7). The error is already recorded on the server.
import { useEffect } from "react";
import * as I from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { NO_PERMISSION_DIGEST } from "@/lib/permissions";
import { findModule } from "@/lib/modules";
import { useT } from "@/lib/i18n/client";

export default function SchoolError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") console.error(error);
  }, [error]);
  // A refusal from the server (requireAction): say so in plain words, not "something went wrong" (QA audit PLATFORM-06).
  if (error.digest?.startsWith(NO_PERMISSION_DIGEST)) {
    const name = findModule(error.digest.slice(NO_PERMISSION_DIGEST.length))?.name;
    return (
      <section role="alert" className="max-w-xl mx-auto mt-4 md:mt-10 bg-surface rounded-2xl border border-line/70 shadow-card">
        <div className="flex flex-col items-center text-center px-6 py-14 gap-3">
          <span className="w-14 h-14 rounded-2xl bg-warn/10 text-warn grid place-items-center" aria-hidden="true"><I.Lock size={26} /></span>
          <h1 className="font-semibold text-[15px]">{t("Your role does not allow this")}</h1>
          <p className="text-sm text-ink3 max-w-sm">
            {t("Nothing was changed.")} {name ? <>{t("This needs more access in {module}.", { module: t.any(name) })} </> : null}{t("Ask your School Admin if you need it (Settings, Users & Permissions).")}
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <ButtonLink href="/dashboard" variant="primary" icon={I.House}>{t("Go to your home")}</ButtonLink>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section role="alert" className="max-w-xl mx-auto mt-4 md:mt-10 bg-surface rounded-2xl border border-line/70 shadow-card">
      <div className="flex flex-col items-center text-center px-6 py-14 gap-3">
        <span className="w-14 h-14 rounded-2xl bg-bad/10 text-bad grid place-items-center" aria-hidden="true"><I.TriangleAlert size={26} /></span>
        <h1 className="font-semibold text-[15px]">{t("This page could not open")}</h1>
        <p className="text-sm text-ink3 max-w-sm">
          {t("Something went wrong on our side while loading it. Nothing you saved was lost. Try again; if it keeps happening, tell your School Admin.")}
          {error.digest ? <> {t("Reference:")} <span className="font-mono text-ink2">{error.digest}</span></> : null}
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button variant="primary" icon={I.RotateCw} onClick={() => reset()}>{t("Try again")}</Button>
          <ButtonLink href="/dashboard" variant="secondary" icon={I.House}>{t("Go to your home")}</ButtonLink>
        </div>
      </div>
    </section>
  );
}
