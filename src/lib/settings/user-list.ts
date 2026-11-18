// The people with a login in this school, for the Users list and its export.
import "server-only";

import type { Tx } from "../db";
import { stateOf, scopeLabel, type UserState } from "./users";
import { TWO_STEP_FEATURE } from "../auth/two-step";
import { mailIsSetUp } from "../auth/mail";
import { signInSmsTemplate } from "../auth/two-step-sms";
import { mayLogCode } from "../dev-codes";
import type { MessageKey } from "../i18n/t";

/**
 * Two-step login as it really works for one person (layman loop 6, L6-28), the same rule as their
 * own My profile: on when the feature is on and an enabled role needs it, or they chose it; but
 * "no-code" when no sign-in code can reach them (no email that mail can carry, no mobile that SMS
 * can carry), because then they sign in with the password only.
 */
export type TwoStepState = "on" | "no-code" | "off";

export function twoStepStateOf(input: { featureOn: boolean; roleNeeds: boolean; chosen: boolean; email: string | null; phone: string | null; mailReady: boolean; smsReady: boolean }): TwoStepState {
  const on = (input.featureOn && input.roleNeeds) || input.chosen;
  if (!on) return "off";
  const reach = (Boolean(input.email) && input.mailReady) || (Boolean(input.phone) && input.smsReady);
  return reach ? "on" : "no-code";
}

export const TWO_STEP_WORDS: Record<TwoStepState, string> = { on: "On", "no-code": "On, but not working: no code can reach them", off: "Off" };
/** The list cell: short, so the column fits at 1280-1536 px; the note above the list says why and what to do. */
export const TWO_STEP_SHORT: Record<TwoStepState, string> = { on: "On", "no-code": "On, but not working", off: "Off" };

/** What to add so a sign-in code reaches the people it does not reach (live test 17 Nov: the warning offered no next step). */
export type TwoStepFixStep = "no-sending" | "mobile-only" | "email-only" | "no-contact";
export const TWO_STEP_FIX_WORDS: Record<TwoStepFixStep, MessageKey> = {
  "no-sending": "Switch SMS on in Settings, SMS, WhatsApp & Email, so the code can go to their mobile number.",
  "mobile-only": "For people with only a mobile number: add their email address, or switch SMS on.",
  "email-only": "For people with only an email address: add their mobile number.",
  "no-contact": "For people with no mobile number or email: open the person in this list and add one.",
};

/** How many people two-step login is on for but no code reaches, and the steps that fix it; null when none. */
export function twoStepFix(rows: Pick<UserRow, "twoStepState" | "email" | "phone">[], ready: { mail: boolean; sms: boolean }): { people: number; steps: TwoStepFixStep[] } | null {
  const stuck = rows.filter((r) => r.twoStepState === "no-code");
  if (!stuck.length) return null;
  const steps = new Set<TwoStepFixStep>();
  if (!ready.mail && !ready.sms) steps.add("no-sending");
  if (ready.mail && !ready.sms && stuck.some((r) => r.phone && !r.email)) steps.add("mobile-only");
  if (ready.sms && !ready.mail && stuck.some((r) => r.email && !r.phone)) steps.add("email-only");
  if (stuck.some((r) => !r.email && !r.phone)) steps.add("no-contact");
  return { people: stuck.length, steps: (["no-sending", "mobile-only", "email-only", "no-contact"] as const).filter((x) => steps.has(x)) };
}

/** Whether email and SMS can carry a sign-in code in this school now (the server log stands in on a developer's computer). */
export async function codeSending(tx: Tx, schoolId: string): Promise<{ mail: boolean; sms: boolean }> {
  const devLog = mayLogCode("none");
  return { mail: mailIsSetUp() || devLog, sms: devLog || Boolean(await signInSmsTemplate(tx, { schoolId, userId: null })) };
}

export type UserRow = {
  id: string;
  name: string;
  username: string;
  phone: string | null;
  email: string | null;
  belongsTo: string | null;
  roles: { id: string; key: string | null; name: string }[];
  scope: string;
  campus: string | null;
  state: UserState;
  lastSignInAt: Date | null;
  /** Two-step login applies to them (on, working or not). */
  twoStep: boolean;
  twoStepState: TwoStepState;
  exceptions: number;
};

export async function schoolUsers(tx: Tx, schoolId: string): Promise<UserRow[]> {
  const accesses = await tx.schoolAccess.findMany({
    where: { schoolId },
    include: { userLogin: true, campus: true, roles: { include: { role: true } } },
    orderBy: { createdAt: "desc" },
  });
  const ids = [...new Set(accesses.map((a) => a.userLoginId))];
  const [staff, students] = await Promise.all([
    tx.staff.findMany({ where: { userLoginId: { in: ids } }, select: { userLoginId: true, fullName: true, designation: true } }),
    tx.student.findMany({ where: { userLoginId: { in: ids } }, select: { userLoginId: true, fullName: true } }),
  ]);
  // What the profile page checks too: the feature switch, and whether mail or SMS can carry a code.
  const feature = await tx.schoolFeature.findUnique({ where: { schoolId_featureKey: { schoolId, featureKey: TWO_STEP_FEATURE } }, select: { isOn: true } });
  const { mail: mailReady, sms: smsReady } = await codeSending(tx, schoolId);
  const rows: UserRow[] = [];
  for (const id of ids) {
    const mine = accesses.filter((a) => a.userLoginId === id);
    const live = mine.find((a) => !a.archivedAt);
    const shown = live ?? mine[0];
    const login = shown.userLogin;
    if (login.archivedAt) continue;
    const st = staff.find((s) => s.userLoginId === id);
    const su = students.find((s) => s.userLoginId === id);
    const roles = shown.roles.map((r) => r.role);
    rows.push({
      id,
      name: login.displayName,
      username: login.username,
      phone: login.phone,
      email: login.email,
      belongsTo: st ? `Staff: ${st.fullName}, ${st.designation}` : su ? `Student: ${su.fullName}` : null,
      roles: roles.map((r) => ({ id: r.id, key: r.key, name: r.name })),
      scope: scopeLabel(shown.scope),
      campus: shown.campus?.name ?? null,
      state: stateOf(login.status, Boolean(live)),
      lastSignInAt: login.lastSignInAt,
      ...(() => {
        const st = twoStepStateOf({
          featureOn: Boolean(feature?.isOn), roleNeeds: roles.some((r) => r.requiresTwoStep && r.isEnabled && !r.archivedAt), chosen: login.twoStepChosen,
          email: login.email, phone: login.phone, mailReady, smsReady,
        });
        return { twoStep: st !== "off", twoStepState: st };
      })(),
      exceptions: Object.keys((shown.exceptions as object) ?? {}).length,
    });
  }
  return rows;
}

export function filterUsers(rows: UserRow[], q: string, filters: Record<string, string>) {
  const s = q.toLowerCase();
  return rows.filter((r) => {
    if (s && ![r.name, r.username, r.phone ?? "", r.email ?? "", r.belongsTo ?? ""].some((x) => x.toLowerCase().includes(s))) return false;
    if (filters.status && r.state !== filters.status) return false;
    if (filters.role && !r.roles.some((x) => x.id === filters.role)) return false;
    if (filters.twostep === "on" && !r.twoStep) return false;
    if (filters.twostep === "off" && r.twoStep) return false;
    if (filters.twostep === "no-code" && r.twoStepState !== "no-code") return false;
    if (filters.exceptions === "yes" && r.exceptions === 0) return false;
    return true;
  });
}

export function sortUsers(rows: UserRow[], sort: string | null, dir: "asc" | "desc") {
  const k = dir === "asc" ? 1 : -1;
  const by: Record<string, (r: UserRow) => string | number> = {
    name: (r) => r.name.toLowerCase(),
    username: (r) => r.username,
    status: (r) => r.state,
    lastSignIn: (r) => r.lastSignInAt?.getTime() ?? 0,
  };
  const f = (sort && by[sort]) || by.name;
  return [...rows].sort((a, b) => (f(a) < f(b) ? -k : f(a) > f(b) ? k : 0));
}
