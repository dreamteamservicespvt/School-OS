"use client";

// Create or change a notice (11-communication.md, Notice Board form).
import { startTransition, useActionState, useRef, useState } from "react";
import { saveNoticeAction, type NoticeState } from "./actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export type NoticeFormData = {
  id: string | null;
  values: { title: string; body: string; parents: boolean; students: boolean; staff: boolean; roleKeys: string[]; classIds: string[]; sectionIds: string[]; campusIds: string[]; priority: string; channels: string[]; publishAt: string; expiresOn: string; askAck: boolean; files: { id: string; name: string }[] };
  classes: { id: string; name: string; sections: { id: string; name: string }[] }[];
  roles: { key: string; name: string }[];
  campuses: { id: string; name: string }[];
  staffAllowed: boolean;
  wholeSchool: boolean;
  needsApproval: { parents: boolean; all: boolean };
  defaultExpiry: string;
};

const CHANNELS = [
  { key: "board", label: "Notice board", fixed: true },
  { key: "app", label: "App notification" },
  { key: "parent-link", label: "Parent Link" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "sms", label: "SMS" },
  { key: "email", label: "Email" },
];

const box = "size-5 accent-[var(--brand)]";

export function NoticeForm({ data }: { data: NoticeFormData }) {
  const v = data.values;
  const [state, action, pending] = useActionState<NoticeState, FormData>(saveNoticeAction, null);
  const [parents, setParents] = useState(v.parents);
  const [students, setStudents] = useState(v.students);
  const [staff, setStaff] = useState(v.staff);
  const [priority, setPriority] = useState(v.priority);
  const [classes, setClasses] = useState<string[]>(v.classIds);
  const [keep, setKeep] = useState(v.files);
  const [word, setWord] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const intent = useRef<"draft" | "publish">("draft");
  const [pressed, setPressed] = useState<"draft" | "publish">("draft");
  const err = (k: string) => errors[k] ?? state?.errors?.[k];
  const approval = (parents && data.needsApproval.parents) || data.needsApproval.all;

  function check(e: React.FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget);
    const out: Record<string, string> = {};
    if (!String(f.get("title") ?? "").trim()) out.title = "Give the notice a title.";
    if (!String(f.get("body") ?? "").trim()) out.body = "Write the notice.";
    if (!parents && !students && !staff) out.audience = "Choose who the notice is for: parents, students or staff.";
    if (intent.current === "publish" && priority === "CRITICAL" && word.trim().toUpperCase() !== "CRITICAL") out.criticalWord = "Type CRITICAL to pin this on every chosen parent's Parent Link.";
    const files = f.getAll("files").filter((x) => x instanceof File && x.size > 0) as File[];
    if (files.some((x) => x.size > 10 * 1024 * 1024)) out.files = "Each file can be at most 10 MB.";
    if (files.length + keep.length > 5) out.files = "A notice can have at most 5 attachments.";
    setErrors(out);
    e.preventDefault();
    if (Object.keys(out).length) {
      document.getElementById(`n-${Object.keys(out)[0]}`)?.focus();
      return;
    }
    // Sent by hand, so what was typed stays on screen if the server finds a problem (P7).
    f.set("intent", intent.current);
    startTransition(() => action(f));
  }

  return (
    <form onSubmit={check} className="space-y-5" noValidate>
      {data.id && <input type="hidden" name="id" value={data.id} />}
      {keep.map((f) => <input key={f.id} type="hidden" name="keepFiles" value={f.id} />)}
      {state && !state.ok && state.message && <Alert tone="danger">{state.message}</Alert>}

      <section className="space-y-4 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
        <div>
          <label htmlFor="n-title" className="mb-1 block text-sm font-medium">Title <span className="text-danger" aria-hidden>*</span></label>
          <input id="n-title" name="title" defaultValue={v.title} maxLength={150} required aria-invalid={err("title") ? true : undefined} aria-describedby="ne-title"
            className={`h-11 w-full rounded-lg border bg-surface px-3 ${err("title") ? "border-danger" : "border-line-strong"}`} />
          {err("title") && <p id="ne-title" className="mt-1 text-sm text-danger">{err("title")}</p>}
        </div>
        <div>
          <label htmlFor="n-body" className="mb-1 block text-sm font-medium">Notice <span className="text-danger" aria-hidden>*</span></label>
          <textarea id="n-body" name="body" rows={8} defaultValue={v.body} maxLength={5000} required aria-invalid={err("body") ? true : undefined} aria-describedby="ne-body"
            className={`w-full rounded-lg border bg-surface px-3 py-2 ${err("body") ? "border-danger" : "border-line-strong"}`} />
          {err("body") ? <p id="ne-body" className="mt-1 text-sm text-danger">{err("body")}</p> : <p className="mt-1 text-sm text-ink-2">Line breaks are kept. Up to 5000 characters.</p>}
        </div>
        <div>
          <label htmlFor="n-files" className="mb-1 block text-sm font-medium">Attachments</label>
          {keep.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-2">
              {keep.map((f) => (
                <li key={f.id} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-sm">{f.name}
                  <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setKeep(keep.filter((x) => x.id !== f.id))} className="grid size-8 place-items-center rounded-full hover:bg-surface-3">×</button>
                </li>
              ))}
            </ul>
          )}
          <input id="n-files" name="files" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-line-strong file:bg-surface file:px-4" />
          {err("files") ? <p className="mt-1 text-sm text-danger">{err("files")}</p> : <p className="mt-1 text-sm text-ink-2">PDF or photos, up to 5 files of 10 MB each.</p>}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
        <fieldset id="n-audience" tabIndex={-1}>
          <legend className="mb-2 font-semibold">Audience <span className="text-danger" aria-hidden>*</span></legend>
          <div className="flex flex-wrap gap-x-6">
            <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="parents" checked={parents} onChange={(e) => setParents(e.target.checked)} className={box} />Parents</label>
            <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="students" checked={students} onChange={(e) => setStudents(e.target.checked)} className={box} />Students</label>
            {data.staffAllowed && <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="staff" checked={staff} onChange={(e) => setStaff(e.target.checked)} className={box} />Staff</label>}
          </div>
          {err("audience") && <p className="mt-1 text-sm text-danger">{err("audience")}</p>}
          {parents && <p className="text-sm text-ink-2">Parents see it on their Parent Link, and by message on the channels chosen below.</p>}
        </fieldset>
        {(parents || students) && data.classes.length > 0 && (
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Classes and sections</legend>
            <p className="mb-2 text-sm text-ink-2">{data.wholeSchool ? "Nothing ticked: the whole school." : "Choose your own sections."}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.classes.map((c) => (
                <div key={c.id} className="rounded-xl border border-line p-3">
                  {data.wholeSchool ? (
                    <label className="flex min-h-11 items-center gap-2 font-medium"><input type="checkbox" name="classIds" value={c.id} checked={classes.includes(c.id)} onChange={(e) => setClasses(e.target.checked ? [...classes, c.id] : classes.filter((x) => x !== c.id))} className={box} />{c.name} (all)</label>
                  ) : <p className="font-medium">{c.name}</p>}
                  <div className="flex flex-wrap gap-x-4">
                    {c.sections.map((s) => (
                      <label key={s.id} className="flex min-h-11 items-center gap-2"><input type="checkbox" name="sectionIds" value={s.id} defaultChecked={v.sectionIds.includes(s.id)} disabled={classes.includes(c.id)} className={box} />{s.name}</label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
        )}
        {staff && data.roles.length > 0 && (
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Staff roles (nothing ticked: all staff)</legend>
            <div className="flex flex-wrap gap-x-5">
              {data.roles.map((r) => <label key={r.key} className="flex min-h-11 items-center gap-2"><input type="checkbox" name="roleKeys" value={r.key} defaultChecked={v.roleKeys.includes(r.key)} className={box} />{r.name}</label>)}
            </div>
          </fieldset>
        )}
        {data.campuses.length > 1 && (
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Campuses (nothing ticked: all)</legend>
            <div className="flex flex-wrap gap-x-5">
              {data.campuses.map((c) => <label key={c.id} className="flex min-h-11 items-center gap-2"><input type="checkbox" name="campusIds" value={c.id} defaultChecked={v.campusIds.includes(c.id)} className={box} />{c.name}</label>)}
            </div>
          </fieldset>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
        <fieldset>
          <legend className="mb-2 font-semibold">Priority</legend>
          <div className="flex flex-wrap gap-2">
            {[["NORMAL", "Normal"], ["HIGH", "High"], ["CRITICAL", "Critical"]].map(([k, l]) => (
              <label key={k} className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 ${priority === k ? (k === "CRITICAL" ? "border-danger bg-danger-soft font-medium text-danger" : k === "HIGH" ? "border-warn bg-warn-bg font-medium text-warn-text" : "border-brand bg-brand-soft font-medium text-brand-text") : "border-line-strong"}`}>
                <input type="radio" name="priority" value={k} checked={priority === k} onChange={() => setPriority(k)} className="sr-only" />{l}
              </label>
            ))}
          </div>
          {priority === "CRITICAL" && <p className="mt-2 text-sm text-danger">A Critical notice is pinned at the top of every chosen parent&rsquo;s Parent Link until it expires, and goes even to parents who opted out of messages.</p>}
        </fieldset>
        <fieldset>
          <legend className="mb-2 font-semibold">Channels</legend>
          <div className="flex flex-wrap gap-x-5">
            {CHANNELS.map((c) => (
              <label key={c.key} className="flex min-h-11 items-center gap-2">
                <input type="checkbox" name="channels" value={c.key} defaultChecked={c.fixed || v.channels.includes(c.key) || (c.key === "parent-link" && parents)} disabled={c.fixed || (c.key === "parent-link" && parents)} className={box} />
                {c.label}{c.fixed ? " (always)" : c.key === "parent-link" && parents ? " (always for parents)" : ""}
              </label>
            ))}
          </div>
          <p className="text-sm text-ink-2">WhatsApp, SMS and email go to parents, using the notice template and your credits.</p>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="n-publishAt" className="mb-1 block text-sm font-medium">Publish at</label>
            <input id="n-publishAt" type="datetime-local" name="publishAt" defaultValue={v.publishAt} className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3" />
            <p className="mt-1 text-sm text-ink-2">Blank: now.</p>
            {err("publishAt") && <p className="text-sm text-danger">{err("publishAt")}</p>}
          </div>
          <div>
            <label htmlFor="n-expiresOn" className="mb-1 block text-sm font-medium">Expires on</label>
            <input id="n-expiresOn" type="date" name="expiresOn" defaultValue={v.expiresOn} className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3" />
            <p className="mt-1 text-sm text-ink-2">Blank: 30 days after publishing ({data.defaultExpiry} if published today).</p>
            {err("expiresOn") && <p className="text-sm text-danger">{err("expiresOn")}</p>}
          </div>
        </div>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="askAck" defaultChecked={v.askAck} className={box} />Ask staff and students to tap &ldquo;I have read this&rdquo;</label>
        {priority === "CRITICAL" && (
          <div className="max-w-sm">
            <label htmlFor="n-criticalWord" className="mb-1 block text-sm font-medium">Type CRITICAL to pin this on every chosen parent&rsquo;s Parent Link</label>
            <input id="n-criticalWord" name="criticalWord" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" className={`h-11 w-full rounded-lg border bg-surface px-3 ${err("criticalWord") ? "border-danger" : "border-line-strong"}`} />
            {err("criticalWord") && <p className="mt-1 text-sm text-danger">{err("criticalWord")}</p>}
          </div>
        )}
        {approval && <Alert tone="info">This notice goes to the principal for approval first. It is published once approved.</Alert>}
      </section>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending && pressed === "publish"} loadingText="Saving" disabled={pending}
          onClick={() => { intent.current = "publish"; setPressed("publish"); }}>
          {approval ? "Send for approval" : "Publish"}
        </Button>
        <Button type="submit" variant="secondary" loading={pending && pressed === "draft"} loadingText="Saving" disabled={pending}
          onClick={() => { intent.current = "draft"; setPressed("draft"); }}>
          Save draft
        </Button>
      </div>
    </form>
  );
}
