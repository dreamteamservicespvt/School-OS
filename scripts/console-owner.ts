// Makes DREAM TEAM's first Owner login for the Super Admin console
// (07-super-admin.md §2), from the server's settings, never from the code:
//   CONSOLE_OWNER_NAME, CONSOLE_OWNER_PHONE (10-digit mobile: the username,
//   and where sign-in codes go), CONSOLE_OWNER_EMAIL (can also be typed at
//   sign-in), CONSOLE_OWNER_PASSWORD.
//   npm run console:owner
// The Vercel build runs it too (scripts/vercel-build.ts).
//
// Safe to run on every deploy: it only ever adds the login once. When a login
// with that mobile or email already exists, nothing is changed, so a password
// changed later in the console stays changed. Remove CONSOLE_OWNER_PASSWORD
// from the settings once you have signed in.
import { withConsole } from "../src/lib/db";
import { checkNewPassword, hashPassword } from "../src/lib/auth/password";
import { logActivity, SYSTEM_ACTOR, tenDigits } from "../src/lib/console/activity";

export async function ensureConsoleOwner(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const name = env.CONSOLE_OWNER_NAME?.trim();
  const phone = tenDigits(env.CONSOLE_OWNER_PHONE);
  const email = env.CONSOLE_OWNER_EMAIL?.trim().toLowerCase() || null;
  const password = env.CONSOLE_OWNER_PASSWORD ?? "";
  if (!name && !env.CONSOLE_OWNER_PHONE && !password) return "No CONSOLE_OWNER_* settings: no console Owner login added.";
  if (!name) throw new Error("Set CONSOLE_OWNER_NAME.");
  if (!phone) throw new Error("Set CONSOLE_OWNER_PHONE to a 10-digit Indian mobile number.");
  const weak = checkNewPassword(password);
  if (weak) throw new Error(`CONSOLE_OWNER_PASSWORD is not allowed: ${weak}`);
  if (email && password.toLowerCase().includes(email)) throw new Error("CONSOLE_OWNER_PASSWORD must not contain the email address.");

  const hash = await hashPassword(password);
  return withConsole(async (tx) => {
    const existing = await tx.superAdminUser.findFirst({ where: { OR: [{ phone }, ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : [])] } });
    if (existing) return `A console login for ${existing.name} already exists. Nothing changed.`;
    const u = await tx.superAdminUser.create({ data: { name: name.slice(0, 120), phone, email, role: "OWNER", status: "ACTIVE", passwordHash: hash, passwordChangedAt: new Date() } });
    await logActivity(tx, SYSTEM_ACTOR, { type: "team", text: `Owner login added for ${u.name} from the server's settings.`, after: { name: u.name, role: "Owner" } });
    return `Console Owner login added for ${u.name}. Sign in at /console/sign-in with the mobile number or email and the password.`;
  });
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/console-owner.ts")) {
  ensureConsoleOwner()
    .then((msg) => { console.log(msg); process.exit(0); })
    .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
