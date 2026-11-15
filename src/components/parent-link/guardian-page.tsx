// The guardian's Parent Link page (parent.jsx): the school's header with "Namaste" and the
// guardian's name, a card per child (tapping one switches the page to that child), then a card for
// each section that has something to show. Used on the public page and in the staff preview.
import Link from "next/link";
import type { GuardianView } from "@/lib/parent-link/sections";
import type { LoadedSection } from "@/lib/parent-link/render";
import { Avatar } from "@/components/ui/avatar";
import { cx } from "@/components/ui/cx";
import { PhoneCard, PhoneShell } from "./phone-shell";
import { makeT } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n/t";

/** "Class 5 A" with "Class" in the page's language; class and section names stay as they are. */
function classWords(t: T, label: string) {
  const m = /^Class (.+)$/.exec(label);
  return m ? t("Class {n}", { n: m[1] }) : label;
}

export function GuardianPage({ view, sections, schoolPhone, basePath, right, framed }: { view: GuardianView; sections: LoadedSection[]; schoolPhone: string | null; basePath: string; right?: React.ReactNode; framed?: boolean }) {
  const many = view.children.length > 1;
  const t = makeT(view.lang);
  const cards = sections.filter(({ def }) => def.key !== "notices-critical");
  return (
    <PhoneShell schoolName={view.schoolName} hello={t("Namaste,")} name={view.guardianName} schoolPhone={schoolPhone} right={right} framed={framed} t={t}>
      <nav aria-label={t("Your children")} className={cx("grid gap-2.5", many ? "grid-cols-2" : "grid-cols-1")}>
        {view.children.map((c) => {
          const on = c.id === view.child.id;
          return (
            <Link key={c.id} href={`${basePath}${many ? `?child=${c.id}` : ""}`} aria-current={on ? "page" : undefined} scroll={false} prefetch={false}
              className={cx("rounded-2xl p-3 text-left bg-surface border-2 shadow-card transition flex", many ? "flex-col" : "items-center gap-3", on && many ? "border-brand" : "border-transparent")}>
              <Avatar name={c.name} size={38} />
              <span className={cx("min-w-0", many && "mt-2")}>
                <span className="block font-semibold text-[14.5px] leading-tight truncate">{many ? c.firstName : c.name}</span>
                <span className="block text-[12px] text-ink3 truncate">{c.classLabel ? classWords(t, c.classLabel) : t("Class not set")}</span>
                {c.classTeacher && <span className="block text-[12px] text-ink3 break-words">{t("Class teacher")}: {c.classTeacher}</span>}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* A row of the parts below, so a parent can jump to fees or attendance without scrolling (layman test loop 3). */}
      {cards.length >= 3 && (
        <nav aria-label={t("On this page")} className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-bg/95 backdrop-blur flex gap-2 overflow-x-auto">
          {cards.map(({ def }) => (
            <a key={def.key} href={`#pl-${def.key}`} className="shrink-0 h-9 inline-flex items-center rounded-full border border-line bg-surface px-3.5 text-[13px] font-semibold text-ink2 hover:border-brand hover:text-brand">{t.any(def.label)}</a>
          ))}
        </nav>
      )}

      {sections.map(({ def, data }) => {
        const Render = def.Render;
        if (def.key === "notices-critical") return <Render key={def.key} data={data} view={view} />;
        return (
          <PhoneCard key={def.key} aria-labelledby={`pl-${def.key}`}>
            <h2 id={`pl-${def.key}`} className="font-semibold text-[15px] mb-2 scroll-mt-16">
              {t.any(def.label)}
              {def.scope !== "family" && many && <span className="font-normal text-ink3"> · {view.child.firstName}</span>}
            </h2>
            <Render data={data} view={view} />
          </PhoneCard>
        );
      })}

      {sections.length === 0 && (
        <PhoneCard><p className="text-[14px] text-ink2">{t("Nothing new from the school right now. Notices and forms will appear here.")}</p></PhoneCard>
      )}
      <p className="text-center text-[12.5px] text-ink3 px-6">{t("To change details, please contact the school.")}</p>
    </PhoneShell>
  );
}
