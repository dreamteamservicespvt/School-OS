import type { Metadata } from "next";
import Link from "next/link";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { assignableRoles } from "@/lib/settings/roles";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { InviteForm } from "./invite-form";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Invite a user" };

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ staff?: string }> }) {
  const { current } = await requireSettingsPage("users", "create");
  const sp = await searchParams;
  const { roles, campuses, staff } = await withSchool(current.ctx, async (tx) => ({
    roles: await assignableRoles(tx, current.ctx),
    campuses: await tx.campus.findMany({ where: { archivedAt: null }, orderBy: [{ isMain: "desc" }, { name: "asc" }], select: { id: true, name: true } }),
    staff: await tx.staff.findMany({
      where: { archivedAt: null, userLoginId: null, status: { in: ["ACTIVE", "ON_LEAVE"] } },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, phone: true, email: true, designation: true },
    }),
  }));
  const teacher = roles.find((r) => r.key === "teacher");
  return (
    <>
      <Link href="/settings/users" className="mb-2 inline-flex min-h-11 items-center text-sm font-medium text-brand-text hover:underline"><Words k={"← Users & Permissions"} /></Link>
      <PageHeader title="Invite a user" href="/settings/users/new" userId={current.user.id} />
      <p className="mb-4 max-w-3xl text-sm text-ink-2">
        <Words k="The person gets a link to choose their own password. You never see or send a password. Staff usually get their login from Add Staff; use this for anyone else, or to give an existing staff member a login." />
      </p>
      <Card>
        <CardBody>
          <InviteForm
            roles={roles}
            campuses={campuses}
            staff={staff.map((s) => ({ id: s.id, name: s.fullName, phone: s.phone, email: s.email, designation: s.designation }))}
            defaultRoleId={teacher?.id ?? ""}
            defaultStaffId={staff.some((s) => s.id === sp.staff) ? sp.staff! : ""}
          />
        </CardBody>
      </Card>
    </>
  );
}
