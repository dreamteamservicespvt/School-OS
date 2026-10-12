import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, SearchX, UserRoundSearch } from "lucide-react";
import { withSchool } from "@/lib/db";
import { fileLink } from "@/lib/files";
import { formatRupees } from "@/lib/format";
import { findStudents, mostOverdue, type FoundStudent } from "@/lib/fees/find";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { Empty } from "@/components/ui/kit";
import { UrlSearch } from "@/components/ui/url-filters";
import { cx } from "@/components/ui/cx";
import { FeeHead } from "./_components/fee-head";
import { BASE, feePage, one, type SearchParams } from "./_lib/page";

export const metadata = { title: "Collect Fee" };

/** Collect Fee, step 1: find the student (fees.jsx). Their dues show up ready to collect. */
export default async function CollectFeePage({ searchParams }: { searchParams: SearchParams }) {
  const p = await feePage();
  if (p.viewer.see === "own") redirect(`${BASE}/ledger`);
  if (!p.can.change) redirect(`${BASE}/dashboard`);
  const q = one((await searchParams).q).trim().slice(0, 80);
  const list = await withSchool(p.current.ctx, (tx) => (q ? findStudents(tx, p.viewer, q, p.today, 8) : mostOverdue(tx, p.viewer, p.today, 6)));
  return (
    <div>
      <FeeHead title="Collect fee" pageName="Collect Fee" href={BASE} sub="Find the student. Their dues show up ready to collect." />
      <div className="max-w-3xl">
        <UrlSearch big id="fee-search" placeholder="Student name, admission no. or parent phone" autoFocus label="Find a student" />
        <Card className="mt-4 overflow-hidden">
          {q && list.length === 0 ? (
            <Empty icon={SearchX} title={`No student called “${q}”`} body="Try the admission number or the parent’s mobile number." />
          ) : !q && list.length === 0 ? (
            <Empty icon={UserRoundSearch} title="Nobody is overdue" body="Search above to find any student and collect their fees." />
          ) : (
            <>
              <p className="eyebrow text-ink3 px-5 pt-4 pb-1">{q ? `${list.length} found` : "Overdue, most likely at the counter today"}</p>
              <ul className="p-2">
                {list.map((s) => <StudentRow key={s.id} s={s} schoolId={p.current.ctx.schoolId} />)}
              </ul>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function StudentRow({ s, schoolId }: { s: FoundStudent; schoolId: string }) {
  return (
    <li>
      <Link href={`${BASE}/collect/${s.id}`} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken text-left group">
        <Avatar name={s.name} size={42} src={s.photoFileId ? fileLink(s.photoFileId, schoolId) : null} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[15px] truncate">{s.name}</p>
          <p className="text-[13px] text-ink3 truncate">{s.classSection}{s.rollNo != null ? ` · Roll ${s.rollNo}` : ""}{s.father ? ` · ${s.father}` : ""}</p>
        </div>
        {s.due > BigInt(0)
          ? <span className="text-right"><span className="block font-semibold tnum">{formatRupees(s.due)}</span><span className={cx("text-[12px] font-semibold", s.overdue ? "text-bad" : "text-warn")}>{s.overdue ? "Overdue" : "Due"}</span></span>
          : <Pill tone="ok">No dues</Pill>}
        <ChevronRight size={18} className="text-ink3 group-hover:translate-x-0.5 transition" aria-hidden="true" />
      </Link>
    </li>
  );
}
