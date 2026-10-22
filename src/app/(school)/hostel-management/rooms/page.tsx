// Rooms & Beds (15 §2): every bed of the hostel as a grid, free (green),
// taken (with the student's name), away on a pass, or blocked for repair,
// with totals by hostel that match the residents list. Tap a bed to give it,
// move or check out its student, or block it. A warden works in their own
// hostel only; other hostels show totals, never names. Adding a hostel and
// choosing its wardens are for the Principal or School Admin.
import Link from "next/link";
import type { Metadata } from "next";
import { BedDouble, Building2, FileSpreadsheet, Layers, LogOut, Pencil, Plus, ArrowRightLeft, SearchX, UserCog, UserPlus, Lock, LockOpen, UserRound, DoorClosed } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatRupees } from "@/lib/format";
import { fileLink } from "@/lib/files";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Chips, SegLinks } from "@/components/ui/blocks";
import { UrlSheet } from "@/components/ui/url-sheet";
import { ExportButton } from "@/components/ui/export-button";
import { UrlSearch } from "@/components/ui/url-controls";
import { Band, Banner, DL, Empty, Legend, Stack, Toolbar } from "@/components/money/kit";
import { cx } from "@/components/ui/cx";
import { roomGrid, occupancy } from "@/lib/hostel/rooms";
import { studentsInfo, residentStatus, hostelFeesDue } from "@/lib/hostel/allocation";
import { wardensByHostel, currentFeePlans, planTotal } from "@/lib/hostel/settings";
import { clockAt } from "@/lib/front-office/time";
import { BASE, RESIDENT_STATUS, bedWords, plural } from "@/lib/hostel/words";
import { HostelHead } from "../_components/head";
import { AddFloorSheet, AddRoomSheet, BlockSheet, CloseRoomSheet, EditRoomSheet, HostelSheet, WardensSheet } from "../_components/sheets";
import { addQ, chosenHostel, hostelGuard, idParam, one, qs, type SearchParams } from "../_lib/page";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Rooms & Beds · Hostel Management") };
}

const FLOOR_NAMES = ["Ground", "First", "Second", "Third", "Fourth", "Fifth", "Sixth"];

export default async function RoomsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const p = await hostelGuard("rooms");
  const { current, can, mine, v } = p;
  const ctx = current.ctx;
  const hostel = chosenHostel(p, sp.hostel);
  const floor = one(sp.floor);
  const q = one(sp.q).trim().slice(0, 60).toLowerCase();
  const bedId = idParam(sp.bed);
  const add = one(sp.add);
  const seesStudents = (current.permissions["student-management"]?.see ?? "none") !== "none";

  const d = await withSchool(ctx, async (tx) => {
    const occ = await occupancy(tx);
    const wardens = await wardensByHostel(tx);
    const grid = hostel ? await roomGrid(tx, [hostel.id]) : [];
    const taken = grid.flatMap((r) => r.beds.filter((b) => b.studentId).map((b) => b.studentId!));
    const [info, passes] = await Promise.all([
      studentsInfo(tx, ctx, taken),
      taken.length ? tx.gatePass.findMany({ where: { kind: "HOSTEL_OUTING", status: "OUT", archivedAt: null, studentId: { in: taken } } }) : [],
    ]);
    const blockedBeds = grid.flatMap((r) => r.beds.filter((b) => b.state === "blocked"));
    // The opened bed.
    let opened: null | { room: (typeof grid)[number]; bed: (typeof grid)[number]["beds"][number]; alloc: Awaited<ReturnType<typeof tx.bedAllocation.findFirst>>; due: bigint; plan: string | null; guardians: { name: string; relationship: string; phone: string }[] } = null;
    if (bedId) {
      const room = grid.find((r) => r.beds.some((b) => b.id === bedId));
      const bed = room?.beds.find((b) => b.id === bedId);
      if (room && bed) {
        const alloc = bed.allocationId ? await tx.bedAllocation.findFirst({ where: { id: bed.allocationId } }) : null;
        const due = alloc && v.seesFees ? await hostelFeesDue(tx, alloc.studentId, p.today) : BigInt(0);
        const planRow = alloc?.feePlanId ? await tx.hostelFeePlan.findFirst({ where: { id: alloc.feePlanId }, include: { installments: { where: { archivedAt: null } } } }) : null;
        const links = alloc ? await tx.studentGuardian.findMany({ where: { studentId: alloc.studentId, archivedAt: null }, include: { guardian: { select: { name: true, phone: true } } }, orderBy: [{ isPrimary: "desc" }, { emergencyOrder: "asc" }], take: 2 }) : [];
        opened = { room, bed, alloc, due, plan: planRow ? `${planRow.name}${v.seesFees ? ` · ${formatRupees(planTotal(planRow))} a year` : ""}` : alloc ? "No hostel fees" : null, guardians: links.map((l) => ({ name: l.guardian.name, relationship: l.relationship, phone: l.guardian.phone })) };
      }
    }
    // Every campus's current year's plans (a school's campuses can start the year on different dates).
    const plans = await currentFeePlans(tx, ctx);
    const staff = can.hostels && sp.wardens ? await tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] } }, select: { id: true, fullName: true, designation: true, userLoginId: true }, orderBy: { fullName: "asc" }, take: 500 }) : [];
    const editRoom = idParam(sp.room) ? grid.find((r) => r.id === one(sp.room)) ?? null : null;
    const closeRoom = idParam(sp.close) ? grid.find((r) => r.id === one(sp.close)) ?? null : null;
    return { occ, wardens, grid, info, passes, blockedBeds, opened, plans, staff, editRoom, closeRoom };
  });

  const here = (change: Record<string, string | null>) => addQ(qs(`${BASE}/rooms`, { hostel: hostel && p.myHostels.length > 1 ? hostel.id : null, floor: floor || null, q: q || null }), change);
  const closeHref = here({});
  const away = new Map(d.passes.map((x) => [x.studentId, x]));
  const H = hostel ? d.occ.rows.find((r) => r.hostel.id === hostel.id) : null;
  const shownRooms = d.grid.filter((r) => (!floor || r.floor === floor) && (!q || r.roomNo.toLowerCase().includes(q) || r.beds.some((b) => b.studentId && d.info.get(b.studentId)?.name.toLowerCase().includes(q))));
  const match = (roomNo: string, sid: string | null) => Boolean(q) && (roomNo.toLowerCase().includes(q) || Boolean(sid && d.info.get(sid)?.name.toLowerCase().includes(q)));
  const floors = hostel ? hostel.floors.filter((f) => !floor || f === floor) : [];
  const nextFloor = hostel ? FLOOR_NAMES.find((n) => !hostel.floors.includes(n)) ?? "" : "";
  const t = d.occ.total;

  const actions = (
    <>
      {can.hostels && <ButtonLink href={here({ add: "hostel" })} variant="ghost" icon={Building2} scroll={false}><Words k="Add a hostel" /></ButtonLink>}
      {can.hostels && hostel && <ButtonLink href={here({ wardens: hostel.id })} variant="ghost" icon={UserCog} scroll={false}><Words k="Wardens" /></ButtonLink>}
      {can.rooms && <ButtonLink href={`${BASE}/rooms/import`} variant="ghost" icon={FileSpreadsheet}><Words k="Import" /></ButtonLink>}
      {can.rooms && hostel && <ButtonLink href={here({ add: "floor" })} variant="secondary" icon={Layers} scroll={false}><Words k="Add a floor" /></ButtonLink>}
      {can.rooms && hostel && <ButtonLink href={here({ add: "room" })} variant="primary" icon={Plus} scroll={false}><Words k="Add room" /></ButtonLink>}
    </>
  );

  return (
    <>
      <HostelHead pageName="Rooms & Beds" href={`${BASE}/rooms`} mode={p.mode}
        sub={!can.rooms ? "Every bed: who sleeps where, what is free and what is blocked for repair." : mine ? `Every bed in ${hostel?.name ?? "your hostel"}. Tap a bed to give it, move a student or block it for repair.` : "Every bed in the hostels. Tap a bed to give it, move a student or block it for repair."}
        actions={actions} />
      <Stack>
        {d.occ.rows.length === 0 ? (
          <Card><Empty icon={Building2} title="No hostel yet" body={can.hostels ? "Add the boys' or girls' hostel first, then its floors, rooms and wardens." : "The Principal or School Admin adds the hostels in Hostel Settings."} action={can.hostels ? <ButtonLink href={here({ add: "hostel" })} variant="primary" icon={Plus} scroll={false}><Words k="Add a hostel" /></ButtonLink> : undefined} /></Card>
        ) : (
          <>
            <Band items={[
              { label: "Beds taken", big: <>{t.taken}<span className="text-[0.55em] opacity-90 font-medium"> / {t.beds}</span></>, foot: `${t.beds ? Math.round((t.taken / t.beds) * 100) : 0}% full · ${d.occ.rows.length === 1 ? "the hostel" : `${d.occ.rows.length} hostels`}` },
              ...d.occ.rows.slice(0, 2).map((r) => {
                const ours = mine === null || mine.includes(r.hostel.id);
                const w = d.wardens.get(r.hostel.id) ?? [];
                return { label: r.hostel.name, big: <>{r.taken}<span className="text-[0.55em] opacity-90 font-medium"> / {r.beds}</span></>, foot: ours ? `${r.free} free${r.blocked ? ` · ${r.blocked} blocked` : ""} · ${w.map((x) => x.name).join(", ") || "no warden yet"}` : `${r.free} free · totals only`, href: ours && p.myHostels.length > 1 ? qs(`${BASE}/rooms`, { hostel: r.hostel.id }) : undefined };
              }),
              { label: "Free beds", big: String(t.free), foot: `${t.blocked} blocked for repair` },
            ]} />
            {!hostel ? (
              <Card><Empty icon={UserCog} title="You are not a warden of any hostel yet" body="The Principal or School Admin sets each hostel's wardens in Hostel Settings. Until then you see the totals above." /></Card>
            ) : (
              <Card className="overflow-hidden">
                <Toolbar>
                  {p.myHostels.length > 1 && <SegLinks label="Hostel" value={hostel.id} options={p.myHostels.map((h) => ({ value: h.id, label: h.name, href: qs(`${BASE}/rooms`, { hostel: h.id }) }))} />}
                  <UrlSearch placeholder="Find a room or a student" label="Find a room or a student" className="md:max-w-[300px]" />
                  {can.export && <ExportButton href={qs(`${BASE}/rooms/export`, { hostel: hostel.id })} />}
                </Toolbar>
                <div className="px-4 md:px-5 pt-3 flex flex-col md:flex-row md:items-center gap-3 justify-between">
                  <Chips label="Floor" value={floor || "all"} options={[
                    { value: "all", label: "All floors", count: d.grid.length, href: here({ floor: null }) },
                    ...hostel.floors.map((f) => ({ value: f, label: `${f} floor`, count: d.grid.filter((r) => r.floor === f).length, href: here({ floor: f }) })),
                  ]} />
                  <Legend items={[["bg-ok", "Free"], ["bg-ink3/50", "Taken"], ["bg-info", "Away now"], ["bg-warn", "Blocked"]]} />
                </div>
                {d.grid.length === 0 ? (
                  <Empty icon={BedDouble} title={`No rooms in ${hostel.name} yet`} body="Add the first room. Its beds are made and numbered for you. Many rooms at once: import them in Hostel Settings." action={can.rooms ? <ButtonLink href={here({ add: "room" })} variant="primary" icon={Plus} scroll={false}><Words k="Add room" /></ButtonLink> : undefined} />
                ) : shownRooms.length === 0 ? (
                  <Empty icon={SearchX} title="No room or student matches" body={q ? `Nothing called “${one(sp.q)}” in ${hostel.name}.` : "No rooms on this floor yet."} action={<ButtonLink href={qs(`${BASE}/rooms`, { hostel: p.myHostels.length > 1 ? hostel.id : null })} variant="secondary"><Words k="Clear filters" /></ButtonLink>} />
                ) : (
                  <div className="p-4 md:p-5 flex flex-col gap-6">
                    {floors.map((f) => {
                      const rs = shownRooms.filter((r) => r.floor === f);
                      if (!rs.length) return null;
                      const bedsHere = rs.reduce((a, r) => a + r.beds.length, 0);
                      const freeHere = rs.reduce((a, r) => a + r.beds.filter((b) => b.state === "free").length, 0);
                      return (
                        <section key={f} aria-label={`${f} floor`}>
                          <h2 className="text-[13px] font-semibold text-ink2 mb-2.5">{f} <Words k="floor" /> <span className="text-ink3 font-normal">· {plural(rs.length, "room")} · {plural(bedsHere, "bed")} · {freeHere} <Words k="free" /></span></h2>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
                            {rs.map((rm) => {
                              const free = rm.beds.filter((b) => b.state === "free").length;
                              return (
                                <div key={rm.id} className="rounded-2xl border border-line p-3 min-w-0">
                                  <div className="flex items-center justify-between gap-2 mb-2">
                                    <p className="font-semibold text-[14.5px]"><Words k="Room" /> {rm.roomNo}</p>
                                    <span className="flex items-center gap-1.5 min-w-0">
                                      <span className="text-[12px] text-ink3 truncate">{rm.roomType ? `${rm.roomType} · ` : ""}{free ? <b className="text-ok font-semibold">{free} <Words k="free" /></b> : "full"}</span>
                                      {can.rooms && <Link href={here({ room: rm.id })} scroll={false} className="size-8 grid place-items-center rounded-lg text-ink3 hover:bg-sunken hover:text-ink shrink-0" aria-label={`Change Room ${rm.roomNo}`}><Pencil size={14} aria-hidden="true" /></Link>}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-1.5">
                                    {rm.beds.map((b) => {
                                      const s = b.studentId ? d.info.get(b.studentId) : null;
                                      const aw = b.studentId ? away.get(b.studentId) : undefined;
                                      return (
                                        <Link key={b.id} href={here({ bed: b.id })} scroll={false} aria-label={`Room ${rm.roomNo}, Bed ${b.bedNo}: ${s ? s.name : b.state === "blocked" ? "blocked" : "free"}`}
                                          className={cx("rounded-xl px-2.5 py-2 text-left min-w-0 border transition block",
                                            s ? (aw ? "bg-info/8 border-info/30 hover:bg-info/10" : "bg-sunken/60 border-line hover:bg-sunken") : b.state === "blocked" ? "bg-warn/12 border-transparent hover:bg-warn/15" : "bg-ok/10 border-transparent hover:bg-ok/15",
                                            match(rm.roomNo, b.studentId) && "ring-2 ring-brand")}>
                                          <span className={cx("block text-[11px] font-semibold", s ? "text-ink3" : b.state === "blocked" ? "text-warn" : "text-ok")}><Words k="Bed" /> {b.bedNo}</span>
                                          <span className={cx("block text-[13px] font-semibold truncate", !s && (b.state === "blocked" ? "text-warn" : "text-ok"))}>{s ? s.name : b.state === "blocked" ? "Blocked" : "Free"}</span>
                                          <span className="block text-[11.5px] text-ink3 truncate">{s ? `${s.classSection ?? ""}${aw ? ` · ${aw.outingType === "LEAVE" ? "on leave" : "on outing"}` : ""}` : b.state === "blocked" ? b.blockedReason ?? "Repair" : can.allocate ? "Tap to give" : "Nobody here"}</span>
                                        </Link>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                )}
                {H && <p className="px-5 py-3 border-t border-line text-[12.5px] text-ink3 tnum">{hostel.name}: {plural(H.beds, "bed")} · {H.taken} <Words k="taken ·" /> {H.free} <Words k="free ·" /> {H.blocked} <Words k="blocked · matches the residents list in Allocation" /></p>}
              </Card>
            )}
            {d.blockedBeds.length > 0 && hostel && (
              <Card>
                <CardHeader title="Blocked for repair" icon={Lock} description={`${plural(d.blockedBeds.length, "bed")} in ${hostel.name} not offered to anyone.`} divided />
                <ul className="divide-y divide-line/70">
                  {d.blockedBeds.map((b) => {
                    const rm = d.grid.find((r) => r.beds.some((x) => x.id === b.id))!;
                    return (
                      <li key={b.id} className="flex items-center gap-3 px-5 py-2.5 flex-wrap">
                        <span className="min-w-0 flex-1"><b className="font-semibold text-[14px]">{bedWords(rm.roomNo, b.bedNo)}</b><span className="block text-[12.5px] text-ink3">{b.blockedReason}</span></span>
                        {can.rooms && <ButtonLink href={here({ unblock: b.id })} size="sm" variant="secondary" icon={LockOpen} scroll={false}><Words k="Unblock" /></ButtonLink>}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </>
        )}
      </Stack>

      {/* The opened bed */}
      {d.opened && hostel && (() => {
        const o = d.opened;
        const where = bedWords(o.room.roomNo, o.bed.bedNo);
        const s = o.alloc ? d.info.get(o.alloc.studentId) : null;
        const aw = o.alloc ? away.get(o.alloc.studentId) : undefined;
        const st = o.alloc ? RESIDENT_STATUS[residentStatus(o.alloc, aw, p.now)] : null;
        return (
          <UrlSheet title={where} sub={`${hostel.name} · ${o.room.floor} floor${o.room.roomType ? ` · ${o.room.roomType}` : ""}`} closeHref={closeHref}>
            {o.alloc && s ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3.5">
                  <Avatar name={s.name} src={s.photoFileId ? fileLink(s.photoFileId, ctx.schoolId) : null} size={52} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[16px] leading-tight">{s.name}</p>
                    <p className="text-[13px] text-ink3">{s.classSection ?? "No class"} · <span className="font-mono text-[12px]">{s.admissionNo}</span></p>
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                      {st && <Pill tone={st.tone}>{aw ? `${st.label} · back ${aw.toAt ? clockAt(aw.toAt, p.tz) : ""}` : st.label}</Pill>}
                      {v.seesFees && o.due > BigInt(0) && <Pill tone="warn">{formatRupees(o.due)} <Words k="hostel fees due" /></Pill>}
                    </div>
                  </div>
                </div>
                <DL rows={[
                  ["Since", formatDate(o.alloc.startDate, "UTC")],
                  ["Checked in", o.alloc.checkedInAt ? `${formatDate(o.alloc.checkedInAt, p.tz)}, ${clockAt(o.alloc.checkedInAt, p.tz)}` : "Not arrived yet"],
                  ["Fee plan", o.plan ?? ""],
                  ...(o.guardians.length ? [["Parents", o.guardians.map((g) => `${g.name} (${g.relationship.toLowerCase()})`).join(", ")] as [string, string], ["Phone", o.guardians[0].phone] as [string, string]] : []),
                ]} />
                <div className="flex gap-2 flex-wrap">
                  {can.allocate && <ButtonLink href={qs(`${BASE}/allocation`, { move: o.alloc.id })} variant="secondary" icon={ArrowRightLeft}><Words k="Move to another bed" /></ButtonLink>}
                  {seesStudents && <ButtonLink href={`/student-management/students/${s.id}?tab=hostel`} variant="ghost" icon={UserRound}><Words k="Profile" /></ButtonLink>}
                  {can.allocate && <ButtonLink href={qs(`${BASE}/allocation`, { checkout: o.alloc.id })} variant="danger-soft" icon={LogOut}><Words k="Check out" /></ButtonLink>}
                </div>
              </div>
            ) : o.bed.state === "blocked" ? (
              <div className="flex flex-col gap-4">
                <Banner tone="warn" title="Blocked for repair.">{o.bed.blockedReason}</Banner>
                {can.rooms && <div className="flex justify-end"><ButtonLink href={here({ unblock: o.bed.id })} variant="primary" icon={LockOpen} scroll={false}><Words k="Unblock bed" /></ButtonLink></div>}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <Banner tone="ok" title="This bed is free.">{can.allocate ? "Give it to a student waiting for a bed, or block it if it needs repair." : "The warden gives free beds to students waiting for one."}</Banner>
                <div className="flex gap-2 justify-end flex-wrap">
                  {can.rooms && <ButtonLink href={here({ block: o.bed.id })} variant="ghost" icon={Lock} scroll={false}><Words k="Block for repair" /></ButtonLink>}
                  {can.rooms && o.room.beds.every((b) => b.state !== "taken") && <ButtonLink href={here({ close: o.room.id })} variant="ghost" icon={DoorClosed} scroll={false}><Words k="Close room" /></ButtonLink>}
                  {can.allocate && <ButtonLink href={qs(`${BASE}/allocation`, { allocate: "1", bed: o.bed.id })} variant="primary" icon={UserPlus}><Words k="Give this bed" /></ButtonLink>}
                </div>
              </div>
            )}
          </UrlSheet>
        );
      })()}

      {can.rooms && add === "room" && hostel && (
        <AddRoomSheet closeHref={closeHref} hostels={p.myHostels} startHostel={hostel.id}
          plans={d.plans.map((x) => ({ hostelId: x.hostelId, roomType: x.roomType, words: `${x.name}${x.campusName ? ` (${x.campusName})` : ""}${v.seesFees ? `, ${formatRupees(planTotal(x))} a year` : ""}` }))} />
      )}
      {can.rooms && add === "floor" && hostel && <AddFloorSheet closeHref={closeHref} hostelId={hostel.id} hostelName={hostel.name} suggestion={nextFloor} />}
      {can.rooms && d.editRoom && hostel && <EditRoomSheet closeHref={closeHref} room={{ id: d.editRoom.id, roomNo: d.editRoom.roomNo, roomType: d.editRoom.roomType, beds: d.editRoom.beds.length, where: `${hostel.name} · ${d.editRoom.floor} floor` }} />}
      {can.rooms && d.closeRoom && <CloseRoomSheet closeHref={closeHref} roomId={d.closeRoom.id} roomNo={d.closeRoom.roomNo} />}
      {can.rooms && (idParam(sp.block) || idParam(sp.unblock)) && (() => {
        const id = idParam(sp.block) ?? idParam(sp.unblock)!;
        const rm = d.grid.find((r) => r.beds.some((b) => b.id === id));
        const b = rm?.beds.find((x) => x.id === id);
        return rm && b ? <BlockSheet closeHref={closeHref} bedId={b.id} words={bedWords(rm.roomNo, b.bedNo)} block={Boolean(idParam(sp.block))} reason={b.blockedReason} /> : null;
      })()}
      {can.hostels && add === "hostel" && <HostelSheet closeHref={closeHref} start={null} />}
      {can.hostels && idParam(sp.wardens) && (() => {
        const h = p.hostels.find((x) => x.id === one(sp.wardens));
        if (!h) return null;
        const w = d.wardens.get(h.id) ?? [];
        return <WardensSheet closeHref={closeHref} hostelId={h.id} hostelName={h.name} staff={d.staff.map((s) => ({ id: s.id, name: s.fullName, sub: s.designation ?? "", hasLogin: Boolean(s.userLoginId) }))} start={w.map((x) => ({ staffId: x.staffId, title: x.title }))} />;
      })()}
    </>
  );
}

