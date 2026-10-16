// Stand-in for what WhatsApp/SMS would do here (CEMS has no channel): makes a
// guardian's Parent Link with the same library call the screens use, and a
// phone confirmed for it, then prints the link and the phone's cookie so the
// browser can open the guardian's page. Nothing is sent.
//   npx tsx --conditions=react-server --env-file=.env qa/people/parent-link-fixture.ts <guardianId> [...]
import { prisma, withSchool } from "../../src/lib/db";
import { createLink, deviceCookieName, hashToken, newDeviceKey, tokenFor } from "../../src/lib/parent-link/links";

const out: Record<string, unknown>[] = [];
for (const guardianId of process.argv.slice(2)) {
  const g = await prisma.$queryRaw<{ school_id: string }[]>`SELECT school_id FROM find_guardian_school(${guardianId}::uuid)`.catch(() => []);
  const schoolId = g[0]?.school_id ?? process.env.SCHOOL_ID!;
  const ctx = { schoolId, userId: process.env.USER_ID ?? null };
  const key = newDeviceKey();
  const link = await withSchool(ctx, async (tx) => {
    const link = (await tx.parentLink.findFirst({ where: { guardianId, status: "ACTIVE" } })) ?? (await createLink(tx, ctx, guardianId));
    await tx.parentLinkDevice.create({ data: { schoolId, parentLinkId: link.id, keyHash: hashToken(key), label: "QA browser (fixture)", verifiedAt: new Date(), lastUsedAt: new Date(), expiresAt: new Date(Date.now() + 7 * 86400_000) } });
    return link;
  });
  out.push({ guardianId, linkId: link.id, path: `/p/${tokenFor(link.id)}`, cookie: deviceCookieName(link.id), key });
}
console.log(JSON.stringify(out));
await prisma.$disconnect();
