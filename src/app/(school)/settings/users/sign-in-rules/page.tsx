import type { Metadata } from "next";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { DEFAULT_SESSION_RULES, durationWords, IDLE_CHOICES, MAX_SESSION_CHOICES, readSessionRules, RECOMMENDED_SESSION_RULES } from "@/lib/auth/session-rules";
import { UsersNav } from "../sub-nav";
import { PasswordRulesForm, SessionRulesForm } from "./rules-forms";
import { EXPIRY_CHOICES, HISTORY_CHOICES, MIN_LENGTH_CHOICES, readPasswordRules } from "@/lib/auth/password-rules";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Password and session rules" };

/** Settings, Users & Permissions, "Password and session rules" (20-settings.md; gap list G45). */
export default async function SignInRulesPage() {
  const { current, may } = await requireSettingsPage("users");
  const [session, password] = await withSchool(current.ctx, (tx) => Promise.all([readSessionRules(tx, current.school.id), readPasswordRules(tx, current.school.id)]));
  const mark = (m: number, recommended: number, before: number) =>
    `${durationWords(m)}${m === recommended ? " (recommended)" : ""}${m === before && m !== recommended ? " (as before)" : ""}`;
  const idle = (recommended: number, before: number) => IDLE_CHOICES.map((m) => ({ value: String(m), label: mark(m, recommended, before) }));

  return (
    <>
      <PageHeader title="Users & Permissions" href="/settings/users" userId={current.user.id} />
      <UsersNav active="rules" />
      {may.readOnly && <p className="mb-4 rounded-xl bg-surface-2 p-3 text-sm text-ink-2">You can see the rules here. The School Admin changes them.</p>}
      <Card className="mb-5">
        <CardHeader title="Password rules" description="What every new password must be. They apply the next time someone sets a password: an invite link, a temporary password, Change password or a reset. Passwords set earlier keep working." />
        <div className="px-5 pb-5">
          <PasswordRulesForm
            readOnly={!may.edit}
            values={{ minLength: String(password.minLength), history: String(password.history), expiryDays: password.expiryDays === null ? "never" : String(password.expiryDays) }}
            lengthOptions={MIN_LENGTH_CHOICES.map((n) => ({ value: String(n), label: `${n} characters${n === 8 ? " (as before)" : ""}` }))}
            historyOptions={HISTORY_CHOICES.map((n) => ({ value: String(n), label: n === 0 ? "Not checked (as before)" : n === 1 ? "Not the one they have now" : `Not one of their last ${n}` }))}
            expiryOptions={[{ value: "never", label: "Never (as before)" }, ...EXPIRY_CHOICES.map((n) => ({ value: String(n), label: `After ${n} days` }))]}
            expiryNote={password.expiryDays && password.expirySince ? `Passwords set before ${formatDate(password.expirySince, current.school.timeZone)} count their days from that date.` : null}
          />
        </div>
      </Card>
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
