import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { REQUEST_TYPES, barredFrom } from "@/lib/approvals";
import { roleKeyOf, rulesInUse } from "@/lib/settings/approval-rules";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { DefaultRuleButton } from "../../list-actions";
import { RuleEditor } from "./rule-editor";
import { schoolRoles } from "@/lib/school-roles";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Approval rule") };
}

/** Whole paise as the rupees typed in the editor: 500000 -> "5000". */
function rupees(paise: string | null | undefined) {
  if (!paise) return "";
  const p = BigInt(paise);
  const r = p / BigInt(100);
  const rest = p % BigInt(100);
  return rest === BigInt(0) ? r.toString() : `${r}.${rest.toString().padStart(2, "0")}`;
}

export default async function RulePage({ params }: { params: Promise<{ type: string }> }) {
  const { current } = await requireSettingsPage("forms-approvals", "edit");
  const { type } = await params;
  const t = REQUEST_TYPES.find((x) => x.key === type);
  if (!t) notFound();
  const { rule, roles, people } = await withSchool(current.ctx, async (tx) => {
    const rules = await rulesInUse(tx, current.school.id);
    const roles = await schoolRoles(tx, current.ctx, { where: { archivedAt: null, isEnabled: true }, orderBy: { name: "asc" } });
    const accesses = await tx.schoolAccess.findMany({ where: { archivedAt: null, userLogin: { status: "ACTIVE" } }, select: { userLogin: { select: { id: true, displayName: true } } } });
    const people = [...new Map(accesses.map((a) => [a.userLogin.id, a.userLogin.displayName]))].sort((a, b) => a[1].localeCompare(b[1]));
    return { rule: rules.find((r) => r.type === type)!, roles, people };
  });
  return (
    <>
      <Link href="/settings/forms-approvals" className="mb-2 inline-flex min-h-11 items-center text-sm font-medium text-brand-text hover:underline"><Words k={"← Forms & Approvals"} /></Link>
      <PageHeader title={`Approval rule: ${t.label}`} href={`/settings/forms-approvals/rules/${type}`} userId={current.user.id}>
        {rule.custom && <DefaultRuleButton type={type} label={t.label} />}
      </PageHeader>
      <p className="mb-4 max-w-3xl text-sm text-ink-2">
        <Words k="Each step names who approves, as a role or a named person, and up to which amount. A request goes to the first step whose limit covers it. Nobody ever approves their own request; it goes to the next approver. Changes apply to new requests." />
      </p>
      <Card>
        <CardBody>
          <RuleEditor type={type} label={t.label} escalateAfterDays={rule.escalateAfterDays}
            steps={rule.steps.map((s) => ({ approver: s.approverUserId ? `user:${s.approverUserId}` : s.approverRole ? `role:${s.approverRole}` : "", upTo: rupees(s.upToPaise) }))}
            roles={roles.filter((r) => !barredFrom(type, r.key)).map((r) => ({ value: `role:${roleKeyOf(r)}`, label: r.name }))}
            people={people.map(([id, name]) => ({ value: `user:${id}`, label: name }))} />
        </CardBody>
      </Card>
    </>
  );
}
