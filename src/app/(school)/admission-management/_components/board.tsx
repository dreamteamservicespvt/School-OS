"use client";

// A board of cards in columns (the pipeline board and the enquiry kanban).
// Drag a card to another column to move it on, with the same checks as the
// buttons (inferred: drag to move). On a phone or with a keyboard, each card
// has "Move to" instead of dragging.

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";

export type Card = { id: string; title: string; meta: string; href: string; tone?: "danger"; note?: string };
export type Column = { key: string; label: string; count: number; cards: Card[]; href?: string; accepts?: boolean };

export function Board({ columns, move, label, moveLabel = "Move to" }: { columns: Column[]; move?: (cardId: string, from: string, to: string) => Promise<string | null>; label: string; moveLabel?: string }) {
  const [problem, setProblem] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const targets = columns.filter((c) => c.accepts !== false);

  const doMove = (cardId: string, from: string, to: string) => {
    if (!move || from === to) return;
    start(async () => {
      setProblem(null);
      const p = await move(cardId, from, to);
      if (p) setProblem(p);
      router.refresh();
    });
  };

  return (
    <div aria-busy={pending || undefined}>
      {problem && <Alert tone="danger" className="mb-3">{problem}</Alert>}
      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <ul aria-label={label} className="flex min-w-max gap-3">
          {columns.map((col) => (
            <li key={col.key}
              onDragOver={move && col.accepts !== false ? (e) => { e.preventDefault(); setOver(col.key); } : undefined}
              onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
              onDrop={move && col.accepts !== false ? (e) => { e.preventDefault(); setOver(null); const [id, from] = e.dataTransfer.getData("text/plain").split("|"); if (id) doMove(id, from, col.key); } : undefined}
              className={`flex w-64 shrink-0 flex-col rounded-2xl border bg-surface-2 p-2 ${over === col.key ? "border-brand" : "border-line"}`}>
              <h3 className="flex items-center justify-between px-2 py-1 text-sm font-semibold">
                {col.href ? <Link href={col.href} className="hover:underline">{col.label}</Link> : col.label}
                <span className="rounded-full bg-surface-3 px-2 text-xs font-normal">{col.count}</span>
              </h3>
              <ul className="mt-1 flex flex-col gap-2">
                {col.cards.map((card) => (
                  <li key={card.id} draggable={Boolean(move)} onDragStart={(e) => e.dataTransfer.setData("text/plain", `${card.id}|${col.key}`)}
                    className={`rounded-xl border bg-surface p-3 shadow-card ${card.tone === "danger" ? "border-danger/50" : "border-line"} ${move ? "cursor-grab" : ""}`}>
                    <Link href={card.href} className="font-medium text-brand-text hover:underline">{card.title}</Link>
                    <p className="text-sm text-ink-2">{card.meta}</p>
                    {card.note && <p className={`text-xs ${card.tone === "danger" ? "text-danger" : "text-ink-2"}`}>{card.note}</p>}
                    {move && targets.length > 1 && (
                      <label className="mt-2 block text-xs text-ink-2">
                        <span className="sr-only">{moveLabel} for {card.title}</span>
                        <select className="min-h-11 w-full rounded-lg border border-line-strong bg-surface px-2 text-sm text-ink" value="" disabled={pending}
                          onChange={(e) => { if (e.target.value) doMove(card.id, col.key, e.target.value); }}>
                          <option value="">{moveLabel}…</option>
                          {targets.filter((t) => t.key !== col.key).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                        </select>
                      </label>
                    )}
                  </li>
                ))}
                {col.count > col.cards.length && col.href && (
                  <li><Link href={col.href} className="block px-2 py-1 text-sm text-brand-text hover:underline">and {col.count - col.cards.length} more</Link></li>
                )}
                {col.cards.length === 0 && <li className="px-2 py-3 text-sm text-ink-2">Nothing here</li>}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
