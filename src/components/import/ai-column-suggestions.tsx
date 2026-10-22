"use client";

// Smart Import's AI suggestions for the columns the rules left (00-global.md
// §2.1 rules 3 and 4): shown only when the person asks, labelled
// "Suggestion", each one unticked until the person ticks it, and used only
// when they press the button.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Suggestion } from "@/components/ui/blocks";
import { Button } from "@/components/ui/button";

export type AiColumnPick = { key: string; index: number };
type Result = { ok: boolean; suggestions: { key: string; label: string; index: number; header: string; why: string }[]; message: string };

export function AiColumnSuggestions({ ask, accept, baseHref }: {
  /** Asks the AI service (a server action). */
  ask: () => Promise<Result>;
  /** Saves the ticked matches (a server action that writes "prepared by AI, confirmed by <person>"); returns a problem in plain words. */
  accept?: (picks: AiColumnPick[]) => Promise<string | void>;
  /** Or: this page's address; the ticked matches are added to it (m_<field>=<column>, ai=<field>:<column>,…). */
  baseHref?: string;
}) {
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);
  const [asking, startAsk] = useTransition();
  const [using, startUse] = useTransition();

  const askNow = () => startAsk(async () => {
    setProblem(null);
    try {
      const r = await ask();
      setResult(r);
      setTicked(new Set());
    } catch {
      setProblem("The AI assistant could not be reached. Match the columns by hand; nothing was changed.");
    }
  });

  const use = () => startUse(async () => {
    const picks = (result?.suggestions ?? []).filter((s) => ticked.has(s.key)).map((s) => ({ key: s.key, index: s.index }));
    if (!picks.length) return;
    if (accept) {
      const m = await accept(picks);
      if (m) { setProblem(m); return; }
      setResult(null);
      router.refresh();
    } else if (baseHref) {
      const u = new URL(baseHref, window.location.origin);
      for (const p of picks) u.searchParams.set(`m_${p.key}`, String(p.index));
      // Which fields came from the suggestion, with their column, for the Audit Log at import.
      const before = (u.searchParams.get("ai") ?? "").split(",").filter((x) => x && !picks.some((p) => x.startsWith(`${p.key}:`)));
      u.searchParams.set("ai", [...before, ...picks.map((p) => `${p.key}:${p.index}`)].join(","));
      router.push(`${u.pathname}?${u.searchParams}`);
    }
  });

  if (!result?.suggestions.length) {
    return (
      <div className="rounded-2xl border border-line bg-surface px-4 py-3 text-[13.5px]">
        <Button variant="soft" size="sm" icon={Sparkles} loading={asking} loadingText="Asking…" onClick={askNow}>Suggest the columns left</Button>
        <p className="mt-2 text-ink3">The AI assistant sees only each heading and what kind of values the column holds, never the values themselves.</p>
        {(problem || (result && result.message)) && <p className="mt-1.5 text-ink2" role="status">{problem ?? result?.message}</p>}
      </div>
    );
  }
  return (
    <AiColumnSuggestionCard suggestions={result.suggestions} ticked={ticked} using={using} problem={problem} onUse={use}
      onTick={(key, on) => setTicked((t) => { const n = new Set(t); if (on) n.add(key); else n.delete(key); return n; })} />
  );
}

/** The AI's suggestions as the person sees them: labelled "Suggestion", each unticked until they tick it. */
export function AiColumnSuggestionCard({ suggestions, ticked, using = false, problem = null, onTick, onUse }: {
  suggestions: Result["suggestions"]; ticked: ReadonlySet<string>; using?: boolean; problem?: string | null;
  onTick?: (key: string, on: boolean) => void; onUse?: () => void;
}) {
  return (
    <Suggestion ai title="Columns the AI assistant suggests" source="the headings and the kind of values in each column; no value from your file was sent"
      actions={<Button variant="soft" size="sm" loading={using} disabled={ticked.size === 0} onClick={onUse}>Use the ticked matches</Button>}>
      <ul className="flex flex-col gap-2">
        {suggestions.map((s) => (
          <li key={s.key}>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" checked={ticked.has(s.key)} onChange={(e) => onTick?.(s.key, e.target.checked)}
                className="mt-1 size-[18px] accent-[rgb(var(--brand))]" />
              <span><b className="font-semibold text-ink">{s.label}</b> ← “{s.header}” <span className="block text-[12.5px] text-ink3">{s.why}</span></span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12.5px] text-ink3">Tick each one you agree with. Nothing changes until you press “Use the ticked matches”, and you can still change any column.</p>
      {problem && <p className="mt-1.5 text-[13px] text-bad" role="alert">{problem}</p>}
    </Suggestion>
  );
}
