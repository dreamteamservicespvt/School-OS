// Settings, Payment Gateways (20-settings.md "Done when" 4 and the rules on
// gateway secrets and typed-name confirmation).
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { decryptField, encryptField, maskLast4 } from "@/lib/crypto";
import {
  addGateway,
  addLinkedAccount,
  archiveGateway,
  checkLinkedAccount,
  gatewayCredentials,
  GatewayProblem,
  razorpayCredentials,
  setGatewayActive,
  testGateway,
  updateGateway,
} from "@/lib/payments/gateways";
import { makeSchool, makeUser } from "../helpers";

let a: Awaited<ReturnType<typeof makeSchool>>;
let b: Awaited<ReturnType<typeof makeSchool>>;
let ctx: { schoolId: string; userId: string };

const input = {
  displayName: "Razorpay",
  provider: "razorpay",
  environment: "test" as const,
  values: { keyId: "rzp_test_1DP5mmOlF5G5ag", keySecret: "thisIsTheSecretKey9x2Q" },
  webhookSecret: "webhook-secret-abcd",
};
const pass = async () => ({ ok: true, checks: [{ label: "Razorpay accepted the keys", ok: true, note: "ok" }] });
const fail = async () => ({ ok: false, checks: [{ label: "Razorpay accepted the keys", ok: false, note: "Razorpay did not accept the Key ID and Key Secret." }] });

beforeAll(async () => {
  a = await makeSchool("Gateway School A");
  b = await makeSchool("Gateway School B");
  const admin = await makeUser({ schools: [{ id: a.id, roleKeys: ["school-admin"] }] });
  ctx = { schoolId: a.id, userId: admin.id };
});

describe("secrets", () => {
  it("encrypt and decrypt back to the same text, and mask to the last 4", () => {
    const sealed = encryptField("rzp-secret-1234");
    expect(sealed).not.toContain("rzp-secret");
    expect(decryptField(sealed)).toBe("rzp-secret-1234");
    expect(encryptField("same")).not.toBe(encryptField("same"));
    expect(maskLast4("rzp-secret-1234")).toBe("•••••••••••1234");
  });

  it("are stored encrypted, shown only as last 4, and never written to the audit log", async () => {
    const g = await withSchool(ctx, (tx) => addGateway(tx, ctx, input));
    expect(g.secretsEnc).not.toContain(input.values.keySecret);
    expect(g.webhookSecretEnc).not.toContain(input.webhookSecret);
    expect(JSON.parse(g.secretsLast4!)).toEqual({ keySecret: "9x2Q", webhookSecret: "abcd" });
    expect(g.publicKey).toBe(input.values.keyId);
    expect(g.isActive).toBe(false);
    const creds = await withSchool(ctx, (tx) => razorpayCredentials(tx, g.id));
    expect(creds).toMatchObject({ keyId: input.values.keyId, keySecret: input.values.keySecret, webhookSecret: input.webhookSecret, environment: "test" });
    const audit = await withSchool(ctx, (tx) => tx.auditLogEntry.findMany({ where: { recordId: g.id } }));
    expect(JSON.stringify(audit)).not.toContain(input.values.keySecret);
    expect(JSON.stringify(audit)).not.toContain(input.webhookSecret);
  });

  it("cannot be read from another school", async () => {
    const g = await withSchool(ctx, (tx) => tx.paymentGatewayAccount.findFirstOrThrow({ where: { displayName: "Razorpay" } }));
    expect(await withSchool({ schoolId: b.id, userId: null }, (tx) => gatewayCredentials(tx, g.id))).toBeNull();
  });
});

describe("adding and changing", () => {
  it("refuses a live key in test mode, a missing secret and a repeated name", async () => {
    await expect(withSchool(ctx, (tx) => addGateway(tx, ctx, { ...input, displayName: "Razorpay 2", values: { ...input.values, keyId: "rzp_live_1DP5mmOlF5G5ag" } }))).rejects.toThrow(/live mode/);
    await expect(withSchool(ctx, (tx) => addGateway(tx, ctx, { ...input, displayName: "Razorpay 3", values: { keyId: input.values.keyId, keySecret: "" } }))).rejects.toThrow(/Key Secret is needed/);
    await expect(withSchool(ctx, (tx) => addGateway(tx, ctx, { ...input, displayName: "razorpay" }))).rejects.toThrow(/already added/);
  });

  it("allows several accounts of one provider with distinct names", async () => {
    const g = await withSchool(ctx, (tx) => addGateway(tx, ctx, { ...input, displayName: "Razorpay Class A" }));
    expect(g.provider).toBe("razorpay");
  });

  it("can be switched on only after a passed test, with the typed name", async () => {
    const g = await withSchool(ctx, (tx) => tx.paymentGatewayAccount.findFirstOrThrow({ where: { displayName: "Razorpay" } }));
    await expect(withSchool(ctx, (tx) => setGatewayActive(tx, ctx, g.id, true, "Razorpay"))).rejects.toThrow(/Test the connection first/);
    await withSchool(ctx, (tx) => testGateway(tx, ctx, g.id, fail));
    await expect(withSchool(ctx, (tx) => setGatewayActive(tx, ctx, g.id, true, "Razorpay"))).rejects.toThrow(/Test the connection first/);
    await withSchool(ctx, (tx) => testGateway(tx, ctx, g.id, pass));
    await expect(withSchool(ctx, (tx) => setGatewayActive(tx, ctx, g.id, true, "Razor"))).rejects.toThrow(/Type Razorpay to confirm/);
    const on = await withSchool(ctx, (tx) => setGatewayActive(tx, ctx, g.id, true, "razorpay"));
    expect(on.isActive).toBe(true);
  });

  it("keeps the saved secret when the field is left blank, and needs the typed name", async () => {
    const g = await withSchool(ctx, (tx) => tx.paymentGatewayAccount.findFirstOrThrow({ where: { displayName: "Razorpay" } }));
    const edit = { ...input, values: { keyId: input.values.keyId, keySecret: "" }, webhookSecret: "" };
    await expect(withSchool(ctx, (tx) => updateGateway(tx, ctx, g.id, edit, "wrong"))).rejects.toBeInstanceOf(GatewayProblem);
    const { detailsChanged } = await withSchool(ctx, (tx) => updateGateway(tx, ctx, g.id, edit, "Razorpay"));
    expect(detailsChanged).toBe(false);
    const creds = await withSchool(ctx, (tx) => razorpayCredentials(tx, g.id));
    expect(creds?.keySecret).toBe(input.values.keySecret);
  });

  it("tests new details on a gateway that is on, and keeps the old ones if the test fails", async () => {
    const g = await withSchool(ctx, (tx) => tx.paymentGatewayAccount.findFirstOrThrow({ where: { displayName: "Razorpay" } }));
    const edit = { ...input, values: { keyId: input.values.keyId, keySecret: "aNewSecretThatIsWrong" } };
    await expect(withSchool(ctx, (tx) => updateGateway(tx, ctx, g.id, edit, "Razorpay", fail))).rejects.toThrow(/did not pass the test/);
    expect((await withSchool(ctx, (tx) => razorpayCredentials(tx, g.id)))?.keySecret).toBe(input.values.keySecret);
    await withSchool(ctx, (tx) => updateGateway(tx, ctx, g.id, edit, "Razorpay", pass));
    expect((await withSchool(ctx, (tx) => razorpayCredentials(tx, g.id)))?.keySecret).toBe("aNewSecretThatIsWrong");
    const audit = await withSchool(ctx, (tx) => tx.auditLogEntry.findFirstOrThrow({ where: { recordId: g.id, action: "changed" }, orderBy: { at: "desc" } }));
    expect(audit.after).toMatchObject({ secretsReplaced: ["Key Secret"] });
  });

  it("archives with the typed name, which also switches it off", async () => {
    const g = await withSchool(ctx, (tx) => tx.paymentGatewayAccount.findFirstOrThrow({ where: { displayName: "Razorpay Class A" } }));
    await withSchool(ctx, (tx) => archiveGateway(tx, ctx, g.id, "Razorpay Class A"));
    const after = await withSchool(ctx, (tx) => tx.paymentGatewayAccount.findUniqueOrThrow({ where: { id: g.id } }));
    expect(after.archivedAt).not.toBeNull();
    expect(after.isActive).toBe(false);
  });
});

describe("bank accounts for split payments", () => {
  it("checks the details in plain words", () => {
    const r = checkLinkedAccount({ label: "", bankName: "SBI", accountLast4: "12", ifsc: "sbin123", linkedAccountId: "acc_1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["accountLast4", "ifsc", "label", "linkedAccountId"]);
  });

  it("adds one Razorpay linked account once", async () => {
    const g = await withSchool(ctx, (tx) => tx.paymentGatewayAccount.findFirstOrThrow({ where: { displayName: "Razorpay" } }));
    const v = { label: "Trust account", bankName: "State Bank of India", accountLast4: "4321", ifsc: "SBIN0001234", linkedAccountId: "acc_HjVXbtpSCIxENR" };
    await withSchool(ctx, (tx) => addLinkedAccount(tx, ctx, g.id, v));
    await expect(withSchool(ctx, (tx) => addLinkedAccount(tx, ctx, g.id, v))).rejects.toThrow(/already added/);
  });
});
