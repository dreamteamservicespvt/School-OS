// The driver page (12 §2 Driver app; 01 §2 Driver home): today's own trips
// with Start trip, stops and students, End trip and the emergency button,
// for a driver or attendant who signs in on the phone's browser. It is a
// companion for use with the screen on: the bus's location is sent only
// while this page is open (D11: background location needs the Android
// driver app). Locations and marks made offline are kept on the phone by
// public/driver-sw.js and sent when back online.
import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { driverToday } from "@/lib/transport/driver-api";
import { driverOf } from "@/lib/transport/trips";
import { DriverApp } from "./driver-app";

export const metadata: Metadata = {
  title: "Driver",
  manifest: "/driver/manifest.webmanifest",
  appleWebApp: { capable: true, title: "School OS Driver", statusBarStyle: "default" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };
export const dynamic = "force-dynamic";

export default async function DriverPage() {
  const current = await requirePage("transport-management");
  const now = new Date();
  const found = await withSchool(current.ctx, async (tx) => {
    const driver = await driverOf(tx, current.user.id);
    if (!driver) return null;
    const school = await tx.school.findUnique({ where: { id: current.ctx.schoolId }, select: { phone: true } });
    const data = await driverToday(tx, { ctx: current.ctx, driver, device: null, tz: current.school.timeZone, userId: current.user.id, via: "session" }, now);
    return { data, phone: school?.phone ?? null };
  });
  // Transport staff use the Trips page; the driver page is for drivers and attendants.
  if (!found) redirect("/transport-management/trips");
  return <DriverApp initial={found.data} schoolName={current.school.name} schoolPhone={found.phone} />;
}
