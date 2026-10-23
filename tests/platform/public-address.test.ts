// An integration's "test connection" calls the address the school typed
// (08-platform-security.md §7, gap list G03). It must never reach the server
// itself, a private network or the cloud's metadata address: https only,
// public addresses only, host names looked up and checked, the connection made
// to the checked address, no redirects followed, and a short time limit.
import http from "node:http";
import net, { type AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { isPrivateAddress, publicHostProblem, publicUrlProblem, PRIVATE_ADDRESS_WORDS } from "@/lib/net/public-address";
import { AddressRefused, publicAddresses, publicFetch, type Resolver } from "@/lib/net/public-fetch";
import { connectIntegration, INTEGRATIONS, testIntegration } from "@/lib/settings/switches";
import { SettingsProblem } from "@/lib/settings/common";
import { smtpProvider } from "@/lib/messaging/providers/smtp";
import { checkChannel } from "@/lib/messaging/channel-admin";
import { isGraphPage, listWhatsappTemplates, submitWhatsappTemplate, whatsappProvider } from "@/lib/messaging/providers/whatsapp";
import { makeSchool } from "../helpers";

describe("which addresses are private", () => {
  it.each([
    ["0.0.0.0", "this network"], ["10.1.2.3", "private 10/8"], ["100.64.0.1", "carrier NAT"], ["127.0.0.1", "this computer"],
    ["127.255.255.254", "this computer"], ["169.254.169.254", "cloud metadata"], ["172.16.0.1", "private 172.16/12"], ["172.31.255.255", "private 172.16/12"],
    ["192.0.0.8", "protocol assignments"], ["192.0.2.1", "documentation"], ["192.168.1.50", "private 192.168/16"], ["198.18.0.1", "benchmarking"],
    ["198.51.100.7", "documentation"], ["203.0.113.9", "documentation"], ["224.0.0.1", "multicast"], ["240.0.0.1", "reserved"], ["255.255.255.255", "broadcast"],
    ["::", "unspecified"], ["::1", "this computer"], ["::ffff:127.0.0.1", "IPv4 inside IPv6"], ["::ffff:a9fe:a9fe", "metadata inside IPv6"],
    ["64:ff9b::a00:1", "NAT64 of 10.0.0.1"], ["2002:c0a8:0101::1", "6to4 of 192.168.1.1"], ["fc00::1", "unique local"], ["fd12:3456::1", "unique local"],
    ["fe80::1", "link-local"], ["fe80::1%eth0", "link-local with a zone"], ["ff02::1", "multicast"], ["2001:db8::1", "documentation"], ["2001::1", "Teredo"],
    ["not-an-address", "unreadable"],
  ])("%s (%s) is refused", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "142.250.183.14", "172.32.0.1", "100.128.0.1", "2606:4700:4700::1111", "2404:6800:4009:80b::200e", "::ffff:8.8.8.8"])("%s is public", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("typed addresses", () => {
  it.each([
    "https://localhost/", "https://127.0.0.1:8080/", "https://127.1/", "https://2130706433/", "https://0x7f000001/", "https://[::1]/",
    "https://[::ffff:127.0.0.1]/", "https://169.254.169.254/latest/meta-data/", "https://10.0.0.5/", "https://192.168.1.1/",
    "https://metadata.google.internal/", "https://printer.local/", "https://intranet/",
  ])("%s is refused before any call", (url) => {
    expect(publicUrlProblem(url)).toBe(PRIVATE_ADDRESS_WORDS);
  });

  it("must be https, with no user name or password in it; Tally alone may use http", () => {
    expect(publicUrlProblem("http://example.com/")).toMatch(/https/);
    expect(publicUrlProblem("http://tally.example.com:9000/", { allowHttp: true })).toBeNull();
    expect(publicUrlProblem("ftp://example.com/", { allowHttp: true })).toMatch(/https/);
    expect(publicUrlProblem("file:///etc/passwd", { allowHttp: true })).toMatch(/https/);
    expect(publicUrlProblem("gopher://example.com:6379/_INFO", { allowHttp: true })).toMatch(/https/);
    expect(publicUrlProblem("https://admin:secret@example.com/")).toMatch(/user name and password/);
    expect(publicUrlProblem("https://hooks.example.com/school-os")).toBeNull();
  });

  it("a host name that points anywhere private is refused, even when it also has a public address", async () => {
    const resolve: Resolver = async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.7", family: 4 }];
    await expect(publicAddresses("rebind.example.com", { resolve })).rejects.toThrow(AddressRefused);
    await expect(publicFetch("https://rebind.example.com/", { resolve })).rejects.toThrow(PRIVATE_ADDRESS_WORDS);
    const metadata: Resolver = async () => [{ address: "169.254.169.254", family: 4 }];
    await expect(publicFetch("https://looks-public.example.com/", { resolve: metadata })).rejects.toThrow(AddressRefused);
  });
});

describe("calling a public address", () => {
  // Two local servers stand in for the internet: the test lets only 127.0.0.1 through.
  let outside: http.Server;
  let inside: http.Server;
  let insideHits = 0;
  let slow: http.Server;
  const port = (s: http.Server) => (s.address() as AddressInfo).port;
  const resolve: Resolver = async () => [{ address: "127.0.0.1", family: 4 }];
  const refuse = (ip: string) => ip !== "127.0.0.1" && isPrivateAddress(ip);
  const listen = (s: http.Server) => new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));

  beforeAll(async () => {
    inside = http.createServer((_req, res) => { insideHits++; res.end("secret"); });
    await listen(inside);
    outside = http.createServer((req, res) => {
      if (req.url === "/redirect-in") { res.writeHead(302, { location: `http://inside.example.com:${port(inside)}/` }); res.end(); return; }
      if (req.url === "/redirect-metadata") { res.writeHead(301, { location: "http://169.254.169.254/latest/meta-data/" }); res.end(); return; }
      res.writeHead(204);
      res.end();
    });
    await listen(outside);
    slow = http.createServer(() => { /* never answers */ });
    await listen(slow);
  });

  afterAll(async () => {
    for (const s of [outside, inside, slow]) { s.closeAllConnections(); await new Promise((r) => s.close(r)); }
  });

  it("returns the status, and connects only to the address that was checked", async () => {
    expect(await publicFetch(`http://outside.example.com:${port(outside)}/`, { allowHttp: true, resolve, refuse })).toEqual({ status: 204 });
  });

  it("does not follow a redirect, so a public address cannot send School OS inside", async () => {
    expect(await publicFetch(`http://outside.example.com:${port(outside)}/redirect-in`, { allowHttp: true, resolve, refuse })).toEqual({ status: 302 });
    expect(await publicFetch(`http://outside.example.com:${port(outside)}/redirect-metadata`, { allowHttp: true, resolve, refuse })).toEqual({ status: 301 });
    expect(insideHits).toBe(0);
  });

  it("gives up after the time limit", async () => {
    await expect(publicFetch(`http://slow.example.com:${port(slow)}/`, { allowHttp: true, resolve, refuse, timeoutMs: 300 })).rejects.toThrow(/timed out/);
  });
});

describe("an integration's test connection", () => {
  const webhooks = INTEGRATIONS.find((i) => i.key === "webhooks")!;

  it("refuses the metadata address and other private ones without calling them", async () => {
    const school = await makeSchool("Integration Wall School");
    const ctx = { schoolId: school.id, userId: null };
    const fetcher = vi.fn(async () => ({ status: 200 }));
    for (const address of ["https://169.254.169.254/latest/meta-data/", "https://127.0.0.1/", "https://[::1]/", "https://10.0.0.1/hook", "https://localhost/hook"]) {
      await expect(withSchool(ctx, (tx) => connectIntegration(tx, ctx, "webhooks", { address, secret: "s3cret-value" }, fetcher))).rejects.toThrow(SettingsProblem);
      expect((await testIntegration(webhooks, { address, secret: "kept" }, fetcher)).ok).toBe(false);
    }
    expect(fetcher).not.toHaveBeenCalled();
    const saved = await withSchool(ctx, (tx) => tx.integration.count({ where: { key: "webhooks" } }));
    expect(saved).toBe(0);
  });

  it("refuses a host name that is looked up to a private address", async () => {
    const lookedUpPrivate = (url: string, o: { allowHttp: boolean }) => publicFetch(url, { ...o, resolve: async () => [{ address: "10.20.30.40", family: 4 }] });
    const r = await testIntegration(webhooks, { address: "https://hooks.example.com/school-os", secret: "kept" }, lookedUpPrivate);
    expect(r).toEqual({ ok: false, note: `Webhook address: ${PRIVATE_ADDRESS_WORDS}` });
  });
});

describe("the school's email server (SMTP) in SMS, WhatsApp & Email", () => {
  it.each([
    "localhost", "127.0.0.1", "127.1", "0x7f.1", "2130706433", "::1", "[::1]", "169.254.169.254", "10.0.0.5", "172.20.1.1", "192.168.1.10",
    "fd00:ec2::254", "metadata.google.internal", "mail.local", "intranet", "100.100.100.200",
  ])("%s is refused as a server name", (host) => {
    expect(publicHostProblem(host)).toBe(PRIVATE_ADDRESS_WORDS);
  });

  it("a real server name or public address is fine; a web address or port is not a server name", () => {
    expect(publicHostProblem("smtp.gmail.com")).toBeNull();
    expect(publicHostProblem("smtp-relay.brevo.com.")).toBeNull();
    expect(publicHostProblem("142.250.4.108")).toBeNull();
    expect(publicHostProblem("https://smtp.gmail.com")).toMatch(/only the server name/);
    expect(publicHostProblem("smtp.gmail.com:587")).toMatch(/only the server name/);
  });

  it("saving refuses a private server and ports that are not for email", async () => {
    const school = await makeSchool("Mail Wall School");
    const ctx = { schoolId: school.id, userId: null };
    const input = (host: string, port = "587") => ({ provider: "smtp", live: true, isOn: true, config: { host, port, fromName: "School", fromAddress: "office@school.in", user: "office" }, secrets: { password: "pw-123456" }, lowCreditAlert: 0 });
    for (const host of ["127.0.0.1", "localhost", "169.254.169.254", "metadata.google.internal", "10.1.1.1"]) {
      const e = await withSchool(ctx, (tx) => checkChannel(tx, ctx, "email", input(host)));
      expect(e.host).toBe(PRIVATE_ADDRESS_WORDS);
    }
    expect((await withSchool(ctx, (tx) => checkChannel(tx, ctx, "email", input("smtp.gmail.com", "6379")))).port).toMatch(/587, 465, 25 or 2525/);
    expect(await withSchool(ctx, (tx) => checkChannel(tx, ctx, "email", input("smtp.gmail.com")))).toEqual({});
  });

  describe("sending (the test message too)", () => {
    // A local stand-in for a mail server that refuses everything; it counts who connects.
    let server: net.Server;
    let connections = 0;
    beforeAll(async () => {
      server = net.createServer((sock) => { connections++; sock.end("554 No thanks\r\n"); });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    });
    afterAll(async () => { await new Promise((r) => server.close(r)); });
    const cfg = (host: string, port: number) => ({ config: { host, port: String(port), fromAddress: "office@school.in", user: "office" }, secrets: { password: "pw" } });
    const msg = { channel: "email" as const, to: "parent@example.com", text: "Hello", subject: "Test" };

    it("never connects to a server name that is looked up to a private address", async () => {
      const lookedUpPrivate = (h: string) => publicAddresses(h, { resolve: async () => [{ address: "169.254.169.254", family: 4 }] });
      const r = await smtpProvider(cfg("mail.example.com", 587), { publicAddresses: lookedUpPrivate }).send(msg);
      expect(r).toEqual({ ok: false, retryable: false, reason: `Email server: ${PRIVATE_ADDRESS_WORDS}` });
      const typedPrivate = await smtpProvider(cfg("127.0.0.1", 587)).send(msg);
      expect(typedPrivate).toMatchObject({ ok: false, retryable: false, reason: `Email server: ${PRIVATE_ADDRESS_WORDS}` });
      const otherPort = await smtpProvider(cfg("smtp.gmail.com", 6379)).send(msg);
      expect(otherPort).toMatchObject({ ok: false, retryable: false });
      expect(connections).toBe(0);
    });

    it("connects to exactly the address that was checked", async () => {
      const port = (server.address() as AddressInfo).port;
      const checked = async () => [{ address: "127.0.0.1", family: 4 }];
      // The test lets its own stand-in through, on its own port.
      const r = await smtpProvider(cfg("mail.example.com", port), { publicAddresses: checked, ports: [port] }).send(msg);
      expect(r).toMatchObject({ ok: false, retryable: false });
      expect(connections).toBe(1);
    });
  });
});

describe("WhatsApp (Meta Cloud API) details typed in SMS, WhatsApp & Email", () => {
  // Every call goes to Meta's own address; the IDs the school types go into it, so they must be numbers only.
  it("saving refuses IDs that are not numbers", async () => {
    const school = await makeSchool("WhatsApp Wall School");
    const ctx = { schoolId: school.id, userId: null };
    const input = (phoneNumberId: string, businessAccountId: string) => ({ provider: "meta-cloud", live: true, isOn: true, config: { phoneNumberId, businessAccountId }, secrets: { accessToken: "token-123" }, lowCreditAlert: 0 });
    const bad = await withSchool(ctx, (tx) => checkChannel(tx, ctx, "whatsapp", input("../../169.254.169.254", "123/../me")));
    expect(bad.phoneNumberId).toMatch(/only numbers/);
    expect(bad.businessAccountId).toMatch(/only numbers/);
    expect(await withSchool(ctx, (tx) => checkChannel(tx, ctx, "whatsapp", input("106540352242922", "102290129340398")))).toEqual({});
  });

  it("sending never calls out with an ID that is not a number, and a page link to anywhere but Meta is not followed", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ data: [{ name: "fee_due", language: "en", status: "APPROVED" }], paging: { next: "http://169.254.169.254/latest/meta-data/" } }), { status: 200 });
    });
    try {
      const msg = { channel: "whatsapp" as const, to: "9848012345", text: "Hello" };
      expect(await whatsappProvider({ config: { phoneNumberId: "../me" }, secrets: { accessToken: "t" } }).send(msg)).toMatchObject({ ok: false, retryable: false, reason: expect.stringMatching(/only numbers/) });
      expect(await submitWhatsappTemplate({ config: { businessAccountId: "1/../2" }, secrets: { accessToken: "t" } }, { name: "x", language: "en", category: "UTILITY", body: "Hi" })).toMatchObject({ ok: false });
      expect(await listWhatsappTemplates({ config: { businessAccountId: "x" }, secrets: { accessToken: "t" } })).toBeNull();
      expect(calls).toEqual([]);
      // A real account: the first page is read, the link to the metadata address is not followed.
      expect(await listWhatsappTemplates({ config: { businessAccountId: "102290129340398" }, secrets: { accessToken: "t" } })).toBeNull();
      expect(calls).toHaveLength(1);
      expect(new URL(calls[0]).hostname).toBe("graph.facebook.com");
    } finally {
      vi.unstubAllGlobals();
    }
    expect(isGraphPage("https://graph.facebook.com/v23.0/102290129340398/message_templates?after=abc")).toBe(true);
    expect(isGraphPage("https://graph.facebook.com.evil.example/v23.0/x")).toBe(false);
    expect(isGraphPage("http://graph.facebook.com/v23.0/x")).toBe(false);
  });
});
