"use client";

// The pipeline board (design: mod-admissions.jsx AdmDashboard). Drag a card to
// the next column, or press its arrow; the server applies the same checks
// as the buttons and says why when a card cannot move on yet.

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useNotice } from "@/components/ui/notice";
import { cx } from "@/components/ui/cx";
import type { PipeColumn } from "@/lib/admission/dashboard";

type Move = (id: string, from: string, to: string) => Promise<{ ok: boolean; title: string; body?: string }>;

export function Pipeline({ columns, move, filtered }: { columns: PipeColumn[]; move?: Move; filtered?: string }) {
  const [drag, setDrag] = useState<{ id: string; name: string; from: string } | null>(null);
  const [pending, start] = useTransition();
  const { show, view } = useNotice();
  const next = (from: string) => columns[columns.findIndex((c) => c.key === from) + 1];

  const go = (id: string, name: string, from: string) => {
    const to = next(from);
    if (!to || !move) return;
    start(async () => {
      const r = await move(id, from, to.key);
      show(r.ok ? { title: r.title, body: r.body } : { tone: "bad", title: r.title, body: r.body });
    });
  };
  const drop = (to: string) => {
    if (!drag) return;
    const want = next(drag.from);
    setDrag(null);
    if (to === drag.from) return;
    if (want?.key !== to) return show({ tone: "bad", title: "Move one step at a time", body: `${drag.name} can go to ${want?.label ?? "no further step"} next.` });
    go(drag.id, drag.name, drag.from);
  };

  return (
    <div className="overflow-x-auto scroll-thin px-4 pb-4" aria-busy={pending || undefined}>
      <div className="flex gap-3 w-max">
        {columns.map((col, ci) => {
          const last = ci === columns.length - 1;
          const target = drag && next(drag.from)?.key === col.key;
          return (
            <section key={col.key} aria-label={`${col.label}, ${col.count}`} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(col.key)}
              className={cx("w-[228px] shrink-0 rounded-xl bg-sunken/60 p-2 flex flex-col gap-2 transition", target && "ring-2 ring-brand/40 bg-brand/5")}>
              <div className="flex items-center justify-between px-1.5 pt-1">
                <h3 className="text-[13px] font-semibold">{col.label}</h3>
                <span className="text-[12px] font-semibold text-ink3 tnum">{col.count}</span>
              </div>
              {col.cards.map((c) => {
                const canMove = Boolean(move) && !last;
                return (
                  <div key={c.id} draggable={canMove} onDragStart={() => setDrag({ id: c.id, name: c.name, from: col.key })} onDragEnd={() => setDrag(null)}
                    className={cx("rounded-xl bg-surface border border-line/70 p-2.5 flex items-start gap-2", canMove && "cursor-grab active:cursor-grabbing")}>
                    <Avatar name={c.name} size={30} />
                    <Link href={c.href} className="min-w-0 flex-1 rounded-md focus-visible:outline-2 focus-visible:outline-brand">
                      <p className="text-[13.5px] font-semibold leading-tight truncate">{c.name}</p>
                      <p className="text-[12px] text-ink3 truncate">{c.cls} · {c.meta}</p>
                    </Link>
                    {canMove && (
                      <button type="button" disabled={pending} onClick={() => go(c.id, c.name, col.key)} aria-label={`Move ${c.name} to ${columns[ci + 1].label}`} title={`Move to ${columns[ci + 1].label}`}
                        className="w-7 h-7 rounded-lg grid place-items-center text-ink3 hover:bg-sunken hover:text-brand shrink-0 disabled:opacity-50">
                        <ArrowRight size={15} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                );
              })}
              {!col.cards.length && <p className="text-[12.5px] text-ink3 px-1.5 py-3 text-center">Nobody here{filtered ? ` for ${filtered}` : ""}</p>}
              {col.count > col.cards.length && (
                <Link href={col.href} className="text-[12.5px] font-semibold text-brand h-8 rounded-lg hover:bg-brand/8 grid place-items-center">+{col.count - col.cards.length} more</Link>
              )}
            </section>
          );
        })}
      </div>
      {view}
    </div>
  );
}
