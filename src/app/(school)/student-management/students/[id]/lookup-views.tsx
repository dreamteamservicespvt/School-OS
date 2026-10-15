// The Student Profile for roles that only look a student up (05-roles.md, the
// approved design's PickupView and LibraryView in students.jsx):
// - Front Office and Gate Security: the photo and the approved pickup list.
//   Gate Security sees no phone numbers.
// - Librarian: name, photo and class, to issue a book.
// Nothing else about the student is read for these pages (loadProfile).

import { BookOpen, DoorOpen, Eye, ShieldCheck, ShieldX } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Banner } from "@/components/ui/blocks";
import { classShort, phoneShow } from "@/lib/students/show";
import type { Profile } from "../../_lib/profile";

function Head({ p, size, extra, action }: { p: Profile; size: number; extra?: React.ReactNode; action?: React.ReactNode }) {
  const s = p.student;
  const cls = p.now?.section ? classShort(p.now.section.schoolClass.name, p.now.section.name) : "No class this year";
  return (
    <Card className="flex flex-col gap-4 p-5 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <Avatar name={s.fullName} src={p.photo} size={size} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-[24px] font-semibold leading-tight tracking-tight md:text-[28px]">{s.fullName}</h1>
            <Pill tone="neutral"><Eye size={13} aria-hidden="true" />View only</Pill>
          </div>
          <p className="mt-0.5 text-[13.5px] text-ink3">{cls}{p.now?.rollNo ? ` · Roll ${p.now.rollNo}` : ""} · <span className="font-mono text-[12.5px]">{s.admissionNo}</span></p>
          {extra}
        </div>
      </div>
      {action}
    </Card>
  );
}

export function PickupView({ p, back, showPhones, pickupHref }: { p: Profile; back: React.ReactNode; showPhones: boolean; pickupHref: string | null }) {
  const first = p.student.firstName || p.student.fullName.split(" ")[0];
  return (
    <>
      {back}
      <div className="flex max-w-3xl flex-col gap-5">
        <Head p={p} size={88} action={pickupHref ? <ButtonLink href={pickupHref} variant="primary" icon={DoorOpen}>Student Pickup</ButtonLink> : undefined} />
        {p.pickups.restricted.length > 0 && (
          <Banner tone="bad" icon={ShieldX} title="Custody restriction.">
            {p.pickups.restricted.map((g) => <span key={g.guardianId} className="block">Do not release to {g.name} ({g.relationship.toLowerCase()}). See the note with the School Admin.</span>)}
          </Banner>
        )}
        <Card>
          <CardHeader title="Approved pickup list" icon={ShieldCheck} description={`Only these people may take ${first} home. For anyone else, call the parent first.`} />
          {p.pickups.allowed.length === 0 ? <p className="px-5 pb-5 text-[14px] text-ink3">No one is on the pickup list yet. Ask the class teacher or the office.</p> : (
            <ul className="px-3 pb-3">
              {p.pickups.allowed.map((g) => (
                <li key={g.guardianId} className="flex items-center gap-3 rounded-xl px-2 py-2.5">
                  <Avatar name={g.name} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold leading-tight">{g.name}</p>
                    <p className="text-[12.5px] text-ink3">{g.relationship}{showPhones && g.phone ? <> · <span className="tnum">+91 {phoneShow(g.phone)}</span></> : null}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

export function LibraryView({ p, back, panel }: { p: Profile; back: React.ReactNode; panel?: React.ReactNode }) {
  return (
    <>
      {back}
      <div className="flex max-w-5xl flex-col gap-5">
        <Head p={p} size={72} />
        {panel ?? (
          <Card>
            <CardHeader title="Library" icon={BookOpen} />
            <p className="px-5 pb-5 text-[14px] text-ink3">Library cards, books out and fines show here once Library Management is in use.</p>
          </Card>
        )}
      </div>
    </>
  );
}
