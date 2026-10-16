"use client";

// Team sheets: invite a DREAM TEAM member, change a member's role.
// Opened by the page's address; the Owner check happens on the server.

import { useState } from "react";
import { SheetForm } from "@/components/ui/url-sheet";
import { SText } from "@/components/ui/sheet-fields";
import { Segmented } from "@/components/ui/controls";
import { FieldShell } from "@/components/ui/field";
import { Banner } from "@/components/ui/banner";
import type { FormState } from "@/lib/forms";
import { MobileField } from "./school-sheets";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;
type Role = "OWNER" | "ONBOARDING" | "SUPPORT";
export type RoleInfo = Record<Role, { label: string; does: string }>;

const ROLE_KEYS: Role[] = ["OWNER", "ONBOARDING", "SUPPORT"];
const mask = (v: string) => {
  const d = v.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(d) ? `${d.slice(0, 2)}••• ••${d.slice(7)}` : "";
};

export function InviteTeamSheet({ closeHref, roles, action }: { closeHref: string; roles: RoleInfo; action: Action }) {
  const [role, setRole] = useState<string>("SUPPORT");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  return (
    <SheetForm title="Invite team member" sub="They get a link on WhatsApp and SMS, confirm a code and set their own password" closeHref={closeHref} action={action} submitLabel="Send invite" pendingText="Sending…" hidden={{ role }}>
      <SText name="name" label="Full name" required placeholder="Pavan Kalyan" autoComplete="off" onChange={(e) => setName(e.target.value)} />
      <MobileField name="mobile" label="Mobile number" help="Becomes their username. One-time codes go here." onValue={setMobile} />
      <SText name="email" label="Email" type="email" placeholder="name@dreamteamservices.in" autoComplete="off" />
      <FieldShell label="Role" id="tm-role" required help={roles[role as Role].does}>
        <Segmented label="Role" value={role} onChange={setRole} className="w-full" options={ROLE_KEYS.map((k) => ({ value: k, label: roles[k].label }))} />
      </FieldShell>
      {name.trim() && mask(mobile) && <p className="rounded-xl bg-sunken p-3 text-[14px]">Send to <b className="font-semibold">{name.trim()}</b>, +91 {mask(mobile)}?</p>}
    </SheetForm>
  );
}

export function RoleSheet({ closeHref, userId, name, current, lastOwner, roles, action }: { closeHref: string; userId: string; name: string; current: Role; lastOwner: boolean; roles: RoleInfo; action: Action }) {
  const [role, setRole] = useState<string>(current);
  return (
    <SheetForm title={`Change ${name}’s role`} sub="Takes effect at their next page load. Recorded in the Activity Log." closeHref={closeHref} action={action} submitLabel="Save role" pendingText="Saving…" hidden={{ userId, role }} submitDisabled={lastOwner && role !== "OWNER"}>
      <FieldShell label="Role" id="cr-role" help={roles[role as Role].does}>
        <Segmented label="Role" value={role} onChange={setRole} className="w-full" options={ROLE_KEYS.map((k) => ({ value: k, label: roles[k].label }))} />
      </FieldShell>
      {lastOwner && role !== "OWNER" && <Banner tone="warn" title="DREAM TEAM needs at least one active Owner.">Make someone else Owner first, then change {name}’s role.</Banner>}
    </SheetForm>
  );
}
