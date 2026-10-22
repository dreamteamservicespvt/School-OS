import type { Metadata } from "next";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { CAME_BY, ensureTopics, QUERY_PRIORITIES, QUERY_TYPE_LABEL } from "@/lib/communication/queries";
import { BackLink, RecordHead } from "@/components/ui/split";
import { QueryForm, type QueryFormData } from "./query-form";
import { ownerOptions } from "../owners";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Log a query" };

export default async function NewQueryPage() {
  const access = await commPage("create");
  const { current } = access;
  const data: QueryFormData = await withSchool(current.ctx, async (tx) => {
    await ensureTopics(tx, current.ctx);
    const topics = await tx.queryTopic.findMany({ where: { schoolId: current.ctx.schoolId, archivedAt: null }, orderBy: { sortOrder: "asc" } });
    return {
      topics: topics.map((t) => ({ id: t.id, name: t.name, owner: t.defaultOwnerId ? `user:${t.defaultOwnerId}` : t.defaultDepartmentId ? `dept:${t.defaultDepartmentId}` : null })),
      owners: await ownerOptions(tx, current.ctx, access.scope.campusId),
      types: Object.entries(QUERY_TYPE_LABEL).map(([value, label]) => ({ value, label })),
      priorities: QUERY_PRIORITIES.map((p) => ({ value: p.key, label: p.label })),
      cameBy: CAME_BY.map((c) => ({ value: c.key, label: c.label })),
    };
  });
  return (
    <>
      <BackLink href="/communication/queries" label="Feedback & Queries" />
      <RecordHead title="Log a query" sub={<span className="text-[14px] text-ink3"><Words k="From a call, a visit, a letter or WhatsApp. It gets a ticket number, an owner and a status." /></span>} />
      <QueryForm data={data} />
    </>
  );
}
