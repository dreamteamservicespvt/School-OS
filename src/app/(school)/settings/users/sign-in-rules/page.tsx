import type { Metadata } from "next";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { DEFAULT_SESSION_RULES, durationWords, IDLE_CHOICES, MAX_SESSION_CHOICES, readSessionRules, RECOMMENDED_SESSION_RULES } from "@/lib/auth/session-rules";
import { UsersNav } from "../sub-nav";
import { SessionRulesForm } from "./rules-forms";

export const metadata: Metadata = { title: "Password and session rules" };

/** Settings, Users & Permissions, "Password and session rules" (20-settings.md; gap list G45). */
export default async function SignInRulesPage() {
  const { current, may } = await requireSettingsPage("users");
  const session = await withSchool(current.ctx, (tx) => readSessionRules(tx, current.school.id));
  const mark = (m: number, recommended: number, before: number) =>
    `${durationWords(m)}${m === recommended ? " (recommended)" : ""}${m === before && m !== recommended ? " (as before)" : ""}`;
  const idle = (recommended: number, before: number) => IDLE_CHOICES.map((m) => ({ value: String(m), label: mark(m, recommended, before) }));

  return (
    <>
      <PageHeader title="Users & Permissions" href="/settings/users" userId={current.user.id} />
      <UsersNav active="rules" />
      {may.readOnly && <p className="mb-4 rounded-xl bg-surface-2 p-3 text-sm text-ink-2">You can see the rules here. The School Admin changes them.</p>}
      <Card>
        <CardHeader title="Session rules" description="How long a signed-in device stays signed in. School OS checks this on every page and every save, not only in the browser." />
        <div className="px-5 pb-5">
          <SessionRulesForm
            readOnly={!may.edit}
            saved={session.saved}
            values={{ idleComputer: String(session.idleComputer), idlePhone: String(session.idlePhone), maxSession: session.maxSession === null ? "none" : String(session.maxSession) }}
            computerOptions={idle(RECOMMENDED_SESSION_RULES.idleComputer, DEFAULT_SESSION_RULES.idleComputer)}
            phoneOptions={idle(RECOMMENDED_SESSION_RULES.idlePhone, DEFAULT_SESSION_RULES.idlePhone)}
            maxOptions={[{ value: "none", label: "No limit (as before)" }, ...MAX_SESSION_CHOICES.map((m) => ({ value: String(m), label: durationWords(m) }))]}
          />
        </div>
      </Card>
    </>
  );
}
