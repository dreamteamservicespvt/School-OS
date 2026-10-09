"use client";

// When a page fails, the person sees what happened and what to do, never a
// stack trace (00-global.md P7). The error is already recorded on the server.
import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";

export default function SchoolError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") console.error(error);
  }, [error]);
  return (
    <section role="alert" className="mx-auto mt-10 max-w-lg rounded-2xl border border-line bg-surface p-6 text-center">
      <h1 className="text-xl font-semibold">This page could not open</h1>
      <p className="mt-2 text-ink-2">
        Something went wrong on our side while loading it. Nothing you saved was lost. Try again; if it keeps happening, tell your School Admin
        {error.digest ? <> and quote this reference: <span className="font-mono">{error.digest}</span></> : null}.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button onClick={() => reset()}>Try again</Button>
        <ButtonLink href="/dashboard">Go to the Dashboard</ButtonLink>
      </div>
    </section>
  );
}
