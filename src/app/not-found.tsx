import Link from "next/link";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-4">
      <section className="max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
        <h1 className="text-xl font-semibold">This page is not here</h1>
        <p className="mt-2 text-ink-2">The link may be old, or the record may have been archived. Check the address, or start again from the Dashboard.</p>
        <Link href="/dashboard" className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-brand px-4 font-medium text-brand-ink">Go to the Dashboard</Link>
      </section>
    </main>
  );
}
