"use client";

// Add School (07-super-admin.md §4): one screen in three short parts. The
// warnings come from the server while typing; the server checks everything
// again when the school is created.

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as I from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Segmented, Switch } from "@/components/ui/controls";
import { FieldShell, inputCls, type Option } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Col, Split } from "@/components/ui/blocks";
import { cx } from "@/components/ui/cx";
import { Logo } from "@/components/shell/logo";
import type { FormState } from "@/lib/forms";
import type { AddWarnings } from "@/app/console/(app)/schools/new/actions";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;
type Check = (input: { name: string; city: string; phone: string; mobile: string; groupId: string | null }) => Promise<AddWarnings>;
const NUMS = [1, 2, 3].map((n) => { const C = () => <span className="text-[14px] font-bold tnum">{n}</span>; C.displayName = `Num${n}`; return C as unknown as I.LucideIcon; });
const digits = (t: string) => t.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "").replace(/^0(?=\d{10}$)/, "");
const mask = (t: string) => { const d = digits(t); return d.length === 10 ? `${d.slice(0, 2)}xxx xx${d.slice(7)}` : "98xxx xx123"; };
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const joinAnd = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const TYPE_ICON: Record<string, I.LucideIcon> = { "Day school": I.Sun, "Boarding school": I.BedDouble, "Pre-school": I.Baby };
const MOD_ICON: Record<string, I.LucideIcon> = { "library-management": I.Library, "inventory-management": I.Boxes, "hostel-management": I.BedDouble };
const CH: [string, string, I.LucideIcon][] = [["whatsapp", "WhatsApp", I.MessageCircle], ["email", "Email", I.Mail]];

export type AddSchoolProps = {
  action: Action;
  check: Check;
  states: string[];
  boards: string[];
  types: { value: string; sub: string }[];
  groups: Option[];
  core: string[];
  optional: { key: string; label: string }[];
  prices: { essential: number; complete: number; hostel: number; min: number };
  help: string | null;
  linkHost: string;
};

export function AddSchoolForm(p: AddSchoolProps) {
  const [state, run] = useActionState<FormState, FormData>(p.action, null);
  const v = (k: string, d = "") => (state && !state.ok ? state.values?.[k] ?? d : d);
  const [f, setF] = useState(() => ({
    name: v("name"), city: v("city"), state: v("state", "Telangana"), board: v("board", "CBSE"), schoolType: v("schoolType", "Day school"), phone: v("phone"), email: v("email"), approx: v("approxStudents"),
    group: v("group", "none"), newGroupName: v("newGroupName"), adminName: v("adminName"), adminMobile: v("adminMobile"), adminEmail: v("adminEmail"), adminRole: v("adminRole", "school-admin"),
    startAs: v("startAs", "TRIAL"), planKey: v("planKey", "essential"),
  }));
  const [ch, setCh] = useState<Set<string>>(new Set(["whatsapp"]));
  const [mods, setMods] = useState<Set<string>>(new Set());
  const [hostel, setHostel] = useState(false);
  const [tried, setTried] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [warn, setWarn] = useState<AddWarnings | null>(null);
  const set = (k: keyof typeof f) => (val: string) => setF((x) => ({ ...x, [k]: val }));
  const setType = (t: string) => { setF((x) => ({ ...x, schoolType: t })); const boarding = t === "Boarding school"; setMods(new Set(boarding ? ["hostel-management"] : [])); setHostel(boarding); };

  // Server warnings, a moment after typing stops.
  const { check } = p;
  useEffect(() => {
    const t = setTimeout(() => {
      void check({ name: f.name, city: f.city, phone: f.phone, mobile: f.adminMobile, groupId: f.group !== "none" && f.group !== "new" ? f.group : null }).then(setWarn, () => null);
    }, 400);
    return () => clearTimeout(t);
  }, [check, f.name, f.city, f.phone, f.adminMobile, f.group]);
  // A refused save closes the confirm box so the problems show next to their fields.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state && !state.ok) setConfirm(false);
  }

  const pd = digits(f.phone);
  const md = digits(f.adminMobile);
  const channels = CH.filter(([k]) => ch.has(k)).map(([, l]) => l);
  const groupName = f.group === "new" ? f.newGroupName.trim() : p.groups.find((g) => g.value === f.group)?.label.replace(/ \(\d+ schools?\)$/, "") ?? null;
  const sameGroup = Boolean(warn?.existing?.sameGroup);
  const modCount = p.core.length + mods.size;
  const approx = Number(digits(f.approx)) || 0;
  const per = f.planKey === "complete" ? p.prices.complete : p.prices.essential;
  const est = Math.min(Math.max(approx, p.prices.min), 1000) * per + Math.max(0, Math.max(approx, p.prices.min) - 1000) * (per / 2) + (hostel ? p.prices.hostel : 0);
  const roleWords = f.adminRole === "principal" ? "Principal / Owner" : "School Admin";
  const server = state && !state.ok ? state.errors ?? {} : {};
  const err: Record<string, string> = {
    name: !f.name.trim() ? "Enter the school’s name." : "",
    city: !f.city.trim() ? "Enter the city." : "",
    phone: !pd ? "Enter the school’s phone number." : pd.length !== 10 ? "Enter a 10-digit number." : "",
    newGroupName: f.group === "new" && !f.newGroupName.trim() ? "Name the new group." : "",
    adminName: !f.adminName.trim() ? "Enter the first School Admin’s full name." : "",
    adminMobile: !md ? "Enter their mobile number. It becomes their username." : md.length !== 10 || !/^[6-9]/.test(md) ? "Enter a 10-digit Indian mobile number." : warn?.existing && !sameGroup ? "This number already has a login in another school." : "",
    channels: ch.size === 0 ? "Pick at least one way to send the invite." : "",
    adminEmail: ch.has("email") && !f.adminEmail.trim() ? "Add their email to also send the invite by email." : "",
  };
  const show = (k: string) => (tried && err[k]) || server[k] || "";
  const bad = Object.values(err).filter(Boolean).length;
  const code = warn?.code ?? null;

  const steps: [I.LucideIcon, React.ReactNode][] = useMemo(() => [
    [I.Building2, f.name.trim() && f.city.trim() && code ? <>The school record is made with school code <span className="font-mono text-[12.5px]">{code}</span>, and its first campus.</> : <>The school record is made with its own school code, made from the name and city (like <span className="font-mono text-[12.5px]">SPS-JAI-001</span>), and its first campus.</>],
    [I.Database, "Its own data space is made, kept apart from every other school."],
    [I.UsersRound, "The starting roles are made: Principal / Owner, School Admin, Accountant, Teacher and the rest."],
    [I.LayoutGrid, `${modCount} modules are switched on, with the ${f.board} defaults ready to apply.`],
    [I.KeyRound, sameGroup ? `${f.adminName || "The admin"} already has a login in ${warn?.existing?.groupName ?? "the group"}, so only a School Access entry for this school is added.` : `${f.adminName || "The School Admin"}’s login is made with status Invited, as ${roleWords}.`],
    [I.Send, sameGroup ? "No invite is needed; they sign in as they do now." : `The invite goes out on ${joinAnd(channels) || "the channels chosen"}.`],
    [I.School, `The school appears in Schools as ${f.startAs === "TRIAL" ? "Trial" : "Active"}, and in the Activity Log.`],
  ], [f.name, f.city, f.board, f.adminName, f.startAs, code, modCount, sameGroup, warn, roleWords, channels]);

  const field = (k: string) => cx(inputCls(show(k)), "h-11");

  return (
    <form id="add-school" action={run} noValidate onSubmit={(e) => { if (!confirm) { e.preventDefault(); setTried(true); if (bad === 0) setConfirm(true); } }}>
      {Object.entries({ ...f, hostel: hostel ? "on" : "" }).map(([k, val]) => (["name", "city", "phone", "email", "approx", "newGroupName", "adminName", "adminMobile", "adminEmail"].includes(k) ? null : <input key={k} type="hidden" name={k} value={val} />))}
      {[...ch].map((c) => <input key={c} type="hidden" name="channels" value={c} />)}
      {[...mods].map((m) => <input key={m} type="hidden" name="optionalOn" value={m} />)}
      <Split side={380}>
        <Col>
          {state && !state.ok && state.message && !Object.keys(server).length && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[14px] text-bad font-semibold">{state.message}</p>}
          <Card>
            <CardHeader title="The school" description="Sets the school’s starting defaults" icon={NUMS[0]} />
            <div className="grid md:grid-cols-2 gap-4 px-5 pb-5">
              <FieldShell label="School name" required id="ad-name" error={show("name")} className="md:col-span-2">
                <input id="ad-name" name="name" value={f.name} onChange={(e) => set("name")(e.target.value)} className={field("name")} placeholder="Sunrise Public School" autoComplete="off" aria-invalid={show("name") ? true : undefined} />
              </FieldShell>
              <FieldShell label="City" required id="ad-city" error={show("city")}><input id="ad-city" name="city" value={f.city} onChange={(e) => set("city")(e.target.value)} className={field("city")} placeholder="Jaipur" aria-invalid={show("city") ? true : undefined} /></FieldShell>
              <FieldShell label="State" required id="ad-state"><Sel id="ad-state" value={f.state} onChange={set("state")} options={p.states.map((x) => ({ value: x, label: x }))} /></FieldShell>
              {warn?.sameName && (
                <div className="md:col-span-2 rounded-2xl bg-warn/12 px-4 py-3 flex flex-col md:flex-row md:items-center gap-3 text-[14px]">
                  <I.TriangleAlert size={19} className="text-warn shrink-0 hidden md:block" aria-hidden="true" />
                  <p className="flex-1 text-ink2"><b className="font-semibold text-ink">A school named {warn.sameName.name} in {warn.sameName.city} already exists, added {warn.sameName.addedOn.split("-").reverse().join("-")}.</b> Open it instead, or change the name or city if this is a different school.</p>
                  <Link href={`/console/schools/${warn.sameName.id}`} className={buttonClass("secondary", "sm")}>Open the existing school</Link>
                </div>
              )}
              <FieldShell label="Board" required id="ad-board" help="Sets the school’s starting defaults"><Sel id="ad-board" value={f.board} onChange={set("board")} options={p.boards.map((x) => ({ value: x, label: x }))} /></FieldShell>
              <FieldShell label="Group" id="ad-group" help="Only for a school that belongs to a group of schools">
                <Sel id="ad-group" value={f.group} onChange={set("group")} options={[{ value: "none", label: "None" }, ...p.groups, { value: "new", label: "Make a new group…" }]} />
              </FieldShell>
              {f.group === "new" && <FieldShell label="New group name" required id="ad-newgroup" error={show("newGroupName")} className="md:col-span-2"><input id="ad-newgroup" name="newGroupName" value={f.newGroupName} onChange={(e) => set("newGroupName")(e.target.value)} className={field("newGroupName")} placeholder="Green Valley Group" /></FieldShell>}
              <FieldShell label="School type" required id="ad-type" help="Decides which modules start switched on" className="md:col-span-2">
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="School type" id="ad-type">
                  {p.types.map((t) => {
                    const on = f.schoolType === t.value;
                    const Ic = TYPE_ICON[t.value] ?? I.School;
                    return (
                      <button key={t.value} type="button" role="radio" aria-checked={on} onClick={() => setType(t.value)}
                        className={cx("rounded-2xl border-2 p-3 text-left transition flex flex-col gap-1.5 min-w-0", on ? "border-brand bg-brand/5" : "border-line hover:border-ink3/40")}>
                        <Ic size={18} className={on ? "text-brand" : "text-ink3"} aria-hidden="true" />
                        <span className="text-[13.5px] font-semibold leading-tight">{t.value}</span>
                        <span className="text-[11.5px] text-ink3 leading-snug hidden sm:block">{t.sub}</span>
                      </button>
                    );
                  })}
                </div>
              </FieldShell>
              <FieldShell label="School phone" required id="ad-phone" error={show("phone")}>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3 text-[15px]" aria-hidden="true">+91</span>
                  <input id="ad-phone" name="phone" inputMode="numeric" value={f.phone} onChange={(e) => set("phone")(e.target.value.replace(/[^\d ]/g, "").slice(0, 12))} className={cx(field("phone"), "pl-12 tnum")} placeholder="94140 55218" aria-invalid={show("phone") ? true : undefined} />
                </div>
                {warn?.samePhone && !show("phone") && <p className="text-[12.5px] text-warn flex items-center gap-1.5"><I.TriangleAlert size={14} className="shrink-0" aria-hidden="true" />{warn.samePhone.name}, {warn.samePhone.city} already uses this number.</p>}
              </FieldShell>
              <FieldShell label="School email" id="ad-email"><input id="ad-email" name="email" type="email" value={f.email} onChange={(e) => set("email")(e.target.value)} className={field("email")} placeholder="office@school.in" /></FieldShell>
              <FieldShell label="Approximate number of students" id="ad-approx" help="Helps plan support and the first invoice"><input id="ad-approx" name="approxStudents" inputMode="numeric" value={f.approx} onChange={(e) => set("approx")(e.target.value.replace(/\D/g, "").slice(0, 5))} className={cx(field("approx"), "tnum")} placeholder="420" /></FieldShell>
            </div>
          </Card>

          <Card>
            <CardHeader title="The first School Admin" description="They create every other login in the school" icon={NUMS[1]} />
            <div className="grid md:grid-cols-2 gap-4 px-5 pb-5">
              <FieldShell label="Full name" required id="ad-admin" error={show("adminName")} help="Usually the owner, principal or office head."><input id="ad-admin" name="adminName" value={f.adminName} onChange={(e) => set("adminName")(e.target.value)} className={field("adminName")} placeholder="Anita Sharma" aria-invalid={show("adminName") ? true : undefined} /></FieldShell>
              <FieldShell label="Mobile number" required id="ad-mobile" error={show("adminMobile")} help="Becomes their username.">
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3 text-[15px]" aria-hidden="true">+91</span>
                  <input id="ad-mobile" name="adminMobile" inputMode="numeric" value={f.adminMobile} onChange={(e) => set("adminMobile")(e.target.value.replace(/[^\d ]/g, "").slice(0, 12))} className={cx(field("adminMobile"), "pl-12 tnum")} placeholder="98480 12345" aria-invalid={show("adminMobile") ? true : undefined} />
                </div>
              </FieldShell>
              {warn?.existing && (
                <div className={cx("md:col-span-2 rounded-2xl px-4 py-3 flex items-start gap-3 text-[14px]", sameGroup ? "bg-info/8" : "bg-warn/12")}>
                  {sameGroup ? <I.Info size={19} className="text-info shrink-0 mt-0.5" aria-hidden="true" /> : <I.TriangleAlert size={19} className="text-warn shrink-0 mt-0.5" aria-hidden="true" />}
                  <p className="text-ink2">{sameGroup
                    ? <><b className="font-semibold text-ink">{warn.existing.name} already has a login at {warn.existing.schoolName} ({warn.existing.groupName}).</b> Only a School Access entry for this school is added; they pick the school with the School switcher.</>
                    : <><b className="font-semibold text-ink">This number is already {warn.existing.name}’s login{warn.existing.schoolName ? ` at ${warn.existing.schoolName}` : ""}.</b> Use another number{warn.existing.schoolName ? `, or put this school in the same Group${warn.existing.groupName ? ` (${warn.existing.groupName})` : ""}` : ""}.</>}</p>
                </div>
              )}
              <FieldShell label="Email" id="ad-aemail" error={show("adminEmail")} help="Needed only to also send the invite by email."><input id="ad-aemail" name="adminEmail" type="email" value={f.adminEmail} onChange={(e) => set("adminEmail")(e.target.value)} className={field("adminEmail")} placeholder="name@school.in" /></FieldShell>
              <FieldShell label="Role in the school" required id="ad-arole" help="Both can create the school’s other logins.">
                <Segmented label="Role in the school" value={f.adminRole} onChange={set("adminRole")} className="w-full" options={[{ value: "school-admin", label: "School Admin" }, { value: "principal", label: "Principal / Owner" }]} />
              </FieldShell>
              <FieldShell label="Send the invite by" required id="ad-ch" error={show("channels")} className="md:col-span-2">
                <div className="flex gap-2 flex-wrap" id="ad-ch">
                  {CH.map(([k, l, Ic]) => {
                    const on = ch.has(k);
                    return (
                      <button key={k} type="button" role="checkbox" aria-checked={on} onClick={() => setCh((x) => { const n = new Set(x); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
                        className={cx("h-10 px-3.5 rounded-xl border text-[13.5px] font-semibold inline-flex items-center gap-2 transition", on ? "border-brand bg-brand/10 text-brand" : "border-line text-ink2 hover:border-ink3/50")}>
                        {on ? <I.CircleCheck size={16} aria-hidden="true" /> : <Ic size={16} aria-hidden="true" />}{l}
                      </button>
                    );
                  })}
                </div>
              </FieldShell>
            </div>
          </Card>

          <Card>
            <CardHeader title="Start" description="Trial or paying, and which modules start switched on" icon={NUMS[2]} />
            <div className="flex flex-col gap-4 px-5 pb-5">
              <FieldShell label="Start as" required id="ad-start">
                <div className="grid sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Start as" id="ad-start">
                  {([["TRIAL", "Trial", I.Hourglass, "30 days, everything in Essential, 500 message credits. The school picks its plan when it pays."], ["ACTIVE", "Active", I.CirclePlay, "Starts paying now. The first invoice goes out with a Razorpay link."]] as const).map(([val, l, Ic, sub]) => {
                    const on = f.startAs === val;
                    return (
                      <button key={val} type="button" role="radio" aria-checked={on} onClick={() => set("startAs")(val)}
                        className={cx("rounded-2xl border-2 p-3.5 text-left transition flex gap-3", on ? "border-brand bg-brand/5" : "border-line hover:border-ink3/40")}>
                        <Ic size={19} className={cx("shrink-0 mt-0.5", on ? "text-brand" : "text-ink3")} aria-hidden="true" />
                        <span className="min-w-0"><span className="block font-semibold text-[14.5px]">{l}</span><span className="block text-[12.5px] text-ink3 leading-snug mt-0.5">{sub}</span></span>
                      </button>
                    );
                  })}
                </div>
              </FieldShell>
              {f.startAs === "ACTIVE" && (
                <FieldShell label="Plan" required id="ad-plan">
                  <div className="grid sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Plan" id="ad-plan">
                    {(["essential", "complete"] as const).map((k) => {
                      const on = f.planKey === k;
                      return (
                        <button key={k} type="button" role="radio" aria-checked={on} onClick={() => set("planKey")(k)}
                          className={cx("rounded-2xl border-2 p-3.5 text-left transition", on ? "border-brand bg-brand/5" : "border-line hover:border-ink3/40")}>
                          <span className="flex items-center justify-between"><span className="font-semibold text-[14.5px]">{k === "essential" ? "Essential" : "Complete"}</span>{on && <I.CircleCheck size={17} className="text-brand" aria-hidden="true" />}</span>
                          <span className="block font-display text-[20px] font-semibold tnum mt-0.5">{inr(p.prices[k])}<span className="text-[12px] text-ink3 font-sans font-medium"> per student a year</span></span>
                        </button>
                      );
                    })}
                  </div>
                  <label className="flex items-center gap-3 mt-2 text-[14px] cursor-pointer"><input type="checkbox" checked={hostel} onChange={(e) => setHostel(e.target.checked)} className="size-5 accent-brand" />Hostel add-on, {inr(p.prices.hostel)} a year</label>
                  <p className="text-[12.5px] text-ink3">First invoice for about {Math.max(approx, p.prices.min).toLocaleString("en-IN")} students: {inr(est)} + GST {inr(est * 0.18)}.</p>
                </FieldShell>
              )}
              <div>
                <p className="text-[13px] font-semibold text-ink2 mb-1.5">Modules switched on <span className="text-bad" aria-hidden="true">*</span></p>
                <p className="text-[12.5px] text-ink3 mb-2.5">{p.core.length} core modules are always on. The school can change these later in Settings, Modules On/Off.</p>
                <div className="flex flex-wrap gap-1.5 mb-3">{p.core.map((m) => <Pill key={m} tone="neutral" className="!h-[22px] !text-[11.5px]">{m}</Pill>)}</div>
                <div className="rounded-xl border border-line divide-y divide-line/70">
                  {p.optional.map((m) => {
                    const Ic = MOD_ICON[m.key] ?? I.LayoutGrid;
                    return (
                      <div key={m.key} className="flex items-center gap-3 px-3.5 py-2.5">
                        <span className="w-8 h-8 rounded-lg bg-sunken text-ink2 grid place-items-center shrink-0"><Ic size={16} aria-hidden="true" /></span>
                        <label htmlFor={`ad-mod-${m.key}`} className="flex-1 min-w-0 text-[14px]"><b className="font-semibold block">{m.label}</b><span className="block text-[12px] text-ink3">{m.key === "hostel-management" ? "On for boarding schools" : "Off unless the school needs it"}</span></label>
                        <Switch id={`ad-mod-${m.key}`} on={mods.has(m.key)} label={m.label} onChange={(on) => setMods((x) => { const n = new Set(x); if (on) n.add(m.key); else n.delete(m.key); return n; })} />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>

          <div className="flex flex-col md:flex-row md:items-center gap-3 md:justify-end">
            {tried && bad > 0 && <p className="text-[13.5px] text-bad flex items-center gap-1.5 md:mr-auto" role="alert"><I.CircleAlert size={16} className="shrink-0" aria-hidden="true" />{bad === 1 ? "1 field needs" : `${bad} fields need`} your attention above.</p>}
            <Link href="/console/schools" className={buttonClass("ghost")}>Cancel</Link>
            <Button type="submit" variant="primary" size="lg" icon={I.Send}>Create School and Send Invite</Button>
          </div>
        </Col>

        <Col>
          <Card>
            <CardHeader title="The invite they will get" description="On WhatsApp, and by email when you tick it" icon={I.MessageCircle} />
            <InvitePreview school={f.name.trim() || "your school"} admin={f.adminName.trim() || "Anita Sharma"} role={roleWords} mobile={f.adminMobile} time="Preview" help={p.help} host={p.linkHost} />
          </Card>
          <Card>
            <CardHeader title="What happens by itself" description="When you press Create School and Send Invite" icon={I.Workflow} />
            <ol className="px-5 pb-5 flex flex-col gap-3">
              {steps.map(([Ic, t], i) => (
                <li key={i} className="flex gap-3 text-[13.5px] text-ink2 leading-snug">
                  <span className="w-7 h-7 rounded-lg bg-sunken text-ink2 grid place-items-center shrink-0"><Ic size={15} aria-hidden="true" /></span><span className="pt-1 min-w-0">{t}</span>
                </li>
              ))}
            </ol>
          </Card>
        </Col>
      </Split>

      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Create the school and send the invite?"
        footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>Go back</Button><SubmitButton pendingText="Creating…"><I.Send size={17} aria-hidden="true" />Create School and Send Invite</SubmitButton></>}>
        <p className="text-[15.5px] leading-relaxed">Create <b className="font-semibold">{f.name.trim()}</b> ({f.board}, {f.schoolType}) and {sameGroup ? <>give <b className="font-semibold">{f.adminName.trim()}</b> access with the login they already have</> : <>send a login invite to <b className="font-semibold">{f.adminName.trim()}</b> on {joinAnd(channels)}</>}?</p>
        <div className="mt-3 rounded-xl bg-sunken p-3.5 text-[13.5px] text-ink2 flex flex-col gap-1.5">
          <p>Send to <b className="font-semibold text-ink">{f.adminName.trim()}</b>, +91 {mask(f.adminMobile)}?</p>
          <p>Starts as <b className="font-semibold text-ink">{f.startAs === "TRIAL" ? "Trial" : "Active"}</b>{f.startAs === "TRIAL" ? ": 30 days, everything in Essential, 500 message credits." : ` on ${f.planKey === "complete" ? "Complete" : "Essential"}${hostel ? " with Hostel" : ""}. The first invoice goes out with a Razorpay link.`}</p>
          <p>{code ? <>School code <span className="font-mono text-[12.5px] text-ink">{code}</span> · </> : null}{modCount} modules on{groupName ? ` · ${groupName}` : ""}</p>
        </div>
      </Dialog>
    </form>
  );
}

function Sel({ id, value, onChange, options }: { id: string; value: string; onChange: (v: string) => void; options: Option[] }) {
  return (
    <div className="relative">
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cx(inputCls(), "h-11 appearance-none pr-10 cursor-pointer")}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <I.ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none" aria-hidden="true" />
    </div>
  );
}

export function InvitePreview({ school, admin, role = "School Admin", mobile, time, sent, help, host }: { school: string; admin: string; role?: string; mobile: string; time: string; sent?: boolean; help: string | null; host: string }) {
  return (
    <div className="mx-5 mb-5 rounded-2xl bg-sunken p-3">
      <div className="flex items-center gap-2.5 pb-2.5 mb-3 border-b border-line/70">
        <Logo size={30} />
        <div className="min-w-0"><p className="text-[13.5px] font-semibold leading-tight">School OS · DREAM TEAM</p><p className="text-[11.5px] text-ink3">WhatsApp business message</p></div>
      </div>
      <div className="max-w-[320px] rounded-2xl rounded-tl-md bg-surface shadow-card px-3.5 py-2.5 text-[13.5px] leading-relaxed flex flex-col gap-1.5">
        <p>Welcome to School OS, <b className="font-semibold">{school}</b>.</p>
        <p>{admin}, your {role} login is ready.</p>
        <p>Tap to set your password: <span className="text-brand font-semibold underline underline-offset-2 break-all">{host}/i/••••</span></p>
        <p>Your username is your mobile number: <span className="tnum">{mask(mobile)}</span>.</p>
        <p>The link works for 3 days. {help ? <>Need help? Call DREAM TEAM on <span className="tnum">{help}</span>.</> : "Need help? Call DREAM TEAM support."}</p>
        <p className="text-[11px] text-ink3 self-end flex items-center gap-1">{time}{sent && <I.CheckCheck size={14} className="text-info" aria-hidden="true" />}</p>
      </div>
    </div>
  );
}
