"use client";

// Log a query or complaint (11-communication.md, Form fields: Log query).
import { startTransition, useActionState, useRef, useState } from "react";
import { logQueryAction, childrenOfGuardian, type QueryState } from "../actions";
import { findPeople } from "../../actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

type Person = { type: "guardian" | "student" | "staff"; id: string; name: string; detail: string };
export type QueryFormData = {
  topics: { id: string; name: string; owner: string | null }[];
  owners: { value: string; label: string }[];
  types: { value: string; label: string }[];
  priorities: { value: string; label: string }[];
  cameBy: { value: string; label: string }[];
};

const input = (bad?: string) => `h-11 w-full rounded-xl border bg-surface px-3.5 text-[15px] ${bad ? "border-bad ring-4 ring-bad/10" : "border-line hover:border-ink3/50 focus:border-brand focus:ring-4 focus:ring-brand/15 outline-none"}`;

export function QueryForm({ data }: { data: QueryFormData }) {
  const [state, dispatch, pending] = useActionState<QueryState, FormData>(logQueryAction, null);
  const [from, setFrom] = useState<Person | null>(null);
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<Person[]>([]);
  const [typed, setTyped] = useState(false);
  const [kids, setKids] = useState<{ id: string; name: string }[]>([]);
  const [topic, setTopic] = useState("");
  const [owner, setOwner] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const err = (k: string) => errors[k] ?? state?.errors?.[k];

  function look(q: string) {
    setSearch(q);
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setFound([]); return; }
    timer.current = setTimeout(async () => { try { setFound(await findPeople(q)); } catch { setFound([]); } }, 300);
  }
  async function choose(p: Person) {
    setFrom(p); setSearch(""); setFound([]); setTyped(false);
    setKids(p.type === "guardian" ? await childrenOfGuardian(p.id) : []);
  }
  function chooseTopic(id: string) {
    setTopic(id);
    const t = data.topics.find((x) => x.id === id);
    if (t?.owner && !owner) setOwner(t.owner);
  }
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const out: Record<string, string> = {};
    if (!from && String(f.get("fromName") ?? "").trim().length < 2) out.from = "Search for the parent, student or staff member, or type a name.";
    if (String(f.get("details") ?? "").trim().length < 5) out.details = "Write the details (at least 5 characters).";
    if (!owner) out.owner = "Choose who owns this query: a staff member or a department.";
    setErrors(out);
    if (Object.keys(out).length) { document.getElementById(`q-${Object.keys(out)[0]}`)?.focus(); return; }
    startTransition(() => dispatch(f));
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl border border-line/70 bg-surface p-5 shadow-card" noValidate>
      {state && !state.ok && state.message && <Alert tone="danger">{state.message}</Alert>}
      <div>
        <label htmlFor="q-from" className="mb-1.5 block text-[13px] font-semibold text-ink2">From <span className="text-bad" aria-hidden>*</span></label>
        {from ? (
          <div className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="from" value={`${from.type}:${from.id}`} />
            <span className="rounded-full bg-brand/10 px-3 py-2 text-brand">{from.name} · {from.detail}</span>
            <Button variant="ghost" size="sm" onClick={() => { setFrom(null); setKids([]); }}>Change</Button>
          </div>
        ) : typed ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <input id="q-from" name="fromName" placeholder="Name" maxLength={100} className={input(err("from"))} aria-label="Name" />
            <input name="fromPhone" placeholder="Mobile number (optional)" inputMode="tel" maxLength={14} className={input(err("fromPhone"))} aria-label="Mobile number" />
            <button type="button" className="text-left text-sm text-brand underline sm:col-span-2" onClick={() => setTyped(false)}>Search instead</button>
          </div>
        ) : (
          <div className="relative">
            <input id="q-from" type="search" value={search} onChange={(e) => look(e.target.value)} placeholder="Search parent, student or staff by name or phone" autoComplete="off" className={input(err("from"))} />
            {found.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-line bg-surface shadow-pop">
                {found.map((p) => (
                  <li key={`${p.type}:${p.id}`}><button type="button" onClick={() => choose(p)} className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left hover:bg-sunken/70"><span className="font-medium">{p.name}</span><span className="text-sm text-ink3">{p.detail}</span></button></li>
                ))}
              </ul>
            )}
            <button type="button" className="mt-1 text-sm text-brand underline" onClick={() => setTyped(true)}>Not in the school? Type a name and phone</button>
          </div>
        )}
        {err("from") && <p className="mt-1.5 text-[12.5px] text-bad">{err("from")}</p>}
        {err("fromPhone") && <p className="mt-1.5 text-[12.5px] text-bad">{err("fromPhone")}</p>}
      </div>

      {kids.length > 0 && (
        <div>
          <label htmlFor="q-about" className="mb-1.5 block text-[13px] font-semibold text-ink2">About (student)</label>
          <select id="q-about" name="aboutStudentId" defaultValue={kids[0].id} className={input()}>
            {kids.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            <option value="">Not about one child</option>
          </select>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="q-type" className="mb-1.5 block text-[13px] font-semibold text-ink2">Type <span className="text-bad" aria-hidden>*</span></label>
          <select id="q-type" name="type" defaultValue="query" className={input()}>{data.types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
        </div>
        <div>
          <label htmlFor="q-topic" className="mb-1.5 block text-[13px] font-semibold text-ink2">Topic</label>
          <select id="q-topic" name="topicId" value={topic} onChange={(e) => chooseTopic(e.target.value)} className={input()}>
            <option value="">No topic</option>
            {data.topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="q-details" className="mb-1.5 block text-[13px] font-semibold text-ink2">Details <span className="text-bad" aria-hidden>*</span></label>
        <textarea id="q-details" name="details" rows={5} maxLength={3000} className={`w-full rounded-xl border bg-surface px-3.5 text-[15px] py-2 ${err("details") ? "border-bad ring-4 ring-bad/10" : "border-line hover:border-ink3/50 focus:border-brand focus:ring-4 focus:ring-brand/15 outline-none"}`} />
        {err("details") && <p className="mt-1.5 text-[12.5px] text-bad">{err("details")}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="q-priority" className="mb-1.5 block text-[13px] font-semibold text-ink2">Priority <span className="text-bad" aria-hidden>*</span></label>
          <select id="q-priority" name="priority" defaultValue="normal" className={input()}>{data.priorities.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
        </div>
        <div>
          <label htmlFor="q-owner" className="mb-1.5 block text-[13px] font-semibold text-ink2">Owner <span className="text-bad" aria-hidden>*</span></label>
          <select id="q-owner" name="owner" value={owner} onChange={(e) => setOwner(e.target.value)} className={input(err("owner"))}>
            <option value="">Choose a person or department</option>
            {data.owners.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {err("owner") ? <p className="mt-1.5 text-[12.5px] text-bad">{err("owner")}</p> : <p className="mt-1.5 text-[12.5px] text-ink3">A department: anyone in it can pick it up.</p>}
        </div>
        <div>
          <label htmlFor="q-cameBy" className="mb-1.5 block text-[13px] font-semibold text-ink2">Came by</label>
          <select id="q-cameBy" name="cameBy" defaultValue="phone" className={input()}>{data.cameBy.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
        </div>
      </div>
      <Button type="submit" loading={pending} loadingText="Logging">Log query</Button>
    </form>
  );
}
