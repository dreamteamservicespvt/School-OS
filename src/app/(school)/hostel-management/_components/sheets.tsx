"use client";

// The hostel's sheets (forms opened by the page address, P4 and P7). Each
// keeps what was typed when a check fails and shows the problem next to its
// field. The server checks everything again (the warden's own hostel, one bed
// per student, the hostel matched to gender, approval before marking out...).

import { useMemo, useState, useTransition } from "react";
import { Camera, Info, ShieldAlert, ShieldCheck } from "lucide-react";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { SArea, SDate, SMoney, SSelect, SSwitch, SText } from "@/components/ui/sheet-fields";
import { Switch } from "@/components/ui/controls";
import { FieldShell, inputCls } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { SegField, StudentFind } from "./client";
import {
  addFloorAction, addRoomAction, allocateAction, archiveFeePlanAction, blockBedAction, cancelPassAction, checkoutAction, closeHostelAction, closeRoomAction,
  decidePassAction, guardiansAction, messExpenseAction, moveAction, raiseMaintenanceAction, recordIncidentAction, recordVisitorAction, requestPassAction, saveFeePlanAction,
  saveHeadCountAction, saveHostelAction, saveMenuAction, setWardensAction, updateRoomAction, type FoundStudent, type GuardianChoice,
} from "../actions";

type Opt = { value: string; label: string };
const RELATIONS = ["Father", "Mother", "Uncle", "Aunt", "Grandfather", "Grandmother", "Brother", "Sister", "Local guardian", "Other"];
const ROOM_TYPES = ["Non-AC", "AC"];

/* ---------- Rooms & Beds ---------- */

export type HostelOpt = { id: string; name: string; gender: "BOYS" | "GIRLS"; floors: string[] };

export function AddRoomSheet({ closeHref, hostels, startHostel, plans }: { closeHref: string; hostels: HostelOpt[]; startHostel: string; plans: { hostelId: string | null; roomType: string | null; words: string }[] }) {
  const h = useTyped("hostelId", startHostel);
  const [hid, setHid] = useState(h.value || startHostel);
  const t = useTyped("roomType", "Non-AC");
  const [type, setType] = useState(t.value || "Non-AC");
  const b = useTyped("beds", "4");
  const [beds, setBeds] = useState(Number(b.value) || 4);
  const hostel = hostels.find((x) => x.id === hid) ?? hostels[0];
  const plan = plans.find((p) => (!p.hostelId || p.hostelId === hid) && (!p.roomType || p.roomType === type));
  return (
    <SheetForm title="Add a room" sub="The beds are made and numbered for you." closeHref={closeHref} action={addRoomAction} submitLabel={`Add room with ${beds} bed${beds === 1 ? "" : "s"}`} pendingText="Adding…">
      <div className="grid grid-cols-2 gap-3">
        {hostels.length > 1 ? (
          <FieldShell label="Hostel" id="ar-h" required error={h.error}>
            <select key={h.key} id="ar-h" name="hostelId" defaultValue={hid} onChange={(e) => setHid(e.target.value)} className={cx(inputCls(h.error), "h-11")}>
              {hostels.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </FieldShell>
        ) : <input type="hidden" name="hostelId" value={hostel?.id ?? ""} />}
        <SSelect key={hid} name="floor" label="Floor" required options={(hostel?.floors ?? ["Ground"]).map((f) => ({ value: f, label: `${f} floor` }))} start={hostel?.floors[0] ?? "Ground"} className={hostels.length > 1 ? "" : "col-span-2"} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SText name="roomNo" label="Room number" required maxLength={12} placeholder={hostel?.gender === "GIRLS" ? "G-27" : "B-27"} help="Unique in the hostel" className="[&_input]:uppercase" />
        <FieldShell label="Beds" id="ar-beds" required error={b.error} help="1 to 12">
          <input key={b.key} id="ar-beds" name="beds" type="number" min={1} max={12} inputMode="numeric" defaultValue={b.value} onChange={(e) => setBeds(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} aria-invalid={b.error ? true : undefined} className={cx(inputCls(b.error), "h-11 tnum")} />
        </FieldShell>
      </div>
      <FieldShell label="Room type" id="ar-type" error={t.error} help={plan ? `Fee plan: ${plan.words}` : "For example AC or Non-AC, when fees differ."}>
        <div className="flex flex-wrap gap-2">
          {[...ROOM_TYPES, ""].map((x) => (
            <button key={x || "none"} type="button" aria-pressed={type === x} onClick={() => setType(x)} className={cx("h-10 px-3.5 rounded-xl border text-[13.5px] font-semibold transition", type === x ? "bg-brand/10 border-brand text-brand" : "border-line text-ink2 hover:border-ink3/50")}>{x || "No type"}</button>
          ))}
        </div>
        <input type="hidden" name="roomType" value={type} />
      </FieldShell>
    </SheetForm>
  );
}

export function EditRoomSheet({ closeHref, room }: { closeHref: string; room: { id: string; roomNo: string; roomType: string | null; beds: number; where: string } }) {
  return (
    <SheetForm title={`Room ${room.roomNo}`} sub={room.where} closeHref={closeHref} action={updateRoomAction} submitLabel="Save room" hidden={{ roomId: room.id }}>
      <div className="grid grid-cols-2 gap-3">
        <SText name="beds" label="Beds" required type="number" min={1} max={12} start={room.beds} help="New beds are added at the end. Only free beds at the end can be taken away." />
        <SSelect name="roomType" label="Room type" options={[{ value: "", label: "No type" }, ...ROOM_TYPES.map((x) => ({ value: x, label: x }))]} start={room.roomType ?? ""} />
      </div>
    </SheetForm>
  );
}

export function CloseRoomSheet({ closeHref, roomId, roomNo }: { closeHref: string; roomId: string; roomNo: string }) {
  return (
    <SheetForm title={`Close Room ${roomNo}?`} sub="Only an empty room can close. It stays in the history; its number is not given again." closeHref={closeHref} action={closeRoomAction} submitLabel="Close room" submitVariant="danger" hidden={{ roomId }}>
      <SArea name="reason" label="Reason" required maxLength={200} placeholder="Turned into the study room" />
    </SheetForm>
  );
}

export function AddFloorSheet({ closeHref, hostelId, hostelName, suggestion }: { closeHref: string; hostelId: string; hostelName: string; suggestion: string }) {
  return (
    <SheetForm title={`Add a floor to ${hostelName}`} sub="Then add rooms on it." closeHref={closeHref} action={addFloorAction} submitLabel="Add floor" hidden={{ hostelId }}>
      <SText name="floor" label="Floor name" required maxLength={30} start={suggestion} placeholder="Second" />
    </SheetForm>
  );
}

export function BlockSheet({ closeHref, bedId, words, block, reason }: { closeHref: string; bedId: string; words: string; block: boolean; reason: string | null }) {
  return (
    <SheetForm title={block ? `Block ${words}?` : `Unblock ${words}?`} sub={block ? "A blocked bed is not offered to anyone until it is unblocked." : "The bed becomes free and can be given to a student."}
      closeHref={closeHref} action={blockBedAction} submitLabel={block ? "Block bed" : "Unblock bed"} hidden={{ bedId, block: block ? "yes" : "no" }}>
      {!block && reason && <p className="text-[13.5px] text-ink2">Blocked because: <b className="font-semibold text-ink">{reason}</b></p>}
      <SArea name="reason" label="Reason" required maxLength={200} placeholder={block ? "Mattress torn, new one ordered" : "Carpenter fixed the frame"} help="Others will read it." />
    </SheetForm>
  );
}

export function HostelSheet({ closeHref, start }: { closeHref: string; start: { id: string; name: string; gender: "BOYS" | "GIRLS"; floors: string[]; note: string | null } | null }) {
  return (
    <SheetForm title={start ? `Change ${start.name}` : "Add a hostel"} sub={start ? "Floors with rooms on them cannot be taken away." : "Then choose its wardens and add rooms."} closeHref={closeHref} action={saveHostelAction}
      submitLabel={start ? "Save hostel" : "Add hostel"} hidden={start ? { hostelId: start.id } : undefined}>
      <SText name="name" label="Name" required maxLength={60} start={start?.name} placeholder="Senior boys' hostel" />
      <SegField name="gender" label="For" start={start?.gender ?? "BOYS"} options={[{ value: "BOYS", label: "Boys" }, { value: "GIRLS", label: "Girls" }]} help="Students are only given beds in a hostel that matches." />
      <SText name="floors" label="Floors" required maxLength={400} start={start?.floors.join(", ") ?? "Ground, First"} help="Separate them with commas, lowest first." />
      <SArea name="note" label="Note" maxLength={300} start={start?.note ?? ""} placeholder="Optional. For example: Classes 5 to 8." />
    </SheetForm>
  );
}

export function CloseHostelSheet({ closeHref, hostelId, name }: { closeHref: string; hostelId: string; name: string }) {
  return (
    <SheetForm title={`Close ${name}?`} sub="Only an empty hostel can close. Its rooms, residents and roll calls stay in the history." closeHref={closeHref} action={closeHostelAction} submitLabel="Close hostel" submitVariant="danger" hidden={{ hostelId }}>
      <SArea name="reason" label="Reason" required maxLength={200} placeholder="Merged into the new boys' hostel" />
    </SheetForm>
  );
}

export function WardensSheet({ closeHref, hostelId, hostelName, staff, start }: { closeHref: string; hostelId: string; hostelName: string; staff: { id: string; name: string; sub: string; hasLogin: boolean }[]; start: { staffId: string; title: string }[] }) {
  const [rows, setRows] = useState<{ staffId: string; title: string }[]>(start.length ? start : [{ staffId: "", title: "Warden" }]);
  const t = useTyped("wardens", null);
  const set = (i: number, k: "staffId" | "title", v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <SheetForm title={`Wardens of ${hostelName}`} sub="Each warden takes roll call and approves outings for this hostel." closeHref={closeHref} action={setWardensAction} submitLabel="Save wardens" hidden={{ hostelId }}>
      {t.error && <Alert tone="danger">{t.error}</Alert>}
      <ul className="flex flex-col gap-3">
        {rows.map((r, i) => {
          const s = staff.find((x) => x.id === r.staffId);
          return (
            <li key={i} className="rounded-xl border border-line p-3 flex flex-col gap-2">
              <div className="grid grid-cols-[1fr_140px] gap-2">
                <label className="sr-only" htmlFor={`wd-${i}`}>Warden {i + 1}</label>
                <select id={`wd-${i}`} name="staffId" value={r.staffId} onChange={(e) => set(i, "staffId", e.target.value)} className={cx(inputCls(), "h-11")}>
                  <option value="">Choose a staff member</option>
                  {staff.map((x) => <option key={x.id} value={x.id} disabled={rows.some((y, j) => j !== i && y.staffId === x.id)}>{x.name}{x.sub ? ` · ${x.sub}` : ""}</option>)}
                </select>
                <label className="sr-only" htmlFor={`wt-${i}`}>Title</label>
                <select id={`wt-${i}`} name="title" value={r.title} onChange={(e) => set(i, "title", e.target.value)} className={cx(inputCls(), "h-11")}>
                  {["Warden", "Assistant warden", "Night warden"].map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </div>
              <div className="flex items-center justify-between gap-2 text-[12.5px]">
                <span className={s && !s.hasLogin ? "text-warn" : "text-ink3"}>{s ? (s.hasLogin ? "Has a School OS login: gets alerts and approves outings." : "No School OS login yet: cannot approve outings until one is added in Staff & HR.") : ""}</span>
                {rows.length > 1 && <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="font-semibold text-bad hover:underline shrink-0">Remove</button>}
              </div>
            </li>
          );
        })}
      </ul>
      {rows.length < 6 && <button type="button" onClick={() => setRows((x) => [...x, { staffId: "", title: "Assistant warden" }])} className="self-start text-[13.5px] font-semibold text-brand hover:underline">Add another warden</button>}
    </SheetForm>
  );
}

/* ---------- Allocation ---------- */

export type FreeBed = { id: string; hostelId: string; roomNo: string; bedNo: number; floor: string; roomType: string | null };
/** `campusId`: the campus whose school year the plan is for. */
export type PlanOpt = { id: string; name: string; hostelId: string | null; roomType: string | null; words: string; campusId?: string | null };

function planFor(plans: PlanOpt[], hostelId: string, roomType: string | null) {
  const score = (p: PlanOpt) => (p.hostelId && p.hostelId !== hostelId) || (p.roomType && p.roomType !== roomType) ? -1 : (p.hostelId ? 2 : 0) + (p.roomType ? 1 : 0);
  return plans.map((p) => ({ p, s: score(p) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s)[0]?.p ?? null;
}

export function AllocateSheet({ closeHref, hostels, beds, plans: allPlans, start, waiting, todayStr, showFees }: {
  closeHref: string; hostels: HostelOpt[]; beds: FreeBed[]; plans: PlanOpt[]; start: { bedId: string | null; hostelId: string | null; student: FoundStudent | null }; waiting: FoundStudent[]; todayStr: string; showFees: boolean;
}) {
  const startBed = beds.find((b) => b.id === start.bedId) ?? null;
  const [student, setStudent] = useState<FoundStudent | null>(start.student);
  const firstHostel = startBed?.hostelId ?? start.hostelId ?? (student?.gender ? hostels.find((h) => h.gender === student.gender)?.id : null) ?? hostels[0]?.id ?? "";
  const [hid, setHid] = useState(firstHostel);
  const free = beds.filter((b) => b.hostelId === hid);
  const [bedId, setBedId] = useState(startBed?.id ?? free[0]?.id ?? "");
  const bed = beds.find((b) => b.id === bedId) ?? null;
  // Only the plans of the student's own campus's year (each campus has its own school year).
  const plans = allPlans.filter((p) => !p.campusId || !student?.campusId || p.campusId === student.campusId);
  const auto = bed ? planFor(plans, bed.hostelId, bed.roomType) : null;
  const [planId, setPlanId] = useState<string | null>(null);
  const plan = planId === null ? auto?.id ?? (plans.length ? "" : "none") : planId;
  const hostel = hostels.find((h) => h.id === hid);
  const genderBad = student?.gender && hostel && student.gender !== hostel.gender;
  const pickStudent = (s: FoundStudent | null) => {
    setStudent(s);
    // Another student may be on another campus, with that campus's plans.
    if (s?.campusId !== student?.campusId) setPlanId(null);
    if (s?.gender && !startBed) {
      const h = hostels.find((x) => x.gender === s.gender);
      if (h) { setHid(h.id); setBedId(beds.find((b) => b.hostelId === h.id)?.id ?? ""); }
    }
  };
  const fBed = useTyped("bedId", null);
  const fPlan = useTyped("feePlanId", null);
  const byRoom = useMemo(() => {
    const m = new Map<string, FreeBed[]>();
    for (const b of free) m.set(`${b.floor} floor · Room ${b.roomNo}`, [...(m.get(`${b.floor} floor · Room ${b.roomNo}`) ?? []), b]);
    return [...m.entries()];
  }, [free]);
  return (
    <SheetForm title="Give a bed" sub="One bed per student. The hostel fee plan's fees are added to the student's fees." closeHref={closeHref} action={allocateAction} wide
      submitLabel={student ? `Give bed to ${student.name.split(" ")[0]}` : "Give bed"} pendingText="Saving…">
      <StudentFind name="studentId" label="Student" mode="new" start={student ? [student] : []} onPick={(x) => pickStudent(x[0] ?? null)} help="Studying students without a bed." />
      {!student && waiting.length > 0 && (
        <div className="flex flex-col gap-1.5 -mt-1">
          <span className="text-[12.5px] text-ink3">Waiting for a bed (hostel needed at admission):</span>
          <div className="flex flex-wrap gap-1.5">
            {waiting.slice(0, 8).map((w) => (
              <button key={w.id} type="button" onClick={() => pickStudent(w)} className="h-9 px-3 rounded-full border border-line bg-surface hover:bg-sunken text-[13px] font-semibold">{w.name}<span className="text-ink3 font-normal"> · {w.cls}</span></button>
            ))}
          </div>
        </div>
      )}
      {student && <input type="hidden" name="studentId" value={student.id} />}
      <div className="grid sm:grid-cols-2 gap-3">
        <FieldShell label="Hostel" id="al-h" required error={genderBad && hostel ? `${hostel.gender === "GIRLS" ? "Girls' hostel. Choose the boys' hostel." : "Boys' hostel. Choose the girls' hostel."}` : undefined}>
          <select id="al-h" value={hid} onChange={(e) => { setHid(e.target.value); setBedId(beds.find((b) => b.hostelId === e.target.value)?.id ?? ""); setPlanId(null); }} aria-invalid={genderBad ? true : undefined} className={cx(inputCls(genderBad ? "x" : undefined), "h-11")}>
            {hostels.map((h) => <option key={h.id} value={h.id}>{h.name} ({beds.filter((b) => b.hostelId === h.id).length} free)</option>)}
          </select>
        </FieldShell>
        <FieldShell label="Room and bed" id="al-bed" required error={fBed.error ?? (!free.length ? `No free bed in ${hostel?.name ?? "this hostel"}. Check a student out or unblock a bed first.` : undefined)} help={bed ? `${bed.floor} floor${bed.roomType ? ` · ${bed.roomType}` : ""}` : undefined}>
          <select id="al-bed" name="bedId" value={bedId} onChange={(e) => { setBedId(e.target.value); setPlanId(null); }} aria-invalid={fBed.error ? true : undefined} className={cx(inputCls(fBed.error), "h-11")}>
            {!free.length && <option value="">No free bed</option>}
            {byRoom.map(([room, list]) => <optgroup key={room} label={room}>{list.map((b) => <option key={b.id} value={b.id}>Room {b.roomNo}, Bed {b.bedNo}{b.roomType ? ` · ${b.roomType}` : ""}</option>)}</optgroup>)}
          </select>
        </FieldShell>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <SDate name="startDate" label="Check-in date" required start={todayStr} />
        <FieldShell label="Fee plan" id="al-plan" required error={fPlan.error} help={auto && plan === auto.id ? "Set by the hostel and room type." : undefined}>
          <select id="al-plan" name="feePlanId" value={plan} onChange={(e) => setPlanId(e.target.value)} aria-invalid={fPlan.error ? true : undefined} className={cx(inputCls(fPlan.error), "h-11")}>
            {plan === "" && <option value="">Choose the fee plan</option>}
            {plans.filter((p) => !p.hostelId || p.hostelId === hid).map((p) => <option key={p.id} value={p.id}>{p.words}</option>)}
            <option value="none">No hostel fees</option>
          </select>
        </FieldShell>
      </div>
      <SSwitch name="checkedIn" title="Checked in now" sub="Turn off if the student arrives later. You check them in from the residents list." start />
      <SArea name="note" label="Note" maxLength={300} placeholder="Optional. For example: needs a lower bunk." />
      {student && bed && !genderBad && (
        <div className="rounded-xl p-3.5 text-[13.5px] text-ink2 flex gap-2.5 bg-brand/[.06] border border-brand/20">
          <Info size={17} className="shrink-0 mt-0.5 text-brand" aria-hidden="true" />
          <p>{plan === "none" ? `No hostel fees will be added for ${student.name}.` : <>The fees of <b className="font-semibold text-ink">{plans.find((p) => p.id === plan)?.name ?? "the plan"}</b> from the installment covering the check-in date are added to {student.name}&apos;s fees{showFees ? "" : " in Fee Management"}. Parents see them in Parent Link.</>} Free beds in {hostel?.name}: {free.length} → {free.length - 1}.</p>
        </div>
      )}
    </SheetForm>
  );
}

export function MoveSheet({ closeHref, allocationId, name, from, beds, hostels, todayStr }: { closeHref: string; allocationId: string; name: string; from: string; beds: FreeBed[]; hostels: HostelOpt[]; todayStr: string }) {
  const f = useTyped("bedId", "");
  return (
    <SheetForm title={`Move ${name}`} sub={`Now in ${from}. The old bed becomes free; the history is kept.`} closeHref={closeHref} action={moveAction} submitLabel="Move student" hidden={{ allocationId }}>
      {beds.length === 0 ? <Alert tone="warning" title="No free bed.">Check a student out, or unblock a bed, first.</Alert> : (
        <FieldShell label="New room and bed" id="mv-bed" required error={f.error}>
          <select key={f.key} id="mv-bed" name="bedId" defaultValue={f.value} aria-invalid={f.error ? true : undefined} className={cx(inputCls(f.error), "h-11")}>
            <option value="">Choose a free bed</option>
            {hostels.map((h) => {
              const list = beds.filter((b) => b.hostelId === h.id);
              return list.length ? <optgroup key={h.id} label={h.name}>{list.map((b) => <option key={b.id} value={b.id}>Room {b.roomNo}, Bed {b.bedNo} · {b.floor} floor{b.roomType ? ` · ${b.roomType}` : ""}</option>)}</optgroup> : null;
            })}
          </select>
        </FieldShell>
      )}
      <SDate name="date" label="Move date" required start={todayStr} />
      <SArea name="reason" label="Reason" required maxLength={200} placeholder="Moved closer to his classmates" help="So the history makes sense later." />
    </SheetForm>
  );
}

export function CheckoutSheet({ closeHref, allocationId, name, where, todayStr, due, outOn }: { closeHref: string; allocationId: string; name: string; where: string; todayStr: string; due: string | null; outOn: string | null }) {
  return (
    <SheetForm title={`Check out ${name}?`} sub={`${where} becomes free. Hostel fees stop from the next installment.`} closeHref={closeHref} action={checkoutAction} submitLabel="Check out" submitVariant="danger" hidden={{ allocationId }}>
      {outOn && <Alert tone="warning" title={`Out on pass ${outOn}.`}>Mark them returned first, or check out after they are back.</Alert>}
      {due && <Alert tone="warning" title={due}>You can still check out. The fees stay due and are cleared in Leaving &amp; Alumni.</Alert>}
      <SDate name="date" label="Check-out date" required start={todayStr} className="sm:max-w-[220px]" />
      <SArea name="reason" label="Reason" required maxLength={200} placeholder="Family moved closer to school; now a day scholar" />
    </SheetForm>
  );
}

/* ---------- Roll call and incidents ---------- */

/** Where a maintenance request can go: each of the person's hostels, then the rooms and places in Inventory's facility register. */
export type RequestPlaces = { hostels: { hostelId: string; value: string; label: string }[]; others: Opt[] };

const PRIORITIES = [{ value: "LOW", label: "Low" }, { value: "NORMAL", label: "Normal" }, { value: "HIGH", label: "High" }, { value: "URGENT", label: "Urgent" }];

/** Place, priority and photo of the Inventory maintenance request (Report a problem's fields). */
function RequestFields({ places, hostelId }: { places: RequestPlaces; hostelId: string }) {
  const here = places.hostels.find((h) => h.hostelId === hostelId) ?? places.hostels[0];
  const p = useTyped("placeId", here?.value ?? "");
  const [photo, setPhoto] = useState("");
  const options = [...places.hostels.map((h) => ({ value: h.value, label: h.label })), ...places.others];
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line p-3 sm:p-4">
      <SSelect key={`${hostelId}-${p.key}`} name="placeId" label="Place" required options={options} start={p.value || here?.value} help="The hostel, or a room or place from Inventory's register" />
      <SegField name="priority" label="Priority" start="NORMAL" options={PRIORITIES} />
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink2">Photo</span>
        <label className="flex items-center gap-3 rounded-xl border border-dashed border-line px-4 py-3 min-h-11 cursor-pointer hover:bg-sunken/60 focus-within:ring-2 focus-within:ring-brand/40">
          <Camera size={20} className="text-ink3 shrink-0" aria-hidden="true" />
          <span className="text-[14px] min-w-0 truncate">{photo || "Take a photo or choose one (optional)"}</span>
          <input type="file" name="photo" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0]?.name ?? "")} />
        </label>
      </div>
    </div>
  );
}

export function IncidentSheet({ closeHref, hostels, todayStr, nowTime, behaviourTypes, start, requestPlaces }: {
  closeHref: string; hostels: { id: string; name: string }[]; todayStr: string; nowTime: string; behaviourTypes: Opt[] | null; start: { type: string; students: FoundStudent[]; description: string };
  /** Set only when Inventory Management is on: a maintenance incident can raise its maintenance request. */
  requestPlaces: RequestPlaces | null;
}) {
  const t = useTyped("type", start.type);
  const [type, setType] = useState(t.value || start.type);
  const maint = type === "MAINTENANCE";
  const h = useTyped("hostelId", hostels[0]?.id ?? "");
  const [hostelId, setHostelId] = useState(h.value || hostels[0]?.id || "");
  const r = useTyped("raiseRequest", "on");
  const [raise, setRaise] = useState(r.value === "on");
  return (
    <SheetForm title="Record an incident" sub="Kept in the hostel log. Staff only." closeHref={closeHref} action={recordIncidentAction} submitLabel="Save incident" wide pendingText="Saving…">
      <SegField name="type" label="Type" start={type} onChange={setType} options={[{ value: "DISCIPLINE", label: "Discipline" }, { value: "MEDICAL", label: "Medical" }, { value: "MAINTENANCE", label: "Maintenance" }]} />
      <StudentFind name="studentIds" label="Student(s)" mode="resident" multiple required={!maint} start={start.students} help={maint ? "Optional for maintenance." : undefined} />
      {maint && (
        <div className="grid sm:grid-cols-2 gap-3">
          {hostels.length > 1 ? <SSelect name="hostelId" label="Hostel" required options={hostels.map((x) => ({ value: x.id, label: x.name }))} start={hostelId} onChange={(e) => setHostelId(e.target.value)} /> : <input type="hidden" name="hostelId" value={hostels[0]?.id ?? ""} />}
          <SText name="place" label="Room or place" required maxLength={120} placeholder="Room B-21, ceiling fan" />
        </div>
      )}
      <SArea name="description" label="What happened" required rows={3} maxLength={2000} start={start.description} placeholder={maint ? "Ceiling fan not working since evening" : "Found using a phone after lights-out"} />
      <div className="grid grid-cols-2 gap-3">
        <SDate name="date" label="Date" required start={todayStr} max={todayStr} />
        <SText name="time" label="Time" required type="time" start={nowTime} />
      </div>
      <SArea name="actionTaken" label="Action taken" maxLength={1000} placeholder="Spoke to the student and called the father" help="Optional." />
      {!maint && <SSwitch name="informParent" title="Tell the parent" sub="A message from the incident template, when Hostel Settings allows it." />}
      {type === "DISCIPLINE" && behaviourTypes && behaviourTypes.length > 0 && (
        <SSelect name="behaviourTypeKey" label="Add to the behaviour record" options={[{ value: "", label: "No, keep it in the hostel log only" }, ...behaviourTypes]} start="" help="Seen by the class teacher and the counsellor in Student Management." />
      )}
      {maint && requestPlaces && (
        <>
          <div className="flex items-center gap-3 rounded-xl border border-line px-4 py-3">
            <div className="min-w-0 flex-1 text-[14px]">
              <b className="font-semibold block">Raise a maintenance request</b>
              <span className="block text-[12.5px] text-ink3 mt-0.5">Goes to the store keeper in Inventory Management, who assigns a technician.</span>
            </div>
            <Switch on={raise} onChange={setRaise} label="Raise a maintenance request" name="raiseRequest" />
          </div>
          {raise && <RequestFields places={requestPlaces} hostelId={hostelId} />}
        </>
      )}
      {maint && (!requestPlaces || !raise) && <p className="text-[12.5px] text-ink3 flex gap-1.5"><Info size={14} className="shrink-0 mt-0.5" aria-hidden="true" />Repairs are followed up from the hostel incident log.</p>}
    </SheetForm>
  );
}

/** Raises the maintenance request for a maintenance incident recorded earlier. */
export function RaiseRequestSheet({ closeHref, incidentId, words, problem, hostelId, places }: { closeHref: string; incidentId: string; words: string; problem: string; hostelId: string; places: RequestPlaces }) {
  return (
    <SheetForm title="Raise a maintenance request" sub={words} closeHref={closeHref} action={raiseMaintenanceAction} submitLabel="Raise request" pendingText="Sending…" hidden={{ incidentId }}>
      <div className="rounded-xl bg-sunken/60 px-4 py-3 text-[14px]">
        <span className="block text-[12.5px] font-semibold text-ink3 mb-0.5">Problem</span>
        {problem}
      </div>
      <RequestFields places={places} hostelId={hostelId} />
      <p className="text-[12.5px] text-ink3">The store keeper is told and follows it up in Inventory Management, Rooms, Labs &amp; Maintenance.</p>
    </SheetForm>
  );
}

/* ---------- Outing & Visitors ---------- */

function useGuardians(initial: GuardianChoice[] | null) {
  const [list, setList] = useState<GuardianChoice[] | null>(initial);
  const [pending, start] = useTransition();
  const load = (studentId: string | null) => {
    if (!studentId) { setList(null); return; }
    start(async () => setList(await guardiansAction(studentId)));
  };
  return { list, pending, load };
}

export function PassSheet({ closeHref, todayStr, nowTime, backBy, start, startGuardians }: { closeHref: string; todayStr: string; nowTime: string; backBy: string; start: FoundStudent | null; startGuardians: GuardianChoice[] | null }) {
  const [student, setStudent] = useState<FoundStudent | null>(start);
  const g = useGuardians(startGuardians);
  const tType = useTyped("outingType", "OUTING");
  const [type, setType] = useState(tType.value || "OUTING");
  const tG = useTyped("guardianId", "");
  const [gw, setGw] = useState(tG.value);
  const chosen = g.list?.find((x) => x.guardianId === gw) ?? null;
  return (
    <SheetForm title="New outing pass" sub="Recorded by the hostel, approved by the warden in Approvals." closeHref={closeHref} action={requestPassAction} submitLabel="Save and send for approval" wide pendingText="Saving…">
      <p className="text-[13px] text-ink2 flex flex-wrap items-center gap-2"><span className="font-semibold text-ink3">Kind</span><span className="inline-flex items-center h-6 px-2.5 rounded-full bg-brand/10 text-brand text-[12px] font-semibold">Gate Pass · Hostel Outing</span><span className="text-ink3">Early pickup at the gate is a Pickup pass in Front Office.</span></p>
      <StudentFind name="studentId" label="Student" mode="resident" start={student ? [student] : []} onPick={(x) => { setStudent(x[0] ?? null); setGw(""); g.load(x[0]?.id ?? null); }} help="Students living in the hostel only." />
      <SegField name="outingType" label="Type" start={type} onChange={setType} options={[{ value: "OUTING", label: "Outing · same day" }, { value: "LEAVE", label: "Leave · overnight" }]} />
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="grid grid-cols-[1fr_112px] gap-2">
          <SDate name="fromDate" label="From" required start={todayStr} min={todayStr} />
          <SText name="fromTime" label="Time" required type="time" start={nowTime} />
        </div>
        <div className="grid grid-cols-[1fr_112px] gap-2">
          {type === "LEAVE" ? <SDate key="leave" name="toDate" label="Back by" required start={todayStr} min={todayStr} /> : <FieldShell label="Back by" id="ps-same"><input id="ps-same" value="Same day" readOnly className={cx(inputCls(), "h-11 text-ink3")} /></FieldShell>}
          <SText name="toTime" label="Time" required type="time" start={backBy} />
        </div>
      </div>
      <FieldShell label="Going with" id="ps-gw" required error={tG.error} help={student ? "A named person: one of the student's guardians, or someone else." : "Choose the student first."}>
        {student ? (
          g.pending ? <span className="flex items-center gap-2 text-[13px] text-ink3"><Spinner /> Loading the guardians…</span> : (
            <div className="flex flex-wrap gap-2">
              {(g.list ?? []).map((x) => (
                <button key={x.guardianId} type="button" aria-pressed={gw === x.guardianId} disabled={Boolean(x.restriction)} title={x.restriction ?? undefined} onClick={() => setGw(x.guardianId)}
                  className={cx("min-h-10 px-3.5 rounded-xl text-[13.5px] font-semibold border transition inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed", gw === x.guardianId ? "bg-brand/10 border-brand text-brand" : "bg-surface border-line text-ink2 hover:border-ink3/50")}>
                  {x.name}<span className="text-[11.5px] font-normal text-ink3">{x.relation}{x.restriction ? " · restricted" : ""}</span>
                </button>
              ))}
              <button type="button" aria-pressed={gw === "other"} onClick={() => setGw("other")} className={cx("min-h-10 px-3.5 rounded-xl text-[13.5px] font-semibold border transition", gw === "other" ? "bg-brand/10 border-brand text-brand" : "bg-surface border-line text-ink2 hover:border-ink3/50")}>Someone else</button>
            </div>
          )
        ) : <p className="text-[13px] text-ink3">No student chosen.</p>}
        <input type="hidden" name="guardianId" value={gw} />
      </FieldShell>
      {gw === "other" && (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            <SText name="withName" label="Name" required maxLength={80} placeholder="Ravi Das" />
            <SSelect name="withRelation" label="Relation" required options={RELATIONS.map((r) => ({ value: r, label: r }))} placeholder="Choose" />
            <SText name="withPhone" label="Mobile" required inputMode="tel" maxLength={14} placeholder="98490 12345" />
          </div>
          <div className="rounded-xl p-3.5 text-[13.5px] text-ink2 flex gap-2.5 bg-warn/12"><ShieldAlert size={17} className="shrink-0 mt-0.5 text-warn" aria-hidden="true" /><p>Not on {student?.name.split(" ")[0] ?? "the student"}&apos;s list. The warden should call a parent before approving. Security checks the photo ID at the gate.</p></div>
        </>
      )}
      {chosen && !chosen.allowed && !chosen.restriction && <p className="text-[12.5px] text-warn">{chosen.name} is not marked as allowed to pick up {student?.name.split(" ")[0]}. The warden decides.</p>}
      <SArea name="reason" label="Reason" required maxLength={200} placeholder="Family lunch for grandmother's birthday" />
    </SheetForm>
  );
}

export function RejectPassSheet({ closeHref, passId, words }: { closeHref: string; passId: string; words: string }) {
  return (
    <SheetForm title="Reject this pass?" sub={words} closeHref={closeHref} action={decidePassAction} submitLabel="Reject pass" submitVariant="danger" hidden={{ passId, decision: "reject" }}>
      <SArea name="note" label="Reason" required maxLength={300} placeholder="Unit test on Monday. Please take him next Sunday." help="Plain words. The person who asked reads this." />
    </SheetForm>
  );
}

export function CancelPassSheet({ closeHref, passId, passNo }: { closeHref: string; passId: string; passNo: string }) {
  return (
    <SheetForm title={`Cancel pass ${passNo}?`} sub="For an approved pass the student did not use. It stays in the history." closeHref={closeHref} action={cancelPassAction} submitLabel="Cancel pass" submitVariant="danger" hidden={{ passId }}>
      <SArea name="reason" label="Reason" required maxLength={200} placeholder="Father could not come today" />
    </SheetForm>
  );
}

export function VisitorSheet({ closeHref, hours, inHours, start, startGuardians }: { closeHref: string; hours: string; inHours: boolean; start: FoundStudent | null; startGuardians: GuardianChoice[] | null }) {
  const [student, setStudent] = useState<FoundStudent | null>(start);
  const g = useGuardians(startGuardians);
  const tG = useTyped("guardianId", "");
  const [gw, setGw] = useState(tG.value);
  const chosen = g.list?.find((x) => x.guardianId === gw) ?? null;
  const needsWarden = gw === "other" || (chosen ? !chosen.allowed : false) || !inHours;
  const tOk = useTyped("wardenApproved", "");
  return (
    <SheetForm title="Record a visitor" sub="Every hostel visitor meets one named student." closeHref={closeHref} action={recordVisitorAction} submitLabel="Let in" pendingText="Saving…">
      <StudentFind name="studentId" label="Came to meet" mode="resident" start={student ? [student] : []} onPick={(x) => { setStudent(x[0] ?? null); setGw(""); g.load(x[0]?.id ?? null); }} help="The resident student the visitor has come to meet." />
      {student && (
        <FieldShell label="Visitor" id="vs-who" required error={tG.error}>
          {g.pending ? <span className="flex items-center gap-2 text-[13px] text-ink3"><Spinner /> Loading the list…</span> : (
            <div className="flex flex-wrap gap-2">
              {(g.list ?? []).map((x) => (
                <button key={x.guardianId} type="button" aria-pressed={gw === x.guardianId} onClick={() => setGw(x.guardianId)}
                  className={cx("min-h-10 px-3.5 rounded-xl text-[13.5px] font-semibold border transition inline-flex items-center gap-2", gw === x.guardianId ? "bg-brand/10 border-brand text-brand" : "bg-surface border-line text-ink2 hover:border-ink3/50")}>
                  {x.name}<span className="text-[11.5px] font-normal text-ink3">{x.relation}{x.allowed ? "" : " · not on the list"}</span>
                </button>
              ))}
              <button type="button" aria-pressed={gw === "other"} onClick={() => setGw("other")} className={cx("min-h-10 px-3.5 rounded-xl text-[13.5px] font-semibold border transition", gw === "other" ? "bg-brand/10 border-brand text-brand" : "bg-surface border-line text-ink2 hover:border-ink3/50")}>Someone else</button>
            </div>
          )}
          <input type="hidden" name="guardianId" value={gw === "other" ? "" : gw} />
        </FieldShell>
      )}
      {gw === "other" && (
        <div className="grid sm:grid-cols-3 gap-3">
          <SText name="name" label="Visitor's name" required maxLength={80} placeholder="Suresh Verma" />
          <SSelect name="relation" label="Relation" required options={RELATIONS.map((r) => ({ value: r, label: r }))} placeholder="Choose" />
          <SText name="phone" label="Mobile" required inputMode="tel" maxLength={14} placeholder="98491 22870" />
        </div>
      )}
      {student && (gw || !inHours) && (
        !needsWarden ? (
          <div className="rounded-xl p-3.5 text-[13.5px] text-ink2 flex gap-2.5 bg-brand/[.06] border border-brand/20"><ShieldCheck size={17} className="shrink-0 mt-0.5 text-brand" aria-hidden="true" /><p><b className="font-semibold text-ink">{chosen?.name} is on {student.name.split(" ")[0]}&apos;s list</b> as {chosen?.relation.toLowerCase()}. They can meet without approval.</p></div>
        ) : (
          <div className={cx("rounded-xl p-3.5 text-[13.5px] flex flex-col gap-2.5", tOk.error ? "bg-bad/10" : "bg-warn/12")}>
            <p className="text-ink2 flex gap-2"><ShieldAlert size={17} className={cx("shrink-0 mt-0.5", tOk.error ? "text-bad" : "text-warn")} aria-hidden="true" />
              <span>{gw && (gw === "other" || (chosen && !chosen.allowed)) ? <><b className="font-semibold text-ink">Not on {student.name.split(" ")[0]}&apos;s authorised list.</b> Call a parent to check, then the warden approves.</> : <><b className="font-semibold text-ink">Outside visiting hours</b> ({hours}). The warden approves.</>}</span>
            </p>
            <SSwitch name="wardenApproved" title="Warden approved this visit" sub="Recorded with your name." />
            {tOk.error && <p className="text-[12.5px] text-bad" role="alert">{tOk.error}</p>}
          </div>
        )
      )}
      <SText name="note" label="Note" maxLength={200} placeholder="Optional. For example: brought sweets for Diwali." />
    </SheetForm>
  );
}

/* ---------- Mess ---------- */

export function MenuSheet({ closeHref, week, day, dayName, meal, start }: { closeHref: string; week: string; day: number; dayName: string; meal: string; start: { dishes: string; kcal: string; proteinG: string; note: string } }) {
  return (
    <SheetForm title={`${dayName} · ${meal}`} sub="Calories and protein are per plate." closeHref={closeHref} action={saveMenuAction} submitLabel="Save meal" hidden={{ week, day: String(day), meal }}>
      <SArea name="dishes" label="What is served" required maxLength={200} start={start.dishes} placeholder="Idli, sambar, coconut chutney" />
      <div className="grid grid-cols-2 gap-3">
        <SText name="kcal" label="Calories per plate" type="number" min={0} max={3000} inputMode="numeric" start={start.kcal} help="Optional" />
        <SText name="proteinG" label="Protein (g)" type="number" min={0} max={200} inputMode="numeric" start={start.proteinG} help="Optional" />
      </div>
      <SText name="note" label="Nutrition note" maxLength={200} start={start.note} placeholder="Optional. For example: veg choice: paneer" />
    </SheetForm>
  );
}

export function CountSheet({ closeHref, date, dateWords, meal, expected, start }: { closeHref: string; date: string; dateWords: string; meal: string; expected: number; start: { actual: string; note: string } }) {
  const t = useTyped("actual", start.actual || String(expected));
  const [n, setN] = useState(Number(t.value));
  return (
    <SheetForm title={`${meal} head count`} sub={`${dateWords}. Expected ${expected}: boarders in the hostel, not on an outing or leave.`} closeHref={closeHref} action={saveHeadCountAction} submitLabel="Save count" hidden={{ date, meal }}>
      <FieldShell label="Plates served" id="hc-n" required error={t.error}>
        <input key={t.key} id="hc-n" name="actual" type="number" inputMode="numeric" min={0} max={5000} defaultValue={t.value} onChange={(e) => setN(Number(e.target.value))} aria-invalid={t.error ? true : undefined} className={cx(inputCls(t.error), "h-12 w-36 tnum text-[18px]")} />
      </FieldShell>
      {n > expected + 5 && <p className="text-[12.5px] text-warn">More than the boarders expected ({expected}). Count again, or say why below.</p>}
      <SText name="note" label={n < expected ? "Why fewer?" : "Note"} maxLength={200} start={start.note} placeholder={n < expected ? "2 fasting for Navratri" : "Optional"} />
    </SheetForm>
  );
}

export function ExpenseSheet({ closeHref, todayStr, vendors, items, billAbove }: { closeHref: string; todayStr: string; vendors: Opt[]; items: string[]; billAbove: string | null }) {
  const t = useTyped("item", "");
  const [item, setItem] = useState(t.value);
  return (
    <SheetForm title="Add mess expense" sub="Goes to Finance, Expenses under Hostel mess." closeHref={closeHref} action={messExpenseAction} submitLabel="Add expense" pendingText="Saving…">
      <div className="grid grid-cols-2 gap-3">
        <SDate name="date" label="Date" required start={todayStr} max={todayStr} />
        <SMoney name="amount" label="Amount" required placeholder="6,840" />
      </div>
      <FieldShell label="Item or head" id="me-item" required error={t.error}>
        <input key={t.key} id="me-item" name="item" value={item} onChange={(e) => setItem(e.target.value)} maxLength={80} placeholder="Vegetables" aria-invalid={t.error ? true : undefined} className={cx(inputCls(t.error), "h-11")} />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {items.map((x) => <button type="button" key={x} onClick={() => setItem(x)} className={cx("h-8 px-3 rounded-full text-[13px] font-medium", item === x ? "bg-brand/10 text-brand" : "bg-sunken hover:bg-line")}>{x}</button>)}
        </div>
      </FieldShell>
      {vendors.length > 0 && <SSelect name="vendorId" label="Vendor" options={vendors} placeholder="No vendor" help="Optional. Vendors are kept in Finance." />}
      <FieldShell label="Bill photo" id="me-bill" help={`${billAbove ? `Needed for amounts over ${billAbove}. ` : ""}A photo or a PDF, up to 10 MB.`}>
        <input id="me-bill" name="bill" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="block w-full text-[13.5px] file:mr-3 file:h-10 file:px-4 file:rounded-xl file:border file:border-line file:bg-surface file:font-semibold file:text-ink2 hover:file:bg-sunken" />
      </FieldShell>
      <SSwitch name="paid" title="Paid in cash already" sub="Also goes in today's Day Book." />
      <SText name="note" label="Note" maxLength={300} placeholder="Optional" />
    </SheetForm>
  );
}

/* ---------- Hostel Settings: fee plans ---------- */

export type PlanStart = { id: string; name: string; hostelId: string; roomType: string; includesMess: boolean; note: string; installments: { label: string; due: string; amount: string }[] };

export function FeePlanSheet({ closeHref, hostels, start, yearName }: { closeHref: string; hostels: { id: string; name: string }[]; start: PlanStart | null; yearName: string }) {
  const t = useTyped("installments", null);
  const [rows, setRows] = useState(start?.installments.length ? start.installments : [{ label: "Quarter 1", due: "", amount: "" }]);
  const set = (i: number, k: "label" | "due" | "amount", v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const total = rows.reduce((s, r) => s + (Number(r.amount.replace(/[₹,\s]/g, "")) || 0), 0);
  return (
    <SheetForm title={start ? `Change ${start.name}` : "Add a hostel fee plan"} sub={`For ${yearName}. Students given a bed get these installments in their fees (Fee Management, under Hostel fee).`} closeHref={closeHref} action={saveFeePlanAction} wide
      submitLabel={start ? "Save plan" : "Add plan"} hidden={start ? { planId: start.id } : undefined}>
      <SText name="name" label="Plan name" required maxLength={60} start={start?.name} placeholder="Non-AC rooms" />
      <div className="grid sm:grid-cols-2 gap-3">
        <SSelect name="hostelId" label="Hostel" options={[{ value: "", label: "Every hostel" }, ...hostels.map((h) => ({ value: h.id, label: h.name }))]} start={start?.hostelId ?? ""} />
        <SSelect name="roomType" label="Room type" options={[{ value: "", label: "Every room type" }, ...ROOM_TYPES.map((x) => ({ value: x, label: x }))]} start={start?.roomType ?? ""} />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] font-semibold text-ink2 mb-1.5">Installments<span className="text-bad" aria-hidden="true"> *</span></legend>
        {t.error && <p className="text-[12.5px] text-bad" role="alert">{t.error}</p>}
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_150px_120px_auto] gap-2 items-center">
            <label className="sr-only" htmlFor={`in-l-${i}`}>Installment {i + 1} name</label>
            <input id={`in-l-${i}`} name="instLabel" value={r.label} onChange={(e) => set(i, "label", e.target.value)} placeholder="Quarter 1" className={cx(inputCls(), "h-10")} />
            <label className="sr-only" htmlFor={`in-d-${i}`}>Installment {i + 1} due date</label>
            <input id={`in-d-${i}`} name="instDue" type="date" value={r.due} onChange={(e) => set(i, "due", e.target.value)} className={cx(inputCls(), "h-10")} />
            <label className="sr-only" htmlFor={`in-a-${i}`}>Installment {i + 1} amount in rupees</label>
            <input id={`in-a-${i}`} name="instAmount" inputMode="decimal" value={r.amount} onChange={(e) => set(i, "amount", e.target.value)} placeholder="₹ 24000" className={cx(inputCls(), "h-10 tnum text-right")} />
            {rows.length > 1 ? <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="text-[13px] font-semibold text-bad hover:underline px-1">Remove</button> : <span />}
          </div>
        ))}
        <div className="flex items-center justify-between gap-3">
          {rows.length < 12 ? <button type="button" onClick={() => setRows((x) => [...x, { label: `Quarter ${x.length + 1}`, due: "", amount: x[x.length - 1]?.amount ?? "" }])} className="text-[13.5px] font-semibold text-brand hover:underline">Add installment</button> : <span />}
          <span className="text-[13px] text-ink3 tnum">Total ₹{total.toLocaleString("en-IN")} a year</span>
        </div>
      </fieldset>
      <SSwitch name="includesMess" title="Includes mess" sub="The mess part is not charged separately." start={start?.includesMess ?? true} />
      <SArea name="note" label="Note" maxLength={300} start={start?.note ?? ""} placeholder="Optional" />
    </SheetForm>
  );
}

export function ArchivePlanSheet({ closeHref, planId, name }: { closeHref: string; planId: string; name: string }) {
  return (
    <SheetForm title={`Archive ${name}?`} sub="New beds will not use it. Fees already added to students stay as they are." closeHref={closeHref} action={archiveFeePlanAction} submitLabel="Archive plan" submitVariant="danger" hidden={{ planId }}>
      <p className="text-[13.5px] text-ink2">You can add a new plan for the same rooms afterwards.</p>
    </SheetForm>
  );
}
