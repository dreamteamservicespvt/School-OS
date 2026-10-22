import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { plural } from "@/lib/academic/common";
import { examDetail } from "@/lib/exams/datesheet";
import { seatingPlan, sittings } from "@/lib/exams/seating";
import { EmptyState } from "@/components/empty-state";
import { Printer } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chips, Legend } from "@/components/ui/kit";
import { cx } from "@/components/ui/cx";
import { examPage, one, withYear, type SearchParams } from "../../../_lib/page";
import { BackLink } from "../../../_components/page-top";
import { SeatingButton } from "../../datesheet-ui";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Seating" };

export default async function SeatingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const raw = await searchParams;
  const page = await examPage(raw);
  if (!(page.scope.datesheets || page.scope.manage)) redirect("/no-access");
  if (!page.current.features.has("exam-seating")) redirect(`/examination-results/datesheet/${id}`);
  const data = await withSchool(page.current.ctx, async (tx) => {
    const d = await examDetail(tx, id, { scope: page.scope });
    if (!d) return null;
    const list = await sittings(tx, id);
    const chosen = list.find((s) => s.key === one(raw.sitting)) ?? list[0];
    const plan = chosen ? await seatingPlan(tx, id, chosen.key) : [];
    const rooms = [...new Set(d.entries.map((e) => e.room).filter((r): r is string => Boolean(r)))];
    return { d, list, chosen, plan, rooms };
  });
  if (!data) notFound();
  const { d, list, chosen, plan } = data;
  const short = (cs: string[]) => [...cs].map((c) => c.replace(/^Class /, "")).sort((a, b) => a.localeCompare(b, "en", { numeric: true })).join(", ");
  const can = page.scope.datesheets && page.writable && d.exam.status !== "DRAFT";
  const seated = plan.reduce((n, r) => n + r.seats.length, 0);
  // One colour per class section in each room, in the order they first sit (design SeatingSheet).
  const TONES = ["bg-brand/10 text-brand", "bg-warn/10 text-warn", "bg-ok/10 text-ok", "bg-bad/10 text-bad", "bg-sunken text-ink2"];
  const DOTS = ["bg-brand/30", "bg-warn/30", "bg-ok/30", "bg-bad/30", "bg-ink3/40"];
  return (
    <>
      <BackLink page={page} href={`/examination-results/datesheet/${id}`} label={d.exam.title} sub="Seating arrangement" />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[26px] md:text-[30px] font-semibold tracking-tight leading-tight"><Words k="Seating arrangement" /></h1>
          <p className="text-[14px] text-ink2 mt-1"><Words k="Seat numbers per room by roll number. Optional." /></p>
        </div>
        <div className="flex flex-wrap gap-2">
          {plan.length > 0 && chosen && (
            <a href={`/examination-results/datesheet/${id}/seating/print?sitting=${chosen.key}`} target="_blank" rel="noopener"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-[14px] font-semibold hover:bg-sunken">
              <Printer size={17} aria-hidden="true" /><Words k="Print seating charts" />
            </a>
          )}
          {can && list.length > 0 && <SeatingButton examId={id} sittings={list.map((s) => ({ key: s.key, label: s.label, classes: s.classes }))} rooms={data.rooms} />}
        </div>
      </div>
      {d.exam.status === "DRAFT" && <EmptyState title="Publish the datesheet first"><Words k="Seat plans are made for a published datesheet." /></EmptyState>}
      {list.length === 0 ? <EmptyState title="No papers yet"><Words k="Add papers to the datesheet first." /></EmptyState> : (
        <>
          <Chips label="Sittings" className="mb-4" value={chosen?.key ?? ""}
            options={list.map((s) => ({ value: s.key, label: `${s.label} · ${short(s.classes)}`, href: withYear(`/examination-results/datesheet/${id}/seating?sitting=${s.key}`, page) }))} />
          {plan.length === 0 ? (
            <EmptyState title="No seat plan for this sitting">{can ? "Make a seat plan: give the rooms and their seats, and students are seated by class and roll number." : "Ask the Exam In-charge to make one."}</EmptyState>
          ) : (
            <>
              <p className="mb-3 text-[13.5px] text-ink2">{plural(seated, "student")} <Words k="in" /> {plural(plan.length, "room")}</p>
              <div className="grid gap-4 xl:grid-cols-2">
                {plan.map((room) => {
                  const here = [...new Set(room.seats.map((x) => x.label))];
                  const tone = (label: string) => here.indexOf(label) % TONES.length;
                  return (
                    <Card key={room.name} className="p-3">
                      <p className="eyebrow text-center text-[12px] font-semibold text-ink3 mb-2"><Words k="Board ·" /> {room.name} · {plural(room.seats.length, "seat")}</p>
                      <ol className="grid grid-cols-5 gap-1.5">
                        {room.seats.map((x) => (
                          <li key={x.seatNo} title={`Seat ${x.seatNo}: ${x.name}, ${x.label}${x.rollNo ? `, roll ${x.rollNo}` : ""}`}
                            className={cx("min-h-11 rounded-lg grid place-items-center px-1 py-1 text-[11.5px] font-semibold tnum leading-tight text-center", TONES[tone(x.label)])}>
                            <span className="sr-only"><Words k="Seat" /> {x.seatNo}: {x.name}, </span>
                            <span aria-hidden="true">{x.label.replace(/^Class /, "")}-{String(x.rollNo ?? x.seatNo).padStart(2, "0")}</span>
                          </li>
                        ))}
                      </ol>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <Legend items={here.map((l) => [DOTS[tone(l)], `${l.replace(/^Class /, "")} · ${plural(room.seats.filter((x) => x.label === l).length, "student")}`] as [string, string])} />
                      </div>
                      <details className="mt-3 rounded-xl border border-line">
                        <summary className="flex min-h-10 cursor-pointer items-center px-3 text-[13px] font-semibold text-ink2"><Words k="Names by seat" /></summary>
                        <ol className="divide-y divide-line/70 border-t border-line">
                          {room.seats.map((x) => (
                            <li key={x.seatNo} className="flex items-center gap-3 px-3 py-2 text-[13.5px]">
                              <span className="w-8 text-right font-semibold tnum">{x.seatNo}</span>
                              <span className="flex-1 min-w-0 truncate">{x.name}</span>
                              <span className="text-[12.5px] text-ink3">{x.label}{x.rollNo ? `, roll ${x.rollNo}` : ""}</span>
                            </li>
                          ))}
                        </ol>
                      </details>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
