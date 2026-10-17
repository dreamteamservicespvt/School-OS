// An integration's "test connection" calls the address the school typed
// (08-platform-security.md §7, gap list G03). It must never reach the server
// itself, a private network or the cloud's metadata address: https only,
// public addresses only, host names looked up and checked, the connection made
// to the checked address, no redirects followed, and a short time limit.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { isPrivateAddress, publicUrlProblem, PRIVATE_ADDRESS_WORDS } from "@/lib/net/public-address";
import { AddressRefused, publicAddresses, publicFetch, type Resolver } from "@/lib/net/public-fetch";
import { connectIntegration, INTEGRATIONS, testIntegration } from "@/lib/settings/switches";
import { SettingsProblem } from "@/lib/settings/common";
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
