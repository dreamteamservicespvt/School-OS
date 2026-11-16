// "Messages from the school" on the guardian's Parent Link (live test 16 Nov: "in the parent link
// I don't receive any notification"). An app notice to a guardian becomes a real recipient row
// (channel "app") delivered at once; the guardian's own page shows it, newest first, with "New"
// until seen, and seeing it on a confirmed phone marks it Read. Never another guardian's or
// another school's, never on a phone not confirmed, never for opted-out parents, and never about
// a child the guardian has a custody restriction for.
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

import { withSchool, type SchoolContext } from "@/lib/db";
import { sendMessage } from "@/lib/messaging/send";
import { deliverMessage } from "@/lib/messaging/deliver";
import { updateSettings } from "@/lib/messaging/settings";
import { countsFor } from "@/lib/communication/history";
import { confirmDevice, createLink, hashToken, newDeviceKey, openLink, sendCode, splitPart, tokenFor } from "@/lib/parent-link/links";
import { loadGuardianView } from "@/lib/parent-link/view";
import { loadSections } from "@/lib/parent-link/render";
import { messagesToShow, MESSAGES_PAGE, type ParentMessages } from "@/lib/parent-link/messages";
import { withPart, NO_LINK_SUFFIX } from "@/lib/messaging/button-links";
import { setRestriction } from "@/lib/students/guardians";
import { makeCommSchool } from "../communication/fixture";
import { takeLoggedCode, watchLoggedCodes } from "../helpers";

watchLoggedCodes();

type School = Awaited<ReturnType<typeof makeCommSchool>>;
let s: School;
let other: School;
const links: Record<string, { linkId: string; deviceId: string }> = {};

async function linkAndPhone(school: School, guardianId: string) {
  const link = await withSchool(school.ctx, (tx) => createLink(tx, school.ctx, guardianId));
  const key = newDeviceKey();
  await withSchool(school.ctx, (tx) => sendCode(tx, school.ctx, link.id, "device", { keyHash: hashToken(key) }));
  const r = await withSchool(school.ctx, (tx) => confirmDevice(tx, school.ctx, link.id, key, takeLoggedCode(), { userAgent: "test", ipAddress: null }));
  expect(r.ok).toBe(true);
  const dev = await withSchool(school.ctx, (tx) => tx.parentLinkDevice.findFirstOrThrow({ where: { parentLinkId: link.id } }));
  links[guardianId] = { linkId: link.id, deviceId: dev.id };
  return { linkId: link.id, deviceId: dev.id, key };
}

async function sendApp(school: School, to: Parameters<typeof sendMessage>[2]["to"], title: string, text: string, ctx: SchoolContext = school.ctx) {
  const r = await withSchool(ctx, (tx) => sendMessage(tx, ctx, { to, channels: ["app"], title, text }));
  await withSchool(ctx, (tx) => deliverMessage(tx, ctx, { messageId: r.messageId, round: "0", chunk: 0 }));
  return r;
}

/** What the guardian's page shows in "Messages from the school" (null: the part is not shown). */
async function messagesOn(school: School, guardianId: string, opts: { deviceId?: string | null; preview?: boolean; more?: number } = {}) {
  const l = links[guardianId];
  return withSchool({ schoolId: school.school.id, userId: null }, async (tx) => {
    const ctx = { schoolId: school.school.id, userId: null };
    const view = await loadGuardianView(tx, ctx, { linkId: l.linkId, guardianId, token: tokenFor(l.linkId), preview: Boolean(opts.preview) });
    const sections = await loadSections(tx, ctx, { ...view!, deviceId: opts.deviceId === undefined ? l.deviceId : opts.deviceId, more: opts.more ?? 0 });
    return (sections.find((x) => x.def.key === "messages")?.data as ParentMessages | undefined) ?? null;
  });
}

const rowsOf = (school: School, messageId: string) => withSchool(school.ctx, (tx) => tx.messageRecipient.findMany({ where: { messageId }, orderBy: { name: "asc" } }));

beforeAll(async () => {
  s = await makeCommSchool();
  other = await makeCommSchool();
  for (const g of [s.father, s.mother, s.teluguMother, s.optFather]) await linkAndPhone(s, g.id);
  await linkAndPhone(other, other.father.id);
}, 120_000);

describe("an app notice to a guardian", () => {
  let messageId = "";

  it("is a real app row to that guardian, delivered at once", async () => {
    const r = await sendApp(s, { guardianIds: [s.father.id] }, "Sports day", "Sports day is on Friday. Please send your child in white.");
    messageId = r.messageId;
    const rows = await rowsOf(s, messageId);
    expect(rows.map((x) => [x.name, x.channel, x.address, x.guardianId, x.status])).toEqual([["Srinivas Kumar", "app", s.father.id, s.father.id, "DELIVERED"]]);
  });

  it("shows on that guardian's Parent Link: title, text, date, sender role, and New", async () => {
    const got = await messagesOn(s, s.father.id);
    expect(got!.rows).toHaveLength(1);
    expect(got!.rows[0]).toMatchObject({ title: "Sports day", text: "Sports day is on Friday. Please send your child in white.", from: "Principal", isNew: true });
    expect(got!.more).toBe(false);
  });

  it("is marked Read when seen, and is no longer New; Message History counts it read", async () => {
    const [row] = await rowsOf(s, messageId);
    expect(row.status).toBe("READ");
    expect(row.readAt).not.toBeNull();
    expect((await messagesOn(s, s.father.id))!.rows[0].isNew).toBe(false);
    const counts = await withSchool(s.ctx, (tx) => countsFor(tx, s.ctx, [messageId]));
    expect(counts.get(messageId)).toMatchObject({ total: 1, delivered: 1, read: 1 });
  });

  it("never shows on another guardian's Parent Link, nor in another school", async () => {
    expect(await messagesOn(s, s.mother.id)).toBeNull();
    await sendApp(other, { guardianIds: [other.father.id] }, "Other school", "A message of the other school.");
    const theirs = await messagesOn(other, other.father.id);
    expect(theirs!.rows.map((m) => m.title)).toEqual(["Other school"]);
    expect((await messagesOn(s, s.father.id))!.rows.map((m) => m.title)).toEqual(["Sports day"]);
    // The other school's guardian through this school's context sees none of its rows (row-level security).
    const leak = await withSchool(s.ctx, (tx) => tx.messageRecipient.count({ where: { guardianId: other.father.id } }));
    expect(leak).toBe(0);
  });

  it("is not shown, nor marked Read, on a phone not confirmed for the link", async () => {
    const r = await sendApp(s, { guardianIds: [s.mother.id] }, "Fee camp", "Fee camp on Saturday.");
    expect(await messagesOn(s, s.mother.id, { deviceId: null })).toBeNull();
    // Another link's phone does not count either.
    expect(await messagesOn(s, s.mother.id, { deviceId: links[s.father.id].deviceId })).toBeNull();
    expect((await rowsOf(s, r.messageId))[0]).toMatchObject({ status: "DELIVERED", readAt: null });
    // The page itself asks a new phone for its code before any part is drawn.
    const open = await openLink(tokenFor(links[s.mother.id].linkId), null, { userAgent: "test", ipAddress: null });
    expect(open.state).toBe("verify");
  });

  it("shows in the staff preview without marking it Read", async () => {
    const got = await messagesOn(s, s.mother.id, { preview: true, deviceId: null });
    expect(got!.rows.map((m) => [m.title, m.isNew])).toEqual([["Fee camp", true]]);
    const [row] = await withSchool(s.ctx, (tx) => tx.messageRecipient.findMany({ where: { guardianId: s.mother.id, channel: "app" } }));
    expect(row.readAt).toBeNull();
  });

  it("keeps to the latest 20, newest first, with Show older", async () => {
    for (let i = 1; i <= MESSAGES_PAGE + 1; i++) await sendApp(s, { guardianIds: [s.teluguMother.id] }, `Note ${i}`, `Note number ${i}.`);
    const first = await messagesOn(s, s.teluguMother.id);
    expect(first!.rows).toHaveLength(MESSAGES_PAGE);
    expect(first!.rows[0].title).toBe(`Note ${MESSAGES_PAGE + 1}`);
    expect(first!.more).toBe(true);
    const older = await messagesOn(s, s.teluguMother.id, { more: 1 });
    expect(older!.rows).toHaveLength(MESSAGES_PAGE + 1);
    expect(older!.more).toBe(false);
    expect(messagesToShow(0)).toBe(20);
    expect(messagesToShow(-3)).toBe(20);
    expect(messagesToShow(1000)).toBe(200);
  }, 120_000);

  it("leaves out a parent who opted out of messages", async () => {
    const r = await withSchool(s.ctx, (tx) => sendMessage(tx, s.ctx, { to: { guardianIds: [s.optFather.id, s.father.id] }, channels: ["app"], title: "Holiday", text: "Holiday on Monday." }));
    expect(r.skipped.map((g) => g.reason)).toContain("Opted out of messages");
    expect((await rowsOf(s, r.messageId)).map((x) => x.name)).toEqual(["Srinivas Kumar"]);
    await withSchool(s.ctx, (tx) => deliverMessage(tx, s.ctx, { messageId: r.messageId, round: "0", chunk: 0 }));
    expect(await messagesOn(s, s.optFather.id)).toBeNull();
  });

  it("does not reach parents while the school's Parent Link or its messages part is switched off", async () => {
    const shows = (on: boolean) => withSchool(s.ctx, (tx) => updateSettings(tx, s.ctx, (v) => ({ ...v, parentLink: { ...v.parentLink, shows: { ...v.parentLink.shows, messages: on } } })));
    await shows(false);
    const r = await withSchool(s.ctx, (tx) => sendMessage(tx, s.ctx, { to: { guardianIds: [s.father.id] }, channels: ["app", "whatsapp"], title: "Trip", text: "Trip on Tuesday." }));
    expect((await rowsOf(s, r.messageId)).map((x) => x.channel)).toEqual(["whatsapp"]);
    expect(await messagesOn(s, s.father.id)).toBeNull();
    await shows(true);
  });
});

describe("custody and access restrictions", () => {
  it("a guardian never sees a message about a child they have a restriction for; their other child's still show", async () => {
    // Before the restriction: one message about Ravi, one about Sita (the father has both).
    const aboutRavi = await sendApp(s, { guardiansOf: [s.ravi.id] }, "Ravi's class", "Class 5 A goes to the zoo.");
    expect((await rowsOf(s, aboutRavi.messageId)).find((x) => x.guardianId === s.father.id)?.studentId).toBe(s.ravi.id);
    await sendApp(s, { guardiansOf: [s.sita.id] }, "Sita's class", "Class 5 B has a quiz.");
    const link = await withSchool(s.ctx, (tx) => tx.studentGuardian.findFirstOrThrow({ where: { studentId: s.ravi.id, guardianId: s.father.id } }));
    await withSchool(s.ctx, (tx) => setRestriction(tx, s.ctx, link.id, "Court order; the mother has custody.", "Court order received by the office"));
    const titles = (await messagesOn(s, s.father.id))!.rows.map((m) => m.title);
    expect(titles).toContain("Sita's class");
    expect(titles).not.toContain("Ravi's class");
    // After it: a new message about Ravi does not reach him at all.
    const later = await sendApp(s, { guardiansOf: [s.ravi.id] }, "Ravi again", "Class 5 A sports kit.");
    expect((await rowsOf(s, later.messageId)).map((x) => x.guardianId)).not.toContain(s.father.id);
  });
});

describe("card buttons land on their part of the page", () => {
  it("the token keeps its part after a ~, and nothing else", () => {
    expect(splitPart("AbC_9-x~report-cards")).toEqual({ token: "AbC_9-x", part: "report-cards" });
    expect(splitPart("AbC_9-x")).toEqual({ token: "AbC_9-x", part: null });
    expect(splitPart("AbC~<script>")).toEqual({ token: "AbC~<script>", part: null });
    expect(withPart("AbC_9-x", "notices")).toBe("AbC_9-x~notices");
    expect(withPart(NO_LINK_SUFFIX, "notices")).toBe(NO_LINK_SUFFIX);
    // A tap-to-confirm secret is never changed.
    expect(withPart("AbC.secret", "notices")).toBe("AbC.secret");
  });
});
