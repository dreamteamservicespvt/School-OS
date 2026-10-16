import * as I from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-4">
      <section className="w-full max-w-md bg-surface rounded-2xl border border-line/70 shadow-card">
        <div className="flex flex-col items-center text-center px-6 py-14 gap-3">
          <span className="w-14 h-14 rounded-2xl bg-sunken text-ink3 grid place-items-center" aria-hidden="true"><I.MapPinOff size={26} /></span>
          <h1 className="font-semibold text-[15px]">This page is not here</h1>
          <p className="text-sm text-ink3 max-w-sm">The link may be old, or the record may have been archived. Check the address, or start again from your home.</p>
          <ButtonLink href="/dashboard" variant="primary" icon={I.House} className="mt-2">Go to your home</ButtonLink>
        </div>
      </section>
    </main>
  );
}
