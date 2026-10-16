// Sets every QA demo login (cems.*, qab.*) back to DEMO_PASSWORD and unlocks it.
//   npx tsx --conditions=react-server --env-file=.env qa/reset-passwords.ts
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";
const hash = await hashPassword(process.env.DEMO_PASSWORD!);
const r = await prisma.userLogin.updateMany({ where: { OR: [{ username: { startsWith: "cems." } }, { username: { startsWith: "qab." } }] }, data: { passwordHash: hash, failedAttempts: 0, lockedUntil: null } });
console.log(`reset ${r.count} logins`);
await prisma.$disconnect();
