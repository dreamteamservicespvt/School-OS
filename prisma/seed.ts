// Fills an empty database with a demo: two schools, and a few
// users with different roles, so every screen can be tried.
//
//   npm run db:seed
//
// Demo users get DEMO_PASSWORD from .env. Real schools' users always set
// their own password from an invite link (08-platform-security.md §2).

import { prisma, withSchool } from "../src/lib/db";
import { createSchool } from "../src/lib/schools";
import { hashPassword } from "../src/lib/auth/password";
import { createInvite } from "../src/lib/auth/invites";
import { notify } from "../src/lib/notifications";
import { seedCore } from "./seeds/core";
import { MODULE_SEEDS } from "./seeds/index";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("The demo seed never runs in production.");
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error("Set DEMO_PASSWORD in .env first.");
  if (await prisma.userLogin.findUnique({ where: { username: "principal" } })) {
    console.log("The demo is already there. Nothing changed.");
    return;
  }

  const sunrise = await createSchool({ code: "SPS", name: "Sunrise Public School", board: "CBSE", address: "Hyderabad, Telangana" });
  const valley = await createSchool({ code: "GVS", name: "Green Valley School", board: "State Board", address: "Warangal, Telangana" });

  const hash = await hashPassword(password);
  const people = [
    { username: "principal", name: "Lakshmi Rao", phone: "9876500001", access: [[sunrise.school.id, "principal"], [valley.school.id, "principal"]] },
    { username: "admin", name: "Suresh Kumar", phone: "9876500002", access: [[sunrise.school.id, "school-admin"]] },
    { username: "accountant", name: "Priya Sharma", phone: "9876500003", access: [[sunrise.school.id, "accountant"]] },
    { username: "teacher", name: "Ravi Teja", phone: "9876500004", access: [[sunrise.school.id, "class-teacher"]] },
    { username: "librarian", name: "Anitha Reddy", phone: "9876500005", access: [[sunrise.school.id, "librarian"]] },
    // One login for each of the other ready roles (05-roles.md), so every role can be tried.
    { username: "subjectteacher", name: "Prakash Kulkarni", phone: "9876500006", access: [[sunrise.school.id, "teacher"]] },
    { username: "reception", name: "Naresh Kumar", phone: "9876500007", access: [[sunrise.school.id, "receptionist"]] },
    { username: "transport", name: "Ganesh Rao", phone: "9876500008", access: [[sunrise.school.id, "transport-in-charge"]] },
    { username: "warden", name: "Sunita Patil", phone: "9876500009", access: [[sunrise.school.id, "hostel-warden"]] },
    { username: "store", name: "Mahesh Yadav", phone: "9876500010", access: [[sunrise.school.id, "store-keeper"]] },
  ] as const;

  for (const p of people) {
    const user = await prisma.userLogin.create({
      data: { username: p.username, displayName: p.name, phone: p.phone, status: "ACTIVE", passwordHash: hash, passwordChangedAt: new Date() },
    });
    for (const [schoolId, roleKey] of p.access) {
      await withSchool({ schoolId, userId: null }, async (tx) => {
        const role = await tx.role.findFirstOrThrow({ where: { schoolId, key: roleKey } });
        await tx.schoolAccess.create({
          data: { schoolId, userLoginId: user.id, roles: { create: [{ roleId: role.id, schoolId }] } },
        });
        await notify(tx, { schoolId, userId: null }, {
          to: user.id,
          type: "welcome",
          text: `Welcome to School OS. Your login works for ${schoolId === sunrise.school.id ? "Sunrise Public School" : "Green Valley School"}.`,
          link: "/profile",
        });
      });
    }
  }

  // One person who has been invited but has not set a password yet.
  const invited = await prisma.userLogin.create({ data: { username: "newteacher", displayName: "Meena Iyer", status: "INVITED" } });
  await withSchool({ schoolId: sunrise.school.id, userId: null }, async (tx) => {
    const role = await tx.role.findFirstOrThrow({ where: { schoolId: sunrise.school.id, key: "teacher" } });
    await tx.schoolAccess.create({
      data: { schoolId: sunrise.school.id, userLoginId: invited.id, roles: { create: [{ roleId: role.id, schoolId: sunrise.school.id }] } },
    });
  });
  const token = await createInvite(invited.id);

  const users = Object.fromEntries(
    (await prisma.userLogin.findMany({ select: { id: true, username: true } })).map((u) => [u.username, u.id]),
  );
  const schools = [
    await seedCore({ schoolId: sunrise.school.id, campusId: sunrise.campus.id, code: "SPS", name: "Sunrise Public School", users, full: true }),
    await seedCore({ schoolId: valley.school.id, campusId: valley.campus.id, code: "GVS", name: "Green Valley School", users: { principal: users.principal }, full: false }),
  ];
  for (const { module, seed } of MODULE_SEEDS) {
    for (const school of schools) await seed(school);
    console.log(`  demo data added: ${module}`);
  }

  console.log("Demo ready. Sign in with any of these usernames and DEMO_PASSWORD from .env:");
  for (const p of people) console.log(`  ${p.username.padEnd(12)} ${p.name}`);
  console.log(`Invite link for Meena Iyer (new teacher): /invite/${token}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
