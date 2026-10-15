// The driver page's own install manifest (12 §2 Driver app): it opens
// straight on today's trips, in its own window, scoped to /driver.
export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify({
    name: "School OS Driver",
    short_name: "Driver",
    description: "Today's bus trips: start, stops, students and the emergency button.",
    id: "/driver",
    start_url: "/driver",
    scope: "/driver",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f7f9",
    theme_color: "#1d4ed8",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  }), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
