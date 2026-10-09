"use client";

// The last safety net, when even the page frame failed to load.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", minHeight: "100dvh", placeItems: "center", margin: 0, padding: 16 }}>
        <main style={{ maxWidth: 440, textAlign: "center" }}>
          <h1 style={{ fontSize: 22 }}>School OS could not open</h1>
          <p>Something went wrong on our side. Nothing you saved was lost. Please try again in a moment.</p>
          <button onClick={() => reset()} style={{ minHeight: 44, padding: "0 20px", borderRadius: 8, border: 0, background: "#2563eb", color: "#fff", fontSize: 16 }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
