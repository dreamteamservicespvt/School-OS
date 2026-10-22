"use client";

// Rooms, Labs & Maintenance sheets: a place in the facility register, a
// maintenance request (raise, assign a technician, close with cost), a lab
// experiment and a lab safety check. ProblemFields is shared with the
// "Report a problem" page every staff member uses from a phone.

import { useState } from "react";
import { Camera } from "lucide-react";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { SArea, SDate, SMoney, SSelect, SSwitch, SText } from "@/components/ui/sheet-fields";
import { Alert } from "@/components/ui/alert";
import { InlineForm, SegField } from "../_components/client";
import { reportProblemAction } from "../report-problem/actions";
import { Warned } from "../purchases/sheets";
import { archiveFacilityAction, assignMaintenanceAction, closeMaintenanceAction, raiseAction, safetyCheckAction, saveExperimentAction, saveFacilityAction } from "./actions";
import { Words } from "@/lib/i18n/client";

type Opt = { value: string; label: string };
export type AssetPick = { value: string; label: string; roomId: string | null };

const PRIORITIES = [{ value: "LOW", label: "Low" }, { value: "NORMAL", label: "Normal" }, { value: "HIGH", label: "High" }, { value: "URGENT", label: "Urgent" }];

/** Place, asset in that place, problem, photo (the phone's camera) and priority. */
/** Report a problem's form on the page (any staff member); it clears for the next problem after sending. */
export function ReportProblemForm({ places, assets }: { places: Opt[]; assets: AssetPick[] }) {
  return (
    <InlineForm action={reportProblemAction} submit="Send" pendingText="Sending…">
      {() => <ProblemFields places={places} assets={assets} />}
    </InlineForm>
  );
}

export function ProblemFields({ places, assets, startPlace = "" }: { places: Opt[]; assets: AssetPick[]; startPlace?: string }) {
  const typed = useTyped("placeId", startPlace);
  const [place, setPlace] = useState(typed.value);
  const here = assets.filter((a) => a.roomId === place);
  const [photo, setPhoto] = useState("");
  return (
    <>
      <SSelect name="placeId" label="Place" required options={places} start={typed.value} placeholder="Choose the room or place" onChange={(e) => setPlace(e.target.value)} />
      {here.length > 0 && <SSelect key={place} name="assetId" label="Asset" options={here} placeholder="Not a particular asset" help="If something particular is broken, like the projector" />}
      <SArea name="problem" label="Problem" required rows={3} maxLength={500} placeholder="For example: ceiling fan not working, makes a noise" />
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink2"><Words k="Photo" /></span>
        <label className="flex items-center gap-3 rounded-xl border border-dashed border-line px-4 py-3 cursor-pointer hover:bg-sunken/60">
          <Camera size={20} className="text-ink3" aria-hidden="true" />
          <span className="text-[14px] min-w-0 truncate">{photo || "Take a photo or choose one (optional)"}</span>
          <input type="file" name="photo" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0]?.name ?? "")} />
        </label>
      </div>
      <SegField name="priority" label="Priority" start="NORMAL" options={PRIORITIES} />
    </>
  );
}

export function RaiseSheet({ closeHref, places, assets, startPlace }: { closeHref: string; places: Opt[]; assets: AssetPick[]; startPlace?: string }) {
  return (
    <SheetForm title="Raise a maintenance request" sub="Any staff member can also report a problem from their phone." closeHref={closeHref} action={raiseAction} submitLabel="Raise request" pendingText="Saving…">
      <ProblemFields places={places} assets={assets} startPlace={startPlace} />
    </SheetForm>
  );
}

export type FacilityStart = { roomId: string; name: string; type: string; capacity: string; building: string; floor: string; inChargeStaffId: string; note: string };

export function FacilitySheet({ closeHref, start, types, campuses, staff }: { closeHref: string; start: FacilityStart | null; types: readonly string[]; campuses: Opt[]; staff: Opt[] }) {
  return (
    <SheetForm title={start ? `Change ${start.name}` : "Add a place"} sub={start ? "The Time Table uses the same rooms." : "Rooms, labs, halls and grounds. Rooms also appear in the Time Table."} closeHref={closeHref}
      action={saveFacilityAction} submitLabel={start ? "Save" : "Add place"} hidden={start ? { roomId: start.roomId } : undefined}>
      <div className="grid grid-cols-[1fr_150px] gap-3">
        <SText name="name" label="Name" required maxLength={60} start={start?.name} placeholder="Lab 1, Main ground" />
        <SSelect name="type" label="Type" required options={types.map((t) => ({ value: t, label: t }))} start={start?.type ?? "Classroom"} />
      </div>
      {!start && campuses.length > 1 && <SSelect name="campusId" label="Campus" required options={campuses} start={campuses[0]?.value} />}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SText name="capacity" label="Capacity" inputMode="numeric" maxLength={5} start={start?.capacity} placeholder="40" />
        <SText name="building" label="Building" maxLength={60} start={start?.building} placeholder="Block A" />
        <SText name="floor" label="Floor" maxLength={20} start={start?.floor} placeholder="Ground" />
      </div>
      <SSelect name="inChargeStaffId" label="In charge" options={staff} start={start?.inChargeStaffId ?? ""} placeholder="No one" help="Told when a problem is reported here" />
      <SArea name="note" label="Note" maxLength={300} start={start?.note} placeholder="Optional" />
    </SheetForm>
  );
}

export function ArchiveFacilitySheet({ closeHref, roomId, name }: { closeHref: string; roomId: string; name: string }) {
  return (
    <SheetForm title={`Archive ${name}`} sub="The Time Table stops offering it. Its history stays." closeHref={closeHref} action={archiveFacilityAction} submitLabel="Archive" submitVariant="danger" hidden={{ roomId }}>
      <Alert tone="info"><Words k="A place with assets or open maintenance requests cannot be archived. Move or close them first." /></Alert>
    </SheetForm>
  );
}

export function AssignTechSheet({ closeHref, requestId, words, staff, vendors, start }: { closeHref: string; requestId: string; words: string; staff: Opt[]; vendors: Opt[]; start: { staffId: string; name: string; vendorId: string; priority: string } }) {
  const [who, setWho] = useState(start.name ? "OUTSIDE" : "STAFF");
  return (
    <SheetForm title="Assign a technician" sub={words} closeHref={closeHref} action={assignMaintenanceAction} submitLabel="Assign" hidden={{ requestId }}>
      <SegField name="who" label="Technician" start={who} onChange={setWho} options={[{ value: "STAFF", label: "Our staff" }, { value: "OUTSIDE", label: "Outside" }]} />
      {who === "STAFF" ? <SSelect name="technicianStaffId" label="Staff member" required options={staff} start={start.staffId} placeholder="Choose" help="Told in the app" />
        : (
          <div className="grid sm:grid-cols-2 gap-3">
            <SText name="technicianName" label="Name" required maxLength={80} start={start.name} placeholder="Raju, electrician" />
            <SSelect name="vendorId" label="Vendor" options={vendors} start={start.vendorId} placeholder="None" />
          </div>
        )}
      <SegField name="priority" label="Priority" start={start.priority || "NORMAL"} options={PRIORITIES} />
    </SheetForm>
  );
}

export function CloseRequestSheet({ closeHref, requestId, words, today }: { closeHref: string; requestId: string; words: string; today: string }) {
  const [status, setStatus] = useState("DONE");
  return (
    <SheetForm title="Close the request" sub={words} closeHref={closeHref} action={closeMaintenanceAction} submitLabel={status === "DONE" ? "Mark done" : "Cancel request"} submitVariant={status === "DONE" ? "primary" : "danger"} hidden={{ requestId }}>
      <SegField name="status" label="Outcome" start="DONE" onChange={setStatus} options={[{ value: "DONE", label: "Done" }, { value: "CANCELLED", label: "Cancelled" }]} />
      {status === "DONE" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <SDate name="doneOn" label="Done on" required start={today} max={today} />
            <SMoney name="cost" label="Cost" help="Empty if nothing was spent" />
          </div>
          <SSwitch name="toFinance" title="Send the cost to Finance" sub="Recorded as an expense under Repairs and maintenance." start />
          <SText name="billNo" label="Bill number" maxLength={40} placeholder="Optional" />
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink2"><Words k="Bill (photo or PDF)" />
            <input type="file" name="bill" accept="image/*,application/pdf" className="text-[13px] font-normal" />
          </label>
        </>
      )}
      <SArea name="closingNote" label={status === "DONE" ? "What was done" : "Why cancelled"} required={status === "CANCELLED"} maxLength={300} placeholder={status === "DONE" ? "Optional: for example replaced the capacitor" : "For example: raised twice"} />
      <Warned />
    </SheetForm>
  );
}

export type ExperimentStart = { id: string; classId: string; subject: string; title: string; labId: string; materials: string };

export function ExperimentSheet({ closeHref, start, classes, labs }: { closeHref: string; start: ExperimentStart | null; classes: Opt[]; labs: Opt[] }) {
  return (
    <SheetForm title={start ? "Change the experiment" : "Add an experiment"} closeHref={closeHref} action={saveExperimentAction} submitLabel={start ? "Save" : "Add"} hidden={start ? { experimentId: start.id } : undefined}>
      <div className="grid grid-cols-2 gap-3">
        <SSelect name="classId" label="Class" required options={classes} start={start?.classId ?? ""} placeholder="Choose" />
        <SText name="subject" label="Subject" required maxLength={60} start={start?.subject} placeholder="Physics" />
      </div>
      <SText name="title" label="Experiment" required maxLength={160} start={start?.title} placeholder="Verify Ohm's law" />
      <SSelect name="labId" label="Lab" options={labs} start={start?.labId ?? ""} placeholder="Any lab" />
      <SArea name="materials" label="Materials" maxLength={500} start={start?.materials} placeholder="Optional: rheostat, ammeter, voltmeter, connecting wires" />
    </SheetForm>
  );
}

export function SafetyCheckSheet({ closeHref, labs, lab, today, checklist }: { closeHref: string; labs: Opt[]; lab: string; today: string; checklist: readonly string[] }) {
  return (
    <SheetForm title="Record a lab safety check" sub="Untick what is not fine and say what is wrong. The store keeper is told." closeHref={closeHref} action={safetyCheckAction} submitLabel="Save check">
      <div className="grid grid-cols-2 gap-3">
        <SSelect name="labId" label="Lab" required options={labs} start={lab} placeholder="Choose" />
        <SDate name="date" label="Date" required start={today} max={today} />
      </div>
      <fieldset className="flex flex-col gap-1 rounded-xl border border-line p-3">
        <legend className="px-1 text-[13px] font-semibold text-ink2"><Words k="Checklist" /></legend>
        {checklist.map((c) => (
          <label key={c} className="flex items-center gap-2.5 py-1.5 text-[14px]">
            <input type="checkbox" name="passed" value={c} defaultChecked className="size-4" /> {c}
          </label>
        ))}
      </fieldset>
      <SArea name="note" label="What is wrong" maxLength={500} placeholder="Needed when something is unticked" />
    </SheetForm>
  );
}
