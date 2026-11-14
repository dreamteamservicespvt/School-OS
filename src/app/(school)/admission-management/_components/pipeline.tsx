"use client";

// The admission pipeline, as one list of steps (owner, 15 Nov 2026: the funnel and the column
// board repeated each other, ran off the screen and nobody knew to drag). Each step shows how many
// are at it, the first few people with one useful fact, and a labelled button for their next step.
// "Move to ..." uses the same move and checks as before; where that move is always refused
// (enquiry, interview, decision) the button opens the page where the step is done.

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { useNotice } from "@/components/ui/notice";
import { cx } from "@/components/ui/cx";
import type { ColumnKey, PipeCard } from "@/lib/admission/dashboard";
import type { MessageKey } from "@/lib/i18n/t";
import { useT } from "@/lib/i18n/client";

type Move = (id: string, from: string, to: string) => Promise<{ ok: boolean; title: string; body?: string }>;

export type Step = { key: ColumnKey; label: string; count: number; week: number; oldest: string | null; href: string; cards: PipeCard[] };

/** One plain line under each step's name: what being at this step means. */
const HELP: Record<ColumnKey, MessageKey> = {
  enq: "Families who asked about admission",
  app: "Application form filled in",
  docs: "Checking the child's documents",
  test: "Waiting for the admission test",
  int: "Waiting for the interview",
  appr: "Waiting for a decision",
  done: "Joined the school this year",
};

const TONE = { bad: "text-bad", warn: "text-warn", ok: "text-ok" } as const;

export function Pipeline({ steps, move, filtered }: { steps: Step[]; move?: Move; filtered?: string }) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { show, view } = useNotice();

  const go = (id: string, from: ColumnKey, to: ColumnKey) => {
    if (!move) return;
    setBusy(id);
    start(async () => {
      const r = await move(id, from, to);
      setBusy(null);
      show(r.ok ? { title: r.title, body: r.body } : { tone: "bad", title: r.title, body: r.body });
    });
  };

  return (
    <div aria-busy={pending || undefined}>
      <ol className="pb-2">
        {steps.map((step, i) => {
          const next = steps[i + 1];
          const facts = [t(HELP[step.key]), step.week ? t("+{n} this week", { n: step.week }) : null, step.key !== "done" && step.oldest ? t("Oldest {date}", { date: step.oldest }) : null].filter(Boolean).join(" · ");
          return (
            <li key={step.key} aria-label={`${t.any(step.label)}, ${step.count}`} className="px-4 md:px-5 py-3.5 border-t border-line/70">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className={cx("w-7 h-7 shrink-0 rounded-full grid place-items-center text-[13px] font-semibold tnum mt-0.5", step.count ? "bg-brand/10 text-brand" : "bg-sunken text-ink3")}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-semibold leading-tight">
                    {t.any(step.label)} <span className={cx("ml-1 tnum", step.count ? "text-ink" : "text-ink3 font-normal")}>{step.count}</span>
                  </h3>
                  <p className="text-[12.5px] text-ink3 mt-0.5">
                    {step.count ? facts : filtered ? t("No one at this step for {cls}", { cls: filtered }) : t("No one at this step")}
                  </p>
                </div>
                {step.count > 0 && (
                  <Link href={step.href} className="shrink-0 min-h-11 px-2 -my-2 -mr-2 rounded-lg inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:bg-brand/8 focus-visible:outline-2 focus-visible:outline-brand">
                    {t("See all {n}", { n: step.count })}<ArrowRight size={14} aria-hidden="true" />
                  </Link>
                )}
              </div>

              {step.cards.length > 0 && (
                <ul className="mt-3 md:ml-10 flex flex-col gap-2">
                  {step.cards.map((c) => (
                    <li key={c.id} className="rounded-xl border border-line/70 bg-surface p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                      <Link href={c.href} className="flex items-center gap-3 min-w-0 flex-1 rounded-lg focus-visible:outline-2 focus-visible:outline-brand">
                        <Avatar name={c.name} size={36} />
                        <span className="min-w-0">
                          <span className="block text-[14px] font-semibold leading-tight">{c.name}</span>
                          <span className="block text-[12.5px] text-ink3 mt-0.5">{c.cls ? t("Class wanted: {cls}", { cls: c.cls }) : t("Class not set")}</span>
                          <span className={cx("block text-[12.5px] font-medium mt-0.5", c.fact.tone ? TONE[c.fact.tone] : "text-ink2")}>{t(c.fact.k, c.fact.vars)}</span>
                        </span>
                      </Link>
                      {move && c.act?.kind === "link" && (
                        <ButtonLink href={c.act.href} variant="secondary" size="lg" className="w-full sm:w-auto shrink-0">{t(c.act.k)}</ButtonLink>
                      )}
                      {move && c.act?.kind === "move" && next && (
                        <Button variant="secondary" size="lg" className="w-full sm:w-auto shrink-0" disabled={pending} loading={busy === c.id}
                          aria-label={t("Move {name} to {step}", { name: c.name, step: t.any(next.label) })} onClick={() => go(c.id, step.key, next.key)}>
                          {t("Move to {step}", { step: t.any(next.label) })}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      {view}
    </div>
  );
}
