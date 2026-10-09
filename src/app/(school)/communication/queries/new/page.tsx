import type { Metadata } from "next";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { CAME_BY, ensureTopics, QUERY_PRIORITIES, QUERY_TYPE_LABEL } from "@/lib/communication/queries";
import { PageHeader } from "@/components/shell/page-header";
import { QueryForm, type QueryFormData } from "./query-form";
import { ownerOptions } from "../owners";

export const metadata: Metadata = { title: "Log a query" };

export default async function NewQueryPage() {
  const access = await commPage("create");
  const { current } = access;
  const data: QueryFormData = await withSchool(current.ctx, async (tx) => {
    await ensureTopics(tx, current.ctx);
    const topics = await tx.queryTopic.findMany({ where: { schoolId: current.ctx.schoolId, archivedAt: null }, orderBy: { sortOrder: "asc" } });
    return {
      topics: topics.map((t) => ({ id: t.id, name: t.name, owner: t.defaultOwnerId ? `user:${t.defaultOwnerId}` : t.defaultDepartmentId ? `dept:${t.defaultDepartmentId}` : null })),
      owners: await ownerOptions(tx, current.ctx),
      types: Object.entries(QUERY_TYPE_LABEL).map(([value, label]) => ({ value, label })),
      priorities: QUERY_PRIORITIES.map((p) => ({ value: p.key, label: p.label })),
      cameBy: CAME_BY.map((c) => ({ value: c.key, label: c.label })),
    };
  });
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/communication/queries" className="text-brand-text hover:underline">← Feedback &amp; Queries</Link></p>
      <PageHeader title="Log a query" href="/communication/queries/new" userId={current.user.id} />
      <QueryForm data={data} />
    </>
  );
}
