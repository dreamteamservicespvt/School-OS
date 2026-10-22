import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PLACES } from "@/lib/imports/places";
import { ImportHome } from "@/components/import/import-home";
import { HostelHead } from "../../_components/head";
import { BASE, hostelGuard } from "../../_lib/page";

export const metadata: Metadata = { title: "Import rooms · Hostel Management" };

/** Many rooms at once from a spreadsheet (15 Rooms & Beds, P10), on the same engine as Switching to School OS. */
export default async function ImportRoomsPage() {
  const p = await hostelGuard("rooms");
  if (!p.can.rooms) redirect(`${BASE}/rooms`);
  const about = {
    "hostel-rooms": `One row per room. Each room is checked as if typed on Add room: the hostel must exist, and a room number is used once in a hostel.${p.mine !== null ? " You can import into your own hostel only." : ""}`,
  };
  return (
    <>
      <HostelHead pageName="Import rooms" href={`${BASE}/rooms/import`} mode={p.mode} sub={<Link href={`${BASE}/rooms`} className="hover:underline">Rooms & Beds</Link>} />
      <ImportHome current={p.current} place={PLACES.hostel} about={about} />
    </>
  );
}
