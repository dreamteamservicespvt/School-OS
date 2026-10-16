"use client";

import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/ui/confirm";
import { SelectField, TextField } from "@/components/ui/field";
import { FormDialog, err, v } from "../_components/form-dialog";
import { bookLabAction, cancelBookingAction } from "./actions";

type Booking = { id: string; date: string; periodNo: number; sectionLabel: string | null; staffName: string; purpose: string | null; mine: boolean };
const fmt = (iso: string) => iso.split("-").reverse().join("-");

export function LabBookings({ room, today, slots, sections, bookings, canBook, canCancelAll }: {
  room: { id: string; name: string };
  today: string;
  slots: { number: number; label: string }[];
  sections: { id: string; label: string }[];
  bookings: Booking[];
  canBook: boolean;
  canCancelAll: boolean;
}) {
  const router = useRouter();
  return (
    <section aria-labelledby="lab-h" className="mt-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="lab-h" className="font-semibold">Bookings of {room.name}, next two weeks</h2>
        {canBook && (
          <FormDialog trigger={`Book ${room.name}`} triggerVariant="primary" title={`Book ${room.name}`} action={bookLabAction} submitLabel="Book" hidden={{ roomId: room.id }}>
            {(state) => (
              <>
                <TextField label="Date" name="date" type="date" required min={today} defaultValue={v(state, "date", today)} error={err(state, "date")} />
                <SelectField label="Period" name="periodNo" required defaultValue={v(state, "periodNo")} placeholder="Choose a period" error={err(state, "periodNo")}
                  options={slots.map((s) => ({ value: String(s.number), label: s.label }))} help="Blocked if the room is already booked or has a class then." />
                <SelectField label="Class" name="sectionId" defaultValue={v(state, "sectionId")} placeholder="No class" error={err(state, "sectionId")} options={sections.map((s) => ({ value: s.id, label: s.label }))} />
                <TextField label="Purpose" name="purpose" defaultValue={v(state, "purpose")} placeholder="Titration practical" error={err(state, "purpose")} />
              </>
            )}
          </FormDialog>
        )}
      </div>
      {bookings.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-ink-2">No bookings in the next two weeks.</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {bookings.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
              <span><strong>{fmt(b.date)}, period {b.periodNo}</strong> · {b.sectionLabel ?? "No class"} · {b.staffName}{b.purpose ? ` · ${b.purpose}` : ""}</span>
              {(b.mine || canCancelAll) && (
                <ConfirmButton trigger="Cancel" triggerVariant="ghost" triggerClassName="text-danger" title="Cancel this booking?" confirmLabel="Cancel booking" confirmVariant="danger"
                  onConfirm={async () => { const p = await cancelBookingAction(b.id); if (!p) router.refresh(); return p; }}>
                  {room.name} becomes free for period {b.periodNo} on {fmt(b.date)}.
                </ConfirmButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
