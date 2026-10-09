import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCurrent } from "@/lib/current";
import { BUILT_MODULES, findModule, MODULES } from "@/lib/modules";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { ModuleIcon } from "@/components/icons";

type Params = { params: Promise<{ module: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const mod = findModule((await params).module);
  return { title: mod?.name ?? "Not found" };
}

const STAGE_WORDS: Record<number, string> = {
  1: "Stage 1, the foundation, which is being built now",
  2: "Stage 2, the first version a school can buy",
  3: "Stage 3, teaching and staff pay",
  4: "Stage 4, services a school can switch on",
};

export default async function ModulePage({ params }: Params) {
  const mod = findModule((await params).module);
  if (!mod) notFound();
  const current = await requireCurrent();

  // Checked on the server, not only hidden from the menu (00-global.md §5).
  if (current.permissions[mod.key].see === "none") {
    return (
      <EmptyState title={`Your role does not include ${mod.name}`}>
        Ask your School Admin if you need it. Roles are set in Settings, Users &amp; Permissions.
      </EmptyState>
    );
  }
  if (mod.optional && !current.modulesOn.has(mod.key)) {
    return (
      <EmptyState title={`${mod.name} is switched off for ${current.school.name}`}>
        Your School Admin can switch it on in Settings, Modules On/Off. Nothing is lost while it is off.
      </EmptyState>
    );
  }

  const greeting = mod.key === "dashboard" ? greet(current.user.displayName, current.school.timeZone) : null;
  const built = MODULES.filter((m) => m.stage === 1 && BUILT_MODULES.has(m.key)).length;

  return (
    <>
      <PageHeader title={mod.name} href={`/${mod.key}`} userId={current.user.id} />
      {greeting && <p className="-mt-3 mb-5 text-ink-2">{greeting}</p>}
      <EmptyState title={`${mod.name} is on its way`} icon={<ModuleIcon module={mod.key} className="size-6" />}>
        <p>{mod.purpose}</p>
        <p className="mt-3 text-sm">It arrives in {STAGE_WORDS[mod.stage]}.</p>
        {mod.key === "dashboard" && (
          <p className="mt-3 text-sm">
            Your login, your roles and the walls that keep {current.school.name}&apos;s data apart are already working.
            {built > 0 ? ` ${built} of the Stage 1 modules are ready.` : " Settings is the next piece to be built."}
          </p>
        )}
      </EmptyState>
    </>
  );
}

function greet(name: string, timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", hour12: false }).format(new Date()));
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return `${part}, ${name.split(" ")[0]}.`;
}
