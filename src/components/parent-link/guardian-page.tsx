// The guardian's Parent Link page (parent.jsx): the school's header with "Namaste" and the
// guardian's name, a card per child (tapping one switches the page to that child), then a card for
// each section that has something to show. Used on the public page and in the staff preview.
import Link from "next/link";
import type { GuardianView } from "@/lib/parent-link/sections";
import type { LoadedSection } from "@/lib/parent-link/render";
import { Avatar } from "@/components/ui/avatar";
import { cx } from "@/components/ui/cx";
import { PhoneCard, PhoneShell } from "./phone-shell";

export function GuardianPage({ view, sections, schoolPhone, basePath, right, framed }: { view: GuardianView; sections: LoadedSection[]; schoolPhone: string | null; basePath: string; right?: React.ReactNode; framed?: boolean }) {
  const many = view.children.length > 1;
  return (
    <PhoneShell schoolName={view.schoolName} hello="Namaste," name={view.guardianName} schoolPhone={schoolPhone} right={right} framed={framed}>
      <nav aria-label="Your children" className={cx("grid gap-2.5", many ? "grid-cols-2" : "grid-cols-1")}>
        {view.children.map((c) => {
          const on = c.id === view.child.id;
          return (
            <Link key={c.id} href={`${basePath}${many ? `?child=${c.id}` : ""}`} aria-current={on ? "page" : undefined} scroll={false}
              className={cx("rounded-2xl p-3 text-left bg-surface border-2 shadow-card transition flex", many ? "flex-col" : "items-center gap-3", on && many ? "border-brand" : "border-transparent")}>
              <Avatar name={c.name} size={38} />
              <span className={cx("min-w-0", many && "mt-2")}>
                <span className="block font-semibold text-[14.5px] leading-tight truncate">{many ? c.firstName : c.name}</span>
                <span className="block text-[12px] text-ink3 truncate">{c.classLabel || "Class not set"}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      {sections.map(({ def, data }) => {
        const Render = def.Render;
        if (def.key === "notices-critical") return <Render key={def.key} data={data} view={view} />;
        return (
          <PhoneCard key={def.key} aria-labelledby={`pl-${def.key}`}>
            <h2 id={`pl-${def.key}`} className="font-semibold text-[15px] mb-2">
              {def.label}
              {def.scope !== "family" && many && <span className="font-normal text-ink3"> · {view.child.firstName}</span>}
            </h2>
            <Render data={data} view={view} />
          </PhoneCard>
        );
      })}

      {sections.length === 0 && (
        <PhoneCard><p className="text-[14px] text-ink2">Nothing new from the school right now. Notices and forms will appear here.</p></PhoneCard>
      )}
      <p className="text-center text-[12.5px] text-ink3 px-6">To change details, please contact the school.</p>
    </PhoneShell>
  );
}
