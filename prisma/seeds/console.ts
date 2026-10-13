// The Super Admin console demo: DREAM TEAM's three people, a console card for
// each demo school, a paid plan for Sunrise and a trial for Green Valley.
// The console people sign in at /console/sign-in with their mobile number and
// DEMO_PASSWORD; the code goes to the server log while no SMS account is set.
// Everything goes through the console's own functions, so the Activity Log
// fills in exactly as it would for real work.

import { withConsole, withConsoleSchool, withSchool } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/auth/password";
import { actorOf } from "../../src/lib/console/auth";
import { logActivity } from "../../src/lib/console/activity";
import { markPaid, startSubscription, istDay } from "../../src/lib/console/billing";
import { addNote } from "../../src/lib/console/schools";
import { measureSchool } from "../../src/lib/console/measure";

export const CONSOLE_PEOPLE = [
  { name: "Kiran Reddy", phone: "9849012345", email: "kiran@dreamteamservices.in", role: "OWNER" },
  { name: "Ravi Kumar", phone: "9849023456", email: "ravi@dreamteamservices.in", role: "ONBOARDING" },
  { name: "Neha Gupta", phone: "9849034567", email: "neha@dreamteamservices.in", role: "SUPPORT" },
] as const;

type DemoSchool = { id: string; city: string; state: string; schoolType: string; approxStudents: number };

export async function seedConsole(password: string, schools: { sunrise: DemoSchool; valley: DemoSchool }) {
  if (await withConsole((tx) => tx.superAdminUser.count()) > 0) return;
  const hash = await hashPassword(password);
  const now = new Date();
  const people = [];
  for (const p of CONSOLE_PEOPLE) {
    people.push(await withConsole((tx) => tx.superAdminUser.create({ data: { ...p, status: "ACTIVE", passwordHash: hash, passwordChangedAt: now } })));
  }
  const [kiran, ravi] = people.map((u) => actorOf(u));

  // A console card for each demo school (the console's own copy: counts only).
  const days = (n: number) => new Date(istDay(now).getTime() + n * 86_400_000);
  const cards = [
    { s: schools.sunrise, status: "ACTIVE" as const, trialEndsOn: null, addedAt: days(-200) },
    { s: schools.valley, status: "TRIAL" as const, trialEndsOn: days(12), addedAt: days(-18) },
  ];
  for (const c of cards) {
    const school = await withSchool({ schoolId: c.s.id, userId: null }, (tx) => tx.school.findUniqueOrThrow({ where: { id: c.s.id } }));
    await withConsoleSchool(c.s.id, async (tx) => {
      await tx.school.update({ where: { id: c.s.id }, data: { status: c.status, city: c.s.city, state: c.s.state, schoolType: c.s.schoolType } });
      const existing = await tx.consoleSchool.findUnique({ where: { id: c.s.id } });
      const data = {
        code: school.code, name: school.name, city: c.s.city, state: c.s.state, board: school.board, schoolType: c.s.schoolType,
        phone: school.phone, phoneDigits: school.phone ? school.phone.replace(/\D/g, "").slice(-10) : null, email: school.email, address: school.address,
        approxStudents: c.s.approxStudents, status: c.status, statusSince: c.addedAt, trialEndsOn: c.trialEndsOn, startedAs: "TRIAL" as const,
        addedById: ravi.id, addedByName: ravi.name, createdAt: c.addedAt,
      };
      if (existing) await tx.consoleSchool.update({ where: { id: c.s.id }, data });
      else await tx.consoleSchool.create({ data: { id: c.s.id, ...data } });
      await logActivity(tx, ravi, { type: "school", school: { id: c.s.id, name: school.name }, text: `added ${school.name}, ${c.s.city}, on a ${c.status === "TRIAL" ? "30-day trial" : "trial"}.`, to: "Trial" });
    });
    await measureSchool(c.s.id, now).catch(() => null);
  }

  // Sunrise: Complete plan, first-year invoice paid by bank transfer.
  const sunriseName = (await withConsole((tx) => tx.consoleSchool.findUniqueOrThrow({ where: { id: schools.sunrise.id } }))).name;
  await withConsoleSchool(schools.sunrise.id, (tx) => logActivity(tx, kiran, { type: "status", school: { id: schools.sunrise.id, name: sunriseName }, text: `activated ${sunriseName}. Reason: The school chose the Complete plan.`, from: "Trial", to: "Active" }));
  const first = await startSubscription(kiran, schools.sunrise.id, { planKey: "complete", hostel: false, buses: 0, students: schools.sunrise.approxStudents, payIn: "YEARLY" }, days(-170));
  const inv = await withConsole((tx) => tx.platformInvoice.findUniqueOrThrow({ where: { number: first.number } }));
  await markPaid(kiran, inv.id, { via: "BANK", ref: "SBIN0261045512", receivedOn: days(-165) }, days(-165));
  await addNote(kiran, schools.sunrise.id, "Principal asked about Parent Link for the new year. Showed her the settings page.");
  await addNote(ravi, schools.valley.id, "Setup call done. The admin will add classes and subjects this week.");
}
