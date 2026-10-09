// The guardian's Parent Link page body: a card per child (tapping one
// switches the page to that child), then each section that has something to
// show. Used on the public page and in the staff preview.
import Link from "next/link";
import type { GuardianView } from "@/lib/parent-link/sections";
import type { LoadedSection } from "@/lib/parent-link/render";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export function GuardianPage({ view, sections, schoolPhone, basePath }: { view: GuardianView; sections: LoadedSection[]; schoolPhone: string | null; basePath: string }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-ink-2">Namaste,</p>
        <h1 className="text-2xl font-semibold">{view.guardianName}</h1>
      </div>

      <nav aria-label="Your children" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-3">
          {view.children.map((c) => {
            const on = c.id === view.child.id;
            return (
              <li key={c.id} className="shrink-0">
                <Link href={`${basePath}${view.children.length > 1 ? `?child=${c.id}` : ""}`} aria-current={on ? "page" : undefined} scroll={false}
                  className={`flex min-h-16 min-w-52 items-center gap-3 rounded-2xl border p-3 ${on ? "border-brand bg-brand-soft" : "border-line bg-surface hover:bg-surface-2"}`}>
                  <span aria-hidden className={`grid size-11 place-items-center rounded-full text-sm font-semibold ${on ? "bg-brand text-brand-ink" : "bg-surface-3 text-ink"}`}>{initials(c.name)}</span>
                  <span>
                    <span className="block font-medium">{c.name}</span>
                    <span className="block text-sm text-ink-2">{c.classLabel || "Class not set"}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {sections.map(({ def, data }) => {
        const Render = def.Render;
        if (def.key === "notices-critical") return <Render key={def.key} data={data} view={view} />;
        return (
          <section key={def.key} aria-labelledby={`pl-${def.key}`} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <h2 id={`pl-${def.key}`} className="mb-3 text-lg font-semibold">
              {def.label}
              {def.scope !== "family" && view.children.length > 1 && <span className="font-normal text-ink-2"> · {view.child.firstName}</span>}
            </h2>
            <Render data={data} view={view} />
          </section>
        );
      })}

      {sections.length === 0 && (
        <p className="rounded-2xl border border-line bg-surface p-4 text-ink-2">Nothing new from the school right now. Notices and forms will appear here.</p>
      )}

      <footer className="border-t border-line pt-4 text-sm text-ink-2">
        <p>To ask a question, message or call the school{schoolPhone ? <>: <a className="font-medium text-brand-text underline" href={`tel:${schoolPhone}`}>{schoolPhone}</a></> : "."}</p>
        <p className="mt-1">To change details, please contact the school.</p>
      </footer>
    </div>
  );
}
