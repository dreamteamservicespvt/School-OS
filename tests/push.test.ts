// Push alerts (00-global.md §4 rules 6 and 8): a push goes only when the
// deployment has Firebase set up, the school switched Push alerts on and the
// person ticked Push for that kind; each carries the notification's own link;
// a browser Firebase no longer knows is archived, never deleted.
import { generateKeyPairSync, createVerify } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { readNotePrefs } from "@/lib/notification-kinds";
import { fcmMessage, PUSH_FEATURE, pushConfigured, readFcmAnswer, safeLink, serviceAccountAssertion } from "@/lib/push";
import { runDueJobs } from "@/lib/jobs";
import "@/lib/job-registry";
import { makeSchool, makeUser } from "./helpers";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const FIREBASE_ENV = {
  FIREBASE_PROJECT_ID: "school-os-test",
  FIREBASE_CLIENT_EMAIL: "push@school-os-test.iam.gserviceaccount.com",
  // Written on one line with "\n", the way secret stores keep it.
  FIREBASE_PRIVATE_KEY: pem.replace(/\n/g, "\\n"),
  FIREBASE_WEB_API_KEY: "test-web-key",
  FIREBASE_WEB_APP_ID: "1:1:web:test",
  FIREBASE_MESSAGING_SENDER_ID: "1",
};

function setFirebase(on: boolean) {
  for (const [k, v] of Object.entries(FIREBASE_ENV)) {
    if (on) vi.stubEnv(k, v);
    else vi.stubEnv(k, "");
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("the push message", () => {
  it("carries the same link, and only links inside School OS", () => {
    const m = fcmMessage("tok", { title: "Sunrise School", body: "Refund waiting for you", link: "/api/v1/push/open/abc", tag: "t" });
    expect(m.message.token).toBe("tok");
    expect(m.message.data).toMatchObject({ title: "Sunrise School", body: "Refund waiting for you", link: "/api/v1/push/open/abc" });
    expect(safeLink("https://evil.example/x")).toBe("/notifications");
    expect(safeLink("//evil.example")).toBe("/notifications");
    expect(safeLink("/fee-management")).toBe("/fee-management");
  });

  it("reads Firebase's answers in plain words", () => {
    expect(readFcmAnswer(200, { name: "x" })).toEqual({ ok: true });
    expect(readFcmAnswer(404, { error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } })).toMatchObject({ ok: false, gone: true });
    expect(readFcmAnswer(503, { error: { status: "UNAVAILABLE" } })).toMatchObject({ ok: false, gone: false, retryable: true });
    expect(readFcmAnswer(403, { error: { status: "PERMISSION_DENIED" } })).toMatchObject({ ok: false, retryable: false });
  });

  it("signs the service account sign-in with the private key", () => {
    const jwt = serviceAccountAssertion({ clientEmail: FIREBASE_ENV.FIREBASE_CLIENT_EMAIL, privateKey: pem }, 1_700_000_000);
    const [head, claims, sig] = jwt.split(".");
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toMatchObject({
      iss: FIREBASE_ENV.FIREBASE_CLIENT_EMAIL,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      exp: 1_700_003_600,
    });
    expect(createVerify("RSA-SHA256").update(`${head}.${claims}`).verify(publicKey, Buffer.from(sig, "base64url"))).toBe(true);
  });

  it("is ready only when every Firebase setting is there", () => {
    setFirebase(false);
    expect(pushConfigured()).toBe(false);
    setFirebase(true);
    expect(pushConfigured()).toBe(true);
  });

  it("is on by default for approvals and tasks only (rule 6)", () => {
    const prefs = readNotePrefs({});
    expect(prefs.approvals).toEqual(["app", "push"]);
    expect(prefs.tasks).toEqual(["app", "push"]);
    expect(prefs.notices).toEqual(["app"]);
  });
});

describe("sending push alerts", () => {
  let school: Awaited<ReturnType<typeof makeSchool>>;
  let person: { id: string };
  const ctx = () => ({ schoolId: school.id, userId: null });

  beforeAll(async () => {
    school = await makeSchool("Push School");
    person = await makeUser({ schools: [{ id: school.id, roleKeys: ["accountant"] }] });
    await withSchool(ctx(), async (tx) => {
      await tx.pushDevice.create({ data: { schoolId: school.id, userLoginId: person.id, token: "live-browser-token-000000000" } });
      await tx.pushDevice.create({ data: { schoolId: school.id, userLoginId: person.id, token: "gone-browser-token-000000000" } });
    });
  });

  const queued = (id: string) => withSchool(ctx(), (tx) => tx.backgroundJob.findMany({ where: { kind: "push-send", idempotencyKey: `push:${id}` } }));

  it("queues nothing while the school has not switched Push alerts on", async () => {
    setFirebase(true);
    const n = await withSchool(ctx(), (tx) => notify(tx, ctx(), { to: person.id, type: "approval", text: "A refund is waiting", link: "/approvals" }));
    expect(await queued(n!.id)).toHaveLength(0);
  });

  it("queues nothing for a kind the person did not tick", async () => {
    setFirebase(true);
    await withSchool(ctx(), (tx) => tx.schoolFeature.upsert({ where: { schoolId_featureKey: { schoolId: school.id, featureKey: PUSH_FEATURE } }, create: { schoolId: school.id, featureKey: PUSH_FEATURE, isOn: true }, update: { isOn: true } }));
    const n = await withSchool(ctx(), (tx) => notify(tx, ctx(), { to: person.id, type: "notice", text: "School closed tomorrow", link: "/communication" }));
    expect(await queued(n!.id)).toHaveLength(0);
  });

  it("sends to each browser and archives the one Firebase no longer knows", async () => {
    setFirebase(true);
    const n = await withSchool(ctx(), (tx) => notify(tx, ctx(), { to: person.id, type: "approval", text: "A refund is waiting", link: "/approvals" }));
    expect(await queued(n!.id)).toHaveLength(1);

    const sentTo: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (url.startsWith("https://oauth2.googleapis.com/")) return Response.json({ access_token: "ya29.test", expires_in: 3600 });
      const body = JSON.parse(String(init.body));
      sentTo.push(body.message.token);
      expect(body.message.data.link).toBe(`/api/v1/push/open/${n!.id}`);
      if (body.message.token.startsWith("gone")) return Response.json({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }, { status: 404 });
      return Response.json({ name: "projects/school-os-test/messages/1" });
    }));
    await runDueJobs(50);

    expect(sentTo.sort()).toEqual(["gone-browser-token-000000000", "live-browser-token-000000000"]);
    const devices = await withSchool(ctx(), (tx) => tx.pushDevice.findMany({ where: { userLoginId: person.id }, orderBy: { token: "asc" } }));
    expect(devices.map((d) => [d.token.slice(0, 4), Boolean(d.archivedAt)])).toEqual([["gone", true], ["live", false]]);
    const [job] = await queued(n!.id);
    expect(job.status).toBe("done");
  });
});
