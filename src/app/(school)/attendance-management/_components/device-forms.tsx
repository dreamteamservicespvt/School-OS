"use client";

// Devices & QR forms (05 §2): add or edit a device (its key shown once with
// Copy), regenerate a key with a typed confirmation, map device users, QR
// sessions and settings, and the campus area with "Use my current location".

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckboxField, SelectField, TextArea, TextField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { ConfirmButton } from "@/components/ui/confirm";
import { ActionForm, FormDialog, type Action } from "../../staff-hr-management/_components/forms";
import { Words } from "@/lib/i18n/client";

type Option = { value: string; label: string };

function CopyKey({ value }: { value: string }) {
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg border border-line-strong bg-surface-2 px-3 py-2 font-mono text-sm" aria-label="Device key">{value}</code>
        <Button onClick={async () => {
          try { await navigator.clipboard.writeText(value); setCopied("yes"); } catch { setCopied("no"); }
        }}>{copied === "yes" ? "Copied" : "Copy"}</Button>
      </div>
      {copied === "no" && <p className="text-sm text-danger"><Words k="This browser did not allow copying. Select the key and copy it by hand." /></p>}
      <p className="text-sm text-ink-2" aria-live="polite">{copied === "yes" ? "Copied. Paste it into the device's settings now." : "Paste it into the device's settings. It is shown only this once; School OS keeps only a scrambled copy."}</p>
    </div>
  );
}

export function KeyDialog({ keyValue, onClose, title }: { keyValue: string | null; onClose: () => void; title: string }) {
  return (
    <Dialog open={Boolean(keyValue)} onClose={onClose} title={title}>
      {keyValue && (
        <div className="space-y-4">
          <CopyKey value={keyValue} />
          <div className="flex justify-end border-t border-line pt-4"><Button onClick={onClose}><Words k="I have copied it" /></Button></div>
        </div>
      )}
    </Dialog>
  );
}

export type DeviceValues = { id: string; name: string; serialNo: string; location: string | null; campusId: string; deviceType: string; allowedUsers: string; ipAddress: string | null; connectionNote: string | null };

export function DeviceForm({ action, campuses, types, allowed, device, defaultCampus }: {
  action: Action; campuses: Option[]; types: Option[]; allowed: Option[]; device?: DeviceValues; defaultCampus?: string;
}) {
  const router = useRouter();
  const [key, setKey] = useState<string | null>(null);
  return (
    <>
      <FormDialog trigger={device ? "Edit" : "Add device"} triggerVariant={device ? "secondary" : "primary"} title={device ? `Edit ${device.name}` : "Add device"} action={action}
        submitLabel={device ? "Save device" : "Add device"} wide hidden={device ? { deviceId: device.id } : undefined}
        onSaved={(s) => { const k = (s?.data as { key?: string } | undefined)?.key; if (k) setKey(k); router.refresh(); }}>
        {(f) => (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Device name" name="name" required maxLength={80} placeholder="Main gate scanner" defaultValue={f.val("name", device?.name)} error={f.err("name")} className="sm:col-span-2" />
            <TextField label="Device ID or serial number" name="serialNo" required maxLength={60} defaultValue={f.val("serialNo", device?.serialNo)} error={f.err("serialNo")} help="Unique. Printed on the device or in its menu." />
            <TextField label="Location" name="location" maxLength={120} placeholder="Main entrance" defaultValue={f.val("location", device?.location)} error={f.err("location")} />
            <SelectField label="Campus" name="campusId" required options={campuses} defaultValue={f.val("campusId", device?.campusId ?? defaultCampus)} error={f.err("campusId")} />
            <SelectField label="Device type" name="deviceType" required placeholder="Choose" options={types} defaultValue={f.val("deviceType", device?.deviceType)} error={f.err("deviceType")} />
            <SelectField label="Allowed users" name="allowedUsers" required options={allowed} defaultValue={f.val("allowedUsers", device?.allowedUsers ?? "both")} error={f.err("allowedUsers")} className="sm:col-span-2" />
            <details className="sm:col-span-2" open={Boolean(device?.ipAddress || device?.connectionNote)}>
              <summary className="min-h-11 cursor-pointer content-center font-medium text-brand-text"><Words k="More details: connection" /></summary>
              <div className="mt-2 grid gap-4 sm:grid-cols-2">
                <TextField label="IP address" name="ipAddress" maxLength={100} placeholder="192.168.1.20" defaultValue={f.val("ipAddress", device?.ipAddress)} error={f.err("ipAddress")} />
                <TextArea label="API or connection notes" name="connectionNote" rows={2} maxLength={500} defaultValue={f.val("connectionNote", device?.connectionNote)} className="sm:col-span-2" />
              </div>
            </details>
          </div>
        )}
      </FormDialog>
      <KeyDialog keyValue={key} onClose={() => setKey(null)} title="Device added: copy its key" />
    </>
  );
}

export function RegenerateKey({ deviceId, name, action }: { deviceId: string; name: string; action: (id: string) => Promise<{ ok: true; key: string } | { ok: false; message: string }> }) {
  const [key, setKey] = useState<string | null>(null);
  const router = useRouter();
  return (
    <>
      <ConfirmButton trigger="Regenerate key" triggerVariant="danger-outline" title={`Regenerate the key for ${name}?`} confirmLabel="Regenerate key" confirmVariant="danger" typeToConfirm="REGENERATE"
        onConfirm={async () => {
          const r = await action(deviceId);
          if (!r.ok) return r.message;
          setKey(r.key);
          router.refresh();
        }}>
        <Words k="The old key stops working now. The device cannot send punches until you put the new key into it." />
      </ConfirmButton>
      <KeyDialog keyValue={key} onClose={() => setKey(null)} title="New key: copy it now" />
    </>
  );
}

export function MapUserForm({ action, deviceId, people, defaultNo }: { action: Action; deviceId: string; people: Option[]; defaultNo?: string }) {
  const [q, setQ] = useState("");
  const shown = q.trim() ? people.filter((p) => p.label.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 200) : people.slice(0, 200);
  return (
    <FormDialog trigger={defaultNo ? "Map" : "Map a user"} triggerVariant={defaultNo ? "secondary" : "primary"} triggerSize="sm" title={defaultNo ? `Map device user ${defaultNo}` : "Map a device user"} action={action} submitLabel="Save mapping" hidden={{ deviceId }}>
      {(f) => (
        <div className="space-y-4">
          <TextField label="Device user number" name="deviceUserNo" required maxLength={40} defaultValue={f.val("deviceUserNo", defaultNo)} error={f.err("deviceUserNo")} help="The number the person has on the device." />
          <label className="block">
            <span className="mb-1 block text-sm font-medium"><Words k="Find the person" /></span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, staff ID or admission number" className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-base" />
          </label>
          <SelectField label="Student or staff member" name="who" required placeholder={shown.length ? "Choose" : "Nobody matches"} options={shown} defaultValue={f.val("who")} error={f.err("who")} />
        </div>
      )}
    </FormDialog>
  );
}

export function QrSettingsForm({ action, values, themes }: { action: Action; values: { qrStudentsOn: boolean; qrStaffOn: boolean; qrRotation: string; posterTheme: string }; themes: Option[] }) {
  return (
    <ActionForm action={action} submitLabel="Save QR settings" keep>
      {(f) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <CheckboxField label="QR check-in for staff" name="qrStaffOn" defaultChecked={values.qrStaffOn} help="Staff scan the entrance QR on their own phone when they arrive." />
          <CheckboxField label="QR check-in for students" name="qrStudentsOn" defaultChecked={values.qrStudentsOn} help="Only for students who have their own login." />
          <SelectField label="New QR codes" name="qrRotation" options={[{ value: "daily", label: "Change every day (safer)" }, { value: "fixed", label: "Fixed (print once)" }]} defaultValue={f.val("qrRotation", values.qrRotation)} />
          <SelectField label="Poster theme" name="posterTheme" options={themes} defaultValue={f.val("posterTheme", values.posterTheme)} error={f.err("posterTheme")} />
        </div>
      )}
    </ActionForm>
  );
}

export function QrCreateForm({ action, campuses, rotation }: { action: Action; campuses: Option[]; rotation: string }) {
  const [scope, setScope] = useState("school");
  return (
    <FormDialog trigger="New QR" triggerVariant="primary" title="New QR check-in" action={action} submitLabel="Create QR">
      {(f) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" name="name" required maxLength={80} placeholder="Main entrance" defaultValue={f.val("name")} error={f.err("name")} className="sm:col-span-2" />
          <SelectField label="Who checks in" name="forWhom" options={[{ value: "staff", label: "Staff" }, { value: "students", label: "Students" }, { value: "both", label: "Staff and students" }]} defaultValue={f.val("forWhom", "staff")} error={f.err("forWhom")} />
          <SelectField label="Code" name="rotation" options={[{ value: "daily", label: "Changes every day" }, { value: "fixed", label: "Fixed" }]} defaultValue={f.val("rotation", rotation)} error={f.err("rotation")} />
          <SelectField label="Scope" name="scope" value={scope} onChange={(e) => setScope(e.target.value)} options={[{ value: "school", label: "Whole school" }, { value: "campus", label: "One campus" }]} />
          {scope === "campus" && <SelectField label="Campus" name="campusId" required options={campuses} defaultValue={f.val("campusId", campuses[0]?.value)} error={f.err("campusId")} />}
          <TextField label="Expires on" name="expiresAt" type="date" defaultValue={f.val("expiresAt")} error={f.err("expiresAt")} help="Optional. Empty means it does not expire." className="sm:col-span-2" />
        </div>
      )}
    </FormDialog>
  );
}

/** The campus point and the allowed circle, drawn to scale (no outside map service). */
function FenceDrawing({ radius }: { radius: number }) {
  const r = Math.max(10, Math.min(90, (radius / Math.max(radius * 1.4, 60)) * 90));
  return (
    <svg viewBox="0 0 200 200" className="h-48 w-48 shrink-0" role="img" aria-label={`Allowed circle of ${radius} metres around the campus point`}>
      <rect x="0" y="0" width="200" height="200" rx="16" className="fill-surface-2" />
      <path d="M0 100h200M100 0v200" className="stroke-line-strong" strokeDasharray="4 4" />
      <circle cx="100" cy="100" r={r} className="fill-brand-soft stroke-brand" strokeWidth="2" />
      <circle cx="100" cy="100" r="5" className="fill-brand" />
      <text x="100" y={100 - r - 6 < 12 ? 190 : 100 - r - 6} textAnchor="middle" className="fill-ink-2 text-[11px]">{radius} m</text>
    </svg>
  );
}

export function GeoFenceForm({ action, campuses, fence, campusId }: {
  action: Action; campuses: Option[]; campusId: string;
  fence: { latitude: number; longitude: number; radiusM: number; studentsOn: boolean; staffOn: boolean } | null;
}) {
  const [lat, setLat] = useState(fence ? String(fence.latitude) : "");
  const [lng, setLng] = useState(fence ? String(fence.longitude) : "");
  const [radius, setRadius] = useState(fence?.radiusM ?? 50);
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const locate = () => {
    if (!("geolocation" in navigator)) { setProblem("This browser cannot share its location. Type the latitude and longitude."); return; }
    setLocating(true);
    setProblem(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLat(p.coords.latitude.toFixed(6)); setLng(p.coords.longitude.toFixed(6)); setLocating(false); },
      (e) => { setLocating(false); setProblem(e.code === 1 ? "Location was not allowed. Allow location for this site, or type the numbers." : "The location could not be found. Try again outside, or type the numbers."); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  return (
    <ActionForm action={action} submitLabel="Save campus area" keep hidden={{ campusId }}>
      {(f) => (
        <div className="flex flex-col gap-5 sm:flex-row">
          <FenceDrawing radius={radius} />
          <div className="grid flex-1 gap-4 sm:grid-cols-2">
            {campuses.length > 1 && <p className="text-sm text-ink-2 sm:col-span-2"><Words k="Campus:" /> {campuses.find((c) => c.value === campusId)?.label}</p>}
            <div className="sm:col-span-2">
              <Button variant="secondary" onClick={locate} loading={locating} loadingText="Finding you…"><Words k="Use my current location" /></Button>
              {problem && <p role="alert" className="mt-1 text-sm text-danger">{problem}</p>}
            </div>
            <TextField label="Latitude" name="latitude" required inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} error={f.err("latitude")} placeholder="17.385044" />
            <TextField label="Longitude" name="longitude" required inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} error={f.err("longitude")} placeholder="78.486671" />
            <TextField label="Radius in metres" name="radiusM" type="number" required min={25} max={5000} value={String(radius)} onChange={(e) => setRadius(Number(e.target.value) || 0)} error={f.err("radiusM")} help="At least 25 m. 50 m suits most schools." />
            <div className="space-y-3 sm:col-span-2">
              <CheckboxField label="On for staff" name="staffOn" defaultChecked={fence?.staffOn ?? true} help="Staff QR and mobile check-ins must be inside the circle." />
              <CheckboxField label="On for students" name="studentsOn" defaultChecked={fence?.studentsOn ?? false} />
            </div>
            {lat && lng && <p className="text-sm sm:col-span-2"><a className="font-medium text-brand-text hover:underline" target="_blank" rel="noopener noreferrer" href={`https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lng)}#map=18/${encodeURIComponent(lat)}/${encodeURIComponent(lng)}`}><Words k="Check the point on a map" /></a></p>}
          </div>
        </div>
      )}
    </ActionForm>
  );
}

export function NoKeyNote() {
  return <Alert tone="info"><Words k="Device keys are shown only once, when the device is added or its key is regenerated." /></Alert>;
}
