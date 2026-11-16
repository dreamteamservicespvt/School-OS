// The people with a login in this school, for the Users list and its export.
import "server-only";

import type { Tx } from "../db";
import { stateOf, scopeLabel, type UserState } from "./users";
import { TWO_STEP_FEATURE } from "../auth/two-step";
import { mailIsSetUp } from "../auth/mail";
import { signInSmsTemplate } from "../auth/two-step-sms";
import { mayLogCode } from "../dev-codes";

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
  const devLog = mayLogCode("none");
  const mailReady = mailIsSetUp() || devLog;
  const smsReady = devLog || Boolean(await signInSmsTemplate(tx, { schoolId, userId: null }));
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
