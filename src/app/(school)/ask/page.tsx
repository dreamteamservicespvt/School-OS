import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleHelp, MessageCircleQuestion, ShieldAlert } from "lucide-react";
import { requireCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { periodSetup } from "@/lib/period-setup";
import { aiAllowed } from "@/lib/settings/switch-rules";
import { answerQuestion, logAsk, offeredQuestions, readyMadeFor, SHOW_ROWS, type AskAnswer } from "@/lib/ask/answer";
import { isQuestionKey, isWhen, questionTitle, type AskParams, type AskVia } from "@/lib/ask/questions";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { cx } from "@/components/ui/cx";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = one((await searchParams).q);
  return { title: isQuestionKey(q) ? questionTitle(q) : "Questions" };
}

/** The question's page address, read safely. */
function readAsk(sp: Record<string, string | string[] | undefined>): AskParams {
  const amount = one(sp.amount);
  return {
    cls: one(sp.cls).slice(0, 20) || null,
    when: isWhen(one(sp.when)) ? (one(sp.when) as AskParams["when"]) : null,
    amount: /^[1-9]\d{0,8}$/.test(amount) ? Number(amount) : null,
  };
}

/**
 * A ready-made question and its answer (00-global.md §2 Ask, gap list G27):
 * the number, one plain sentence, the list behind it and a link to the full
 * page. Every answer comes from the module's own list, run with this
 * person's reach. When the AI assistant picked the question from the
 * person's own words, that choice is shown as a Suggestion; the answer is
 * still the school's own records.
 */
export default async function AskPage({ searchParams }: Props) {
  const current = await requireCurrent();
  const sp = await searchParams;
  const key = one(sp.q);
  const offered = offeredQuestions(current);
  const ready = readyMadeFor(current, offered);
  const ai = aiAllowed(current, "ai-ask-do");
  const via: AskVia = one(sp.via) === "ai" && ai ? "ai" : one(sp.via) === "words" || one(sp.via) === "ai" ? "words" : "ready-made";
  const href = "/ask";

  if (!isQuestionKey(key)) {
    return (
      <>
        <PageHeader title="Questions" href={href} userId={current.user.id} sub="Ready-made questions about the lists your role opens. Each answer comes from the list itself." />
        <OtherQuestions ready={ready} current={null} />
      </>
    );
  }

  const params = readAsk(sp);
  const setup = await periodSetup(current);
  const answer = await withSchool(current.ctx, async (tx) => {
    const a = await answerQuestion(tx, current, key, params, { now: new Date(), setup });
    // Who asked what, never the rows (00-global.md §2.1 rule 6), with the answer it was given.
    await logAsk(tx, current.ctx, { key, params, via, outcome: a.ok ? "answered" : "refused", rows: a.ok ? a.total : null });
    return a;
  });

  return (
    <>
      <PageHeader title={answer.title} href={`${href}?q=${key}`} userId={current.user.id} pinLabel={questionTitle(key)} sub={answer.ok ? answer.scope : undefined} />
      <div className="flex flex-col gap-4">
        {via === "ai" && (
          <p className="rounded-2xl border border-info/30 bg-info/10 px-4 py-3 text-[13.5px]">
            <span className="mr-2 inline-flex h-[22px] items-center rounded-full bg-info/15 px-2 text-[11.5px] font-semibold text-info">Suggestion</span>
            The AI assistant read your words as this question. Check it is what you meant; the answer below is from the school&apos;s own records.
          </p>
        )}
        {answer.ok ? <Answer a={answer} /> : (
          <EmptyState title="This question cannot be answered here" Icon={ShieldAlert}
            action={answer.link ? <Link href={answer.link.href} className={buttonClass("secondary", "md")}>{answer.link.label}</Link> : undefined}>
            {answer.problem}
          </EmptyState>
        )}
        <OtherQuestions ready={ready} current={key} />
      </div>
    </>
  );
}

function Answer({ a }: { a: Extract<AskAnswer, { ok: true }> }) {
  const { columns, rows } = a.table;
  const [first, ...rest] = columns;
  return (
    <Card>
      <div className="px-5 pt-5 pb-4 flex flex-col gap-2 border-b border-line">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-display text-[34px] font-semibold leading-none tracking-tight">{a.big}</span>
          <span className="text-[15px] text-ink2">{a.bigLabel}</span>
        </p>
        <p className="text-[15px] max-w-3xl" role="status">{a.sentence}</p>
        {a.note && <p className="text-[13px] text-ink3">{a.note}</p>}
      </div>
      {rows.length > 0 && first && (
        <>
          {/* Phones: one card per row (P1 rule 2). */}
          <ul className="md:hidden divide-y divide-line">
            {rows.map((r, i) => (
              <li key={i} className="px-5 py-3">
                <p className="font-semibold text-[14.5px]">{r[first.key]}</p>
                <p className="text-[13px] text-ink3">{rest.map((c) => r[c.key] && `${c.label}: ${r[c.key]}`).filter(Boolean).join(" · ")}</p>
              </li>
            ))}
          </ul>
          <div className="hidden md:block overflow-x-auto scroll-thin">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="text-left text-[12.5px] text-ink3">
                  {columns.map((c) => <th key={c.key} scope="col" className={cx("px-5 py-2.5 font-medium", c.right && "text-right")}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r, i) => (
                  <tr key={i}>
                    {columns.map((c, j) => j === 0
                      ? <th key={c.key} scope="row" className="px-5 py-2.5 text-left font-medium">{r[c.key]}</th>
                      : <td key={c.key} className={cx("px-5 py-2.5", c.right && "text-right tabular-nums")}>{r[c.key]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="px-5 py-4 flex flex-wrap items-center gap-3 border-t border-line">
        {a.total > SHOW_ROWS && <p className="text-[13px] text-ink3">Showing the first {SHOW_ROWS} of {a.total.toLocaleString("en-IN")}.</p>}
        <Link href={a.link.href} prefetch={false} className={cx(buttonClass("secondary", "md"), "ml-auto")}>
          {a.link.label}<ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}

function OtherQuestions({ ready, current }: { ready: { key: string; title: string; href: string }[]; current: string | null }) {
  const list = ready.filter((r) => r.key !== current);
  if (!list.length) {
    return current ? null : (
      <EmptyState title="No ready-made questions for your role yet" Icon={CircleHelp}>
        Questions are about lists your role already opens, such as today&apos;s absent list or fees overdue. Use Search to find a student, staff member or page.
      </EmptyState>
    );
  }
  return (
    <Card>
      <CardHeader title={current ? "Other questions" : "Questions you can ask"} description="Or type your own words in Search, such as “absent today” or “fees due class 5”." icon={MessageCircleQuestion} />
      <ul className="px-3 pb-3 flex flex-col">
        {list.map((r) => (
          <li key={r.href}>
            <Link href={r.href} prefetch={false} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] hover:bg-sunken">
              <CircleHelp size={17} className="text-ink3 shrink-0" aria-hidden="true" />
              <span className="flex-1">{r.title}</span>
              <ArrowRight size={15} className="text-ink3" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
