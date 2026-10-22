"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { cx } from "@/components/ui/cx";
import { markStepAction } from "../actions";
import { Words } from "@/lib/i18n/client";

type Step = { key: string; label: string; href: string; sub: string; time: string; button: string; optional: boolean; done: boolean; doneNote: string | null; skipped: boolean };

export function StepList({ steps, nextKey }: { steps: Step[]; nextKey: string | null }) {
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const mark = (key: string, status: "DONE" | "SKIPPED") => start(async () => { const p = await markStepAction(key, status); setProblem(p ?? null); });
  return (
    <>
      {problem && <div className="px-5 pb-3"><Alert tone="danger">{problem}</Alert></div>}
      <ol className="border-t border-line/70">
        {steps.map((s, i) => {
          const isNext = nextKey === s.key;
          return (
            <li key={s.key} className={cx("flex items-start gap-3 px-5 py-3.5 border-b border-line/70 last:border-0", isNext && "bg-brand/[.04]")}>
              <span className={cx("w-8 h-8 rounded-full grid place-items-center shrink-0 text-[12.5px] font-bold tnum mt-0.5", s.done ? "bg-ok/15 text-ok" : isNext ? "bg-brand text-brandink" : "bg-sunken text-ink3")}>
                {s.done ? <Check size={16} strokeWidth={3} aria-label="Done" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cx("text-[14.5px] font-semibold", s.done && "text-ink2")}>
                  {s.label}{s.optional && <span className="text-ink3 font-normal"> <Words k="· optional" /></span>}
                  {s.skipped && <Pill tone="neutral" className="!h-5 !text-[11px] ml-2 align-middle"><Words k="Skipped for now" /></Pill>}
                </p>
                <p className="text-[12.5px] text-ink3">{s.done ? `Done · ${s.doneNote}` : `${s.sub} About ${s.time}.`}</p>
                {!s.done && (
                  <div className="flex gap-2 mt-2.5 flex-wrap">
                    <ButtonLink href={s.href} size="sm" variant={isNext ? "primary" : "secondary"} iconRight={ArrowRight}>{s.button}</ButtonLink>
                    <Button size="sm" variant="ghost" icon={Check} disabled={pending} onClick={() => mark(s.key, "DONE")}><Words k="Mark done" /></Button>
                    {s.optional && !s.skipped && <Button size="sm" variant="ghost" disabled={pending} onClick={() => mark(s.key, "SKIPPED")}><Words k="Skip for now" /></Button>}
                  </div>
                )}
              </div>
              {s.done && <ButtonLink href={s.href} size="sm" variant="ghost" className="shrink-0"><Words k="Review" /></ButtonLink>}
            </li>
          );
        })}
      </ol>
    </>
  );
}
