import type { Metadata } from "next";
import { requireConsolePage } from "@/lib/console/current";
import { withConsole } from "@/lib/db";
import { BOARDS, CORE_MODULES, OPTIONAL_MODULES, SCHOOL_TYPES, STATES, listGroups } from "@/lib/console/schools";
import { istDay, priceList } from "@/lib/console/billing";
import { appUrl, supportPhone } from "@/lib/console/outbox";
import { PageHead } from "@/components/ui/display";
import { BackLink } from "@/components/console/bits";
import { AddSchoolForm } from "@/components/console/add-school-form";
import { addSchoolAction, checkAddSchool } from "./actions";

export const metadata: Metadata = { title: "Add School" };

export default async function AddSchoolPage() {
  await requireConsolePage("add");
  const [groups, list] = await Promise.all([listGroups(), withConsole((tx) => priceList(tx, istDay()))]);
  const r = (p: bigint | undefined) => Number(p ?? 0n) / 100;
  return (
    <div>
      <BackLink label="Schools" />
      <PageHead title="Add School" sub="One screen in three short parts. Takes about two minutes." />
      <AddSchoolForm
        action={addSchoolAction}
        check={checkAddSchool}
        states={[...STATES]}
        boards={[...BOARDS]}
        types={SCHOOL_TYPES.map((t) => ({ value: t.value, sub: t.sub }))}
        groups={groups.map((g) => ({ value: g.id, label: `${g.name} (${g.schools} ${g.schools === 1 ? "school" : "schools"})` }))}
        core={CORE_MODULES.map((m) => m.name.replace(/ Management$/, ""))}
        optional={OPTIONAL_MODULES.map((m) => ({ key: m.key, label: m.label }))}
        prices={{ essential: r(list.essential?.pricePaise), complete: r(list.complete?.pricePaise), hostel: r(list.hostel?.pricePaise), min: list.essential?.minStudents ?? 100 }}
        help={supportPhone()}
        linkHost={appUrl().replace(/^https?:\/\//, "")}
      />
    </div>
  );
}
