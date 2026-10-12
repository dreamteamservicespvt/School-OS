import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { plural } from "@/lib/academic/common";
import { examDetail } from "@/lib/exams/datesheet";
import { seatingPlan, sittings } from "@/lib/exams/seating";
import { EmptyState } from "@/components/empty-state";
import { Card, CardHeader } from "@/components/ui/card";
import { examPage, one, withYear, type SearchParams } from "../../../_lib/page";
import { PageTop } from "../../../_components/page-top";
import { SeatingButton } from "../../datesheet-ui";

export const metadata: Metadata = { title: "Seating" };

export default async function SeatingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const raw = await searchParams;
  const page = await examPage(raw);
  if (!page.current.features.has("exam-seating") || !(page.scope.datesheets || page.scope.manage)) redirect(`/examination-results/datesheet/${id}`);
  const data = await withSchool(page.current.ctx, async (tx) => {
    const d = await examDetail(tx, id);
    if (!d) return null;
    const list = await sittings(tx, id);
    const chosen = list.find((s) => s.key === one(raw.sitting)) ?? list[0];
    const plan = chosen ? await seatingPlan(tx, id, chosen.key) : [];
    const rooms = [...new Set(d.entries.map((e) => e.room).filter((r): r is string => Boolean(r)))];
    return { d, list, chosen, plan, rooms };
  });
  if (!data) notFound();
  const { d, list, chosen, plan } = data;
  const can = page.scope.datesheets && page.writable && d.exam.status !== "DRAFT";
  return (
    <>
      <PageTop page={page} title={`Seating: ${d.exam.title}`} href={`/examination-results/datesheet/${id}/seating`} showYear={false}>
        <Link href={withYear(`/examination-results/datesheet/${id}`, page)} className="inline-flex min-h-11 items-center px-2 font-medium text-brand-text hover:underline">Back to datesheet</Link>
        {can && list.length > 0 && <SeatingButton examId={id} sittings={list.map((s) => ({ key: s.key, label: s.label, classes: s.classes }))} rooms={data.rooms} />}
      </PageTop>
      {d.exam.status === "DRAFT" && <EmptyState title="Publish the datesheet first">Seat plans are made for a published datesheet.</EmptyState>}
      {list.length === 0 ? <EmptyState title="No papers yet">Add papers to the datesheet first.</EmptyState> : (
        <>
          <nav aria-label="Sittings" className="mb-4 flex flex-wrap gap-2">
            {list.map((s) => (
              <Link key={s.key} href={withYear(`/examination-results/datesheet/${id}/seating?sitting=${s.key}`, page)} aria-current={s.key === chosen?.key ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-sm ${s.key === chosen?.key ? "border-brand bg-brand-soft font-medium text-brand-text" : "border-line-strong hover:bg-surface-2"}`}>
                {s.label} · {s.classes.join(", ")}
              </Link>
            ))}
          </nav>
          {plan.length === 0 ? (
            <EmptyState title="No seat plan for this sitting">{can ? "Make a seat plan: give the rooms and their seats, and students are seated by class and roll number." : "Ask the Exam In-charge to make one."}</EmptyState>
          ) : (
            <>
              <p className="mb-3 flex flex-wrap items-center gap-3">
                <span className="text-ink-2">{plural(plan.reduce((n, r) => n + r.seats.length, 0), "student")} in {plural(plan.length, "room")}</span>
                <a href={`/examination-results/datesheet/${id}/seating/print?sitting=${chosen!.key}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center rounded-lg border border-line-strong bg-surface px-4 font-medium hover:bg-surface-2">Print seating charts</a>
              </p>
              <div className="grid gap-4 lg:grid-cols-2">
                {plan.map((room) => (
                  <Card key={room.name}>
                    <CardHeader title={room.name} description={plural(room.seats.length, "student")} />
                    <ol className="divide-y divide-line border-t border-line">
                      {room.seats.map((s) => (
                        <li key={s.seatNo} className="flex items-center gap-3 px-4 py-2 text-[15px]">
                          <span className="w-10 text-right font-medium tabular-nums">{s.seatNo}</span>
                          <span className="flex-1">{s.name}</span>
                          <span className="text-sm text-ink-2">{s.label}{s.rollNo ? `, roll ${s.rollNo}` : ""}</span>
                        </li>
                      ))}
                    </ol>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
