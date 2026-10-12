import Link from "next/link";
import { redirect } from "next/navigation";
import { SearchX, UserRoundSearch } from "lucide-react";
import { withSchool } from "@/lib/db";
import { fileLink } from "@/lib/files";
import { formatRupees } from "@/lib/format";
import { findStudents, mostOverdue } from "@/lib/fees/find";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { Empty } from "@/components/money/kit";
import { UrlSearch } from "@/components/money/url-filters";
import { cx } from "@/components/ui/cx";
import { FeeHead } from "../_components/fee-head";
import { BASE, feeDetailsPage, one, type SearchParams } from "../_lib/page";

export const metadata = { title: "Student Fee Ledger" };

/** Student Fee Ledger without a student chosen: find one (mod-fees.jsx StudentPicker). */
export default async function LedgerIndexPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await feeDetailsPage();
  const sp = await searchParams;
  const student = one(sp.student);
  if (/^[0-9a-f-]{36}$/i.test(student)) {
    const rest = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (k !== "student" && typeof v === "string") rest.set(k, v);
    redirect(`${BASE}/ledger/${student}${rest.size ? `?${rest}` : ""}`);
  }
  const q = one(sp.q).trim().slice(0, 80);
  const own = p.viewer.see === "own";
  const list = await withSchool(p.current.ctx, (tx) => (q ? findStudents(tx, p.viewer, q, p.today, 20) : mostOverdue(tx, p.viewer, p.today, own ? 40 : 10)));
  return (
    <div>
      <FeeHead pageName="Student Fee Ledger" href={`${BASE}/ledger`} sub={own ? "Fee status of the students in your classes." : "Each student’s fees, payments, balance and receipts. Nothing here is ever deleted."} />
      <div className="max-w-3xl">
        <UrlSearch big id="ledger-search" placeholder="Name, admission no. or parent phone" autoFocus label="Find a student" />
        <Card className="mt-4 overflow-hidden">
          {list.length === 0 ? (
            q ? <Empty icon={SearchX} title={`No student called “${q}”`} body={own ? "Only students of your classes show here." : "Try the admission number or the parent’s mobile number."} />
              : <Empty icon={UserRoundSearch} title="Nobody is overdue" body="Search above to open any student’s ledger." />
          ) : (
            <>
              <p className="eyebrow text-ink3 px-5 pt-4 pb-1">{q ? `${list.length} found` : "Most overdue"}</p>
              <ul className="p-2">
                {list.map((s) => (
                  <li key={s.id}>
                    <Link href={`${BASE}/ledger/${s.id}`} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken text-left">
                      <Avatar name={s.name} size={42} src={s.photoFileId ? fileLink(s.photoFileId, p.current.ctx.schoolId) : null} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-[15px] truncate">{s.name}</span>
                        <span className="block text-[13px] text-ink3 truncate">{s.classSection} · <span className="font-mono text-[12.5px]">{s.admissionNo}</span></span>
                      </span>
                      {s.due > BigInt(0)
                        ? <span className="text-right"><span className="block font-semibold tnum">{formatRupees(s.due)}</span><span className={cx("text-[12px] font-semibold", s.overdue ? "text-bad" : "text-warn")}>{s.overdue ? "Overdue" : "Due"}</span></span>
                        : <Pill tone="ok">No dues</Pill>}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
