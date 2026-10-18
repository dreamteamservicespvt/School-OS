// Calls an address a school typed in (an integration's "test connection"),
// safely (08-platform-security.md §7): https only, public internet addresses
// only, the host name looked up first and every address it gives checked, the
// connection made to exactly the address that was checked (so a name cannot
// switch to a private address between the check and the call), no redirects
// followed, and a short time limit. Only the answer's status is read.
import "server-only";

import { lookup as dnsLookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { isIpAddress, isPrivateAddress, PRIVATE_ADDRESS_WORDS, publicUrlProblem } from "./public-address";

export class AddressRefused extends Error {}

export type Resolved = { address: string; family: number };
/** Looks up every address of a host name (tests give their own). */
export type Resolver = (host: string) => Promise<Resolved[]>;

const systemResolver: Resolver = (host) =>
  new Promise((resolve, reject) => dnsLookup(host, { all: true, verbatim: true }, (err, list) => (err ? reject(err) : resolve(list))));

export type PublicFetchOptions = {
  /** http:// is allowed too (Tally only). */
  allowHttp?: boolean;
  /** The whole call, in milliseconds. */
  timeoutMs?: number;
  resolve?: Resolver;
  /** Which addresses are refused; tests may let one local test server through. */
  refuse?: (ip: string) => boolean;
};

/** The addresses School OS may connect to for this host, or an AddressRefused error. */
export async function publicAddresses(host: string, opts: Pick<PublicFetchOptions, "resolve" | "refuse"> = {}): Promise<Resolved[]> {
  const refuse = opts.refuse ?? isPrivateAddress;
  const bare = host.replace(/^\[|\]$/g, "");
  const list = isIpAddress(bare) ? [{ address: bare, family: bare.includes(":") ? 6 : 4 }] : await (opts.resolve ?? systemResolver)(bare);
  if (list.length === 0) throw new AddressRefused("This address could not be found.");
  // One private answer refuses them all: a name must not point anywhere private.
  if (list.some((a) => refuse(a.address))) throw new AddressRefused(PRIVATE_ADDRESS_WORDS);
  return list;
}

/**
 * A GET to a public address, returning only the status. Redirects are not
 * followed (a 3xx is returned as it is). Throws AddressRefused for an address
 * School OS may not call, or another error when it cannot be reached in time.
 */
export async function publicFetch(rawUrl: string, opts: PublicFetchOptions = {}): Promise<{ status: number }> {
  const problem = publicUrlProblem(rawUrl, { allowHttp: opts.allowHttp });
  if (problem) throw new AddressRefused(problem);
  const url = new URL(rawUrl.trim());
  const addresses = await publicAddresses(url.hostname, opts);
  const timeoutMs = opts.timeoutMs ?? 5000;

  // The connection goes to the address checked above, never to a second lookup.
  const pinned: LookupFunction = (_host, options, callback) => {
    if (options && (options as { all?: boolean }).all) (callback as (e: null, a: Resolved[]) => void)(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  };
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { req.destroy(new Error("timed out")); }, timeoutMs);
    const req = client.request(url, { method: "GET", lookup: pinned, timeout: timeoutMs, headers: { "user-agent": "School OS connection test" } }, (res) => {
      clearTimeout(timer);
      const status = res.statusCode ?? 0;
      res.destroy();
      resolve({ status });
    });
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", (e) => { clearTimeout(timer); reject(e); });
    req.end();
  });
}
