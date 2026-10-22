"use client";

// The store counter (14 Issue Stock): issue to a staff member, department,
// class or student, with the stock in hand shown on every line; and a book
// set to a student in one step, with any items out of stock listed before
// issuing. After a success the form is ready for the next person; the toast
// says what happened and offers Undo for two minutes.

import { useState } from "react";
import { PackageCheck, TriangleAlert } from "lucide-react";
import { Segmented } from "@/components/ui/controls";
import { SArea, SSelect } from "@/components/ui/sheet-fields";
import { Switch } from "@/components/ui/controls";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import { InlineForm, ItemLines, StudentFinder, type ItemPick, type Student } from "./client";
import { KeepCheck, KeepSelect } from "@/components/ui/keep-select";

type Opt = { value: string; label: string };
type Act = (p: FormState<unknown>, fd: FormData) => Promise<FormState<unknown>>;
export type SetPick = { value: string; label: string; classIds: string[]; pricePaise: number; lines: { itemId: string; qty: number; name: string }[] };

const TO = [
  { value: "STUDENT", label: "Student" },
  { value: "STAFF", label: "Staff" },
  { value: "DEPARTMENT", label: "Department" },
  { value: "CLASS", label: "Class" },
] as const;

function Toggle({ name, title, sub, on, onChange }: { name: string; title: string; sub?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line px-4 py-3">
      <div className="min-w-0 flex-1 text-[14px]">
        <b className="font-semibold block">{title}</b>
        {sub && <span className="block text-[12.5px] text-ink3 mt-0.5">{sub}</span>}
      </div>
      <Switch on={on} onChange={onChange} label={title} name={name} />
    </div>
  );
}

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function IssueForm({ action, find, items, stockBy, staff, departments, sections, stores, mainStore, startTo = "STUDENT" }: {
  action: Act; find: (q: string) => Promise<Student[]>; items: ItemPick[]; stockBy: Record<string, Record<string, number>>; staff: Opt[]; departments: Opt[]; sections: Opt[]; stores: Opt[]; mainStore: string; startTo?: string;
}) {
  const [to, setTo] = useState(startTo);
  const [store, setStore] = useState(mainStore);
  const [charge, setCharge] = useState(true);
  const [returnable, setReturnable] = useState(false);
  const [total, setTotal] = useState(0);
  const [over, setOver] = useState(0);
  const [priced] = useState(() => Object.fromEntries(items.map((i) => [i.value, Math.round((Number(i.price) || 0) * 100)])));
  return (
    <InlineForm action={action} pendingText="Issuing…" blocked={over > 0}
      submit={over > 0 ? (over === 1 ? "A quantity is above the stock" : `${over} quantities are above the stock`) : to === "STUDENT" && charge && total > 0 ? `Issue and add ${rupees(total)} to fees` : "Issue"}>
      {(state) => {
        void state;
        return (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-ink2">Issue to <span className="text-bad" aria-hidden="true">*</span></span>
              <Segmented label="Issue to" value={to} onChange={setTo} options={TO} className="w-full" />
              <input type="hidden" name="toKind" value={to} />
            </div>
            {to === "STUDENT" && <StudentFinder find={find} />}
            {to === "STAFF" && <SSelect name="staffId" label="Staff member" required options={staff} placeholder="Choose the staff member" />}
            {to === "DEPARTMENT" && <SSelect name="departmentId" label="Department" required options={departments} placeholder="Choose the department" />}
            {to === "CLASS" && <SSelect name="sectionId" label="Class" required options={sections} placeholder="Choose the class" />}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="issue-store" className="text-[13px] font-semibold text-ink2">From store <span className="text-bad" aria-hidden="true">*</span></label>
              <KeepSelect id="issue-store" name="locationId" value={store} onChange={(e) => setStore(e.target.value)} className="h-11 rounded-xl border border-line bg-surface px-3 text-[14.5px]">
                {stores.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </KeepSelect>
            </div>
            <ItemLines items={items} limit stockAt={(id) => stockBy[id]?.[store] ?? 0} help="A quantity above the stock in this store cannot be issued."
              unitPaise={priced} onTotal={setTotal} onOver={setOver} />
            {to === "STUDENT" && <Toggle name="chargeToFees" title="Charge to the student's fees" sub={charge ? "At each item's price. Shown in Fee Management." : "A free issue: nothing is charged."} on={charge} onChange={setCharge} />}
            <Toggle name="returnable" title="To be returned" sub={returnable ? "Shown as out until it comes back (and in leaving clearance)." : "Given for use; not expected back."} on={returnable} onChange={setReturnable} />
            <SArea name="note" label="Note" maxLength={300} placeholder="Optional" />
          </>
        );
      }}
    </InlineForm>
  );
}

export function BookSetForm({ action, find, sets, stockBy, stores, mainStore, withMissing, names }: {
  action: Act; find: (q: string) => Promise<Student[]>; sets: SetPick[]; stockBy: Record<string, Record<string, number>>; stores: Opt[]; mainStore: string; withMissing: boolean; names: Record<string, string>;
}) {
  const [student, setStudent] = useState<Student | null>(null);
  const [setId, setSetId] = useState("");
  const [store, setStore] = useState(mainStore);
  const [charge, setCharge] = useState(true);
  const [allow, setAllow] = useState(false);
  const forClass = student?.classId ? sets.filter((s) => s.classIds.includes(student.classId!)) : [];
  const ordered = [...forClass, ...sets.filter((s) => !forClass.includes(s))];
  const set = sets.find((s) => s.value === setId) ?? null;
  const missing = set ? set.lines.filter((l) => (stockBy[l.itemId]?.[store] ?? 0) < l.qty) : [];
  return (
    <InlineForm action={action} pendingText="Issuing…" submit={set ? (missing.length && allow ? `Issue without ${missing.length} item${missing.length === 1 ? "" : "s"}` : charge ? `Issue set and add ${rupees(set.pricePaise)} to fees` : "Issue set") : "Issue set"}>
      {() => (
        <>
          <StudentFinder id="set-student" find={find} onPick={(s) => { setStudent(s); if (s?.classId && !setId) { const first = sets.find((x) => x.classIds.includes(s.classId!)); if (first) setSetId(first.value); } }} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="set-pick" className="text-[13px] font-semibold text-ink2">Book set <span className="text-bad" aria-hidden="true">*</span></label>
            <KeepSelect id="set-pick" name="setId" value={setId} onChange={(e) => setSetId(e.target.value)} className="h-11 rounded-xl border border-line bg-surface px-3 text-[14.5px]">
              <option value="">Choose the set</option>
              {ordered.map((s) => <option key={s.value} value={s.value}>{s.label}{forClass.includes(s) ? " (for this class)" : ""}</option>)}
            </KeepSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="set-store" className="text-[13px] font-semibold text-ink2">From store</label>
            <KeepSelect id="set-store" name="locationId" value={store} onChange={(e) => setStore(e.target.value)} className="h-11 rounded-xl border border-line bg-surface px-3 text-[14.5px]">
              {stores.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </KeepSelect>
          </div>
          {set && (
            <ul className="rounded-xl border border-line divide-y divide-line text-[13.5px]" aria-label="Items in the set">
              {set.lines.map((l) => {
                const have = stockBy[l.itemId]?.[store] ?? 0;
                const short = have < l.qty;
                return (
                  <li key={l.itemId} className={cx("flex items-center gap-2 px-3 py-2", short && "text-bad")}>
                    {short ? <TriangleAlert size={15} aria-hidden="true" /> : <PackageCheck size={15} className="text-ok" aria-hidden="true" />}
                    <span className="flex-1 min-w-0 truncate">{names[l.itemId] ?? l.name}</span>
                    <span className="tnum">{l.qty}</span>
                    <span className="text-[12px] text-ink3 tnum w-20 text-right">{short ? `only ${have}` : `${have} in stock`}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {set && missing.length > 0 && (
            <div className="rounded-xl bg-warn/12 px-3.5 py-2.5 text-[13.5px] flex flex-col gap-2">
              <p><b className="font-semibold">{missing.length} of {set.lines.length} items are out of stock</b> in this store: {missing.map((m) => names[m.itemId] ?? m.name).join(", ")}.</p>
              {withMissing ? (
                <label className="flex items-center gap-2 font-semibold">
                  <KeepCheck type="checkbox" name="allowMissing" checked={allow} onChange={(e) => setAllow(e.target.checked)} className="size-4 accent-[var(--brand)]" />
                  Issue the rest now and the missing items later
                </label>
              ) : <p>Inventory Settings do not allow a set with items missing. Get the stock in first.</p>}
            </div>
          )}
          <Toggle name="chargeToFees" title="Charge the set price to the student's fees" sub={charge ? (set ? `${rupees(set.pricePaise)}, shown in Fee Management.` : "The set price, shown in Fee Management.") : "A free issue: nothing is charged."} on={charge} onChange={setCharge} />
          <SArea name="note" label="Note" maxLength={300} placeholder="Optional" />
        </>
      )}
    </InlineForm>
  );
}
