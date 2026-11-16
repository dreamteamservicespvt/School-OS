"use client";

// Message Templates: the steps to get the school's WhatsApp templates approved.
// 1. "Make N templates ready for WhatsApp" (still in School OS's earlier words: they get the new card),
// 2. "Send N templates to WhatsApp for approval", one text at a time, with each answer,
// 3. School OS's own texts WhatsApp rejected, with WhatsApp's reason,
// 4. texts the school changed that WhatsApp would refuse, each with Edit.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Send, Sparkles } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Any, useT, Words } from "@/lib/i18n/client";
import { makeReadyAction, sendForApprovalAction } from "./actions";

type Row = { templateId: string; name: string; languageLabel: string };
type Result = { key: string; name: string; tone: "ok" | "warn" | "bad"; text: string };

const WAIT = "Sent. Waiting for WhatsApp's answer.";
/** A code template WhatsApp rejected as an ordinary message, sent again as a code message (Authentication). */
const AGAIN = "Rejected by WhatsApp: wrong type. Sent again as a code message.";

function answer(status: string): { tone: Result["tone"]; text: string } {
  if (status === "APPROVED") return { tone: "ok", text: "Approved. It can be sent to parents now." };
  if (status === "REJECTED") return { tone: "bad", text: "WhatsApp rejected this text." };
  return { tone: "warn", text: WAIT };
}

const TONE = { ok: "text-ok", warn: "text-warn", bad: "text-bad" } as const;

export function WhatsappReadyPanel({ fixable, toSend, toEdit, rejectedOwn, pending, approved }: {
  fixable: Row[];
  toSend: (Row & { versionId: string; again?: "wrong-type" })[];
  toEdit: (Row & { problems: string[] })[];
  rejectedOwn: (Row & { problems: string[] })[];
  pending: number;
  approved: number;
}) {
  const againNames = toSend.filter((r) => r.again).map((r) => `${r.name} (${r.languageLabel})`);
  const router = useRouter();
  const t = useT();
  const [busy, start] = useTransition();
  const [readyMsg, setReadyMsg] = useState<string | null>(null);
  const [sending, setSending] = useState<{ at: number; of: number } | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const fixNames = [...new Map(fixable.map((r) => [r.templateId, r.name])).values()];
  const sendCount = new Set(toSend.map((r) => r.templateId)).size;
  const label = (r: Row) => `${r.name} (${r.languageLabel})`;

  const makeReady = () => start(async () => {
    setReadyMsg(null);
    const m = await makeReadyAction(null);
    if (m) setReadyMsg(m);
    else router.refresh();
  });

  const sendAll = async () => {
    const list = toSend;
    const out: Result[] = [];
    setResults([]);
    for (let i = 0; i < list.length; i++) {
      setSending({ at: i + 1, of: list.length });
      const r = list[i];
      try {
        const x = await sendForApprovalAction(r.versionId);
        const said = x.ok ? (r.again && x.status === "PENDING" ? { tone: "warn" as const, text: AGAIN } : answer(x.status)) : { tone: "bad" as const, text: x.message };
        out.push({ key: r.versionId, name: label(r), ...said });
      } catch {
        out.push({ key: r.versionId, name: label(r), tone: "bad", text: "Could not be sent. Try again." });
      }
      setResults([...out]);
    }
    setSending(null);
    router.refresh();
  };

  // Kept while texts wait for WhatsApp, so the counts stay in view (live test 16 Nov: it vanished with 5 waiting).
  if (!fixable.length && !toSend.length && !toEdit.length && !rejectedOwn.length && !results.length && !pending) return null;
  return (
    <Card className="min-w-0">
      <CardHeader title="Getting WhatsApp messages approved" icon={Send}
        description={<Words k="WhatsApp checks each message first. This takes minutes to a day." />} />
      <div className="px-5 pb-5 flex flex-col gap-5 text-[14px]">
        <p className="text-[13px] text-ink3"><Words k="Approved: {n}" vars={{ n: approved }} /> · <Words k="Waiting for WhatsApp: {n}" vars={{ n: pending }} /></p>

        {fixable.length > 0 && (
          <section className="flex flex-col gap-2">
            <p className="text-ink2"><Any text="A new WhatsApp card is ready for these: a title, the facts in bold, the school's name and buttons. Making them ready saves a new version; approved words keep going until WhatsApp approves the new one." /></p>
            <p className="text-[13px] text-ink3">{fixNames.join(", ")}</p>
            <div>
              <Button variant="primary" icon={Sparkles} loading={busy} loadingText="Making ready…" onClick={makeReady} disabled={Boolean(sending)}>
                {fixNames.length === 1 ? <Words k="Make 1 template ready for WhatsApp" /> : <Words k="Make {n} templates ready for WhatsApp" vars={{ n: fixNames.length }} />}
              </Button>
              {readyMsg && <p role="alert" className="mt-1 text-[13px] text-bad"><Any text={readyMsg} /></p>}
            </div>
          </section>
        )}

        {toSend.length > 0 && (
          <section className="flex flex-col gap-2">
            <p className="text-ink2"><Words k="These have words WhatsApp accepts and have not been sent yet." /></p>
            {againNames.length > 0 && <p className="text-[13px] text-ink3"><Words k="Rejected by WhatsApp: wrong type. These go again as code messages: {names}" vars={{ names: againNames.join(", ") }} /></p>}
            <div>
              <Button variant={fixable.length ? "secondary" : "primary"} icon={Send} loading={Boolean(sending)}
                loadingText={sending ? t("Sending {i} of {n}…", { i: sending.at, n: sending.of }) : undefined} disabled={busy} onClick={sendAll}>
                {sendCount === 1 ? <Words k="Send 1 template to WhatsApp for approval" /> : <Words k="Send {n} templates to WhatsApp for approval" vars={{ n: sendCount }} />}
              </Button>
            </div>
          </section>
        )}

        {results.length > 0 && (
          <ul aria-live="polite" className="flex flex-col gap-1.5 rounded-xl bg-sunken/70 border border-line p-3.5">
            {results.map((r) => (
              <li key={r.key}><b className="font-semibold">{r.name}:</b> <span className={TONE[r.tone]}><Any text={r.text} /></span></li>
            ))}
          </ul>
        )}

        {rejectedOwn.length > 0 && <EditList rows={rejectedOwn} label={label} intro={<Any text="WhatsApp rejected these School OS texts. Its reason is below. Edit the words and send them again, or ask the School OS support team." />} />}

        {toEdit.length > 0 && <EditList rows={toEdit} label={label} intro={<Any text="Change these before sending. The school wrote or changed them, so School OS does not replace them." />} />}
      </div>
    </Card>
  );
}

/** Texts to change, each with its problems and Edit. */
function EditList({ rows, label, intro }: { rows: (Row & { problems: string[] })[]; label: (r: Row) => string; intro: React.ReactNode }) {
  return (
          <section className="flex flex-col gap-2">
            <p className="text-ink2">{intro}</p>
            <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
              {rows.map((r) => (
                <li key={`${r.templateId}:${r.languageLabel}`} className="flex flex-wrap items-start justify-between gap-3 px-3.5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{label(r)}</p>
                    <ul className="list-disc pl-5 text-[13px] text-ink2">{r.problems.map((m) => <li key={m}><Any text={m} /></li>)}</ul>
                  </div>
                  <ButtonLink href={`/communication/templates/${r.templateId}/edit`} size="sm" variant="secondary" icon={Pencil}><Words k="Edit" /></ButtonLink>
                </li>
              ))}
            </ul>
          </section>
  );
}

/** On one template still in School OS's first words: make it ready. */
export function MakeReadyButton({ id }: { id: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <Button variant="primary" icon={Sparkles} loading={pending} loadingText="Making ready…"
        onClick={() => start(async () => { setMsg(null); const m = await makeReadyAction(id); if (m) setMsg(m); else router.refresh(); })}>
        <Words k="Make ready for WhatsApp" />
      </Button>
      {msg && <p role="alert" className="mt-1 text-[13px] text-bad"><Any text={msg} /></p>}
    </div>
  );
}
