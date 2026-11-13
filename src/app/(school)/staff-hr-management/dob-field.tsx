"use client";
// Date of birth box for staff: warns gently while typing when the age is unusual
// (under 18 or over 80), without stopping the save (layman test LD5).
import { useState } from "react";
import { TextField } from "@/components/ui/field";
import { staffAgeWarningFor } from "@/lib/staff/age";

export function StaffDobField({ today: given, defaultValue, error }: { today?: string; defaultValue?: string; error?: string }) {
  const today = given ?? new Date().toISOString().slice(0, 10);
  const [warning, setWarning] = useState(() => staffAgeWarningFor(defaultValue ?? "", today));
  return (
    <TextField label="Date of birth" name="dateOfBirth" type="date" max={today} defaultValue={defaultValue} error={error}
      help={warning ?? undefined} onChange={(e) => setWarning(staffAgeWarningFor(e.target.value, today))} />
  );
}
