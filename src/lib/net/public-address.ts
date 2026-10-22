// Which internet addresses School OS may call when a school types one in
// (Settings, Modules On/Off, Integrations). Only addresses open to the whole
// internet: never the server itself (localhost), a private network (10.x,
// 172.16-31.x, 192.168.x), the cloud's own metadata address (169.254.169.254)
// or any other range that is not public (08-platform-security.md §7).
// No database and no Node modules, so the browser can use it too.

/** The four numbers of an IPv4 address, or null. Only the plain a.b.c.d form (URL parsing already turns 0x7f.1 and 2130706433 into it). */
function ipv4Parts(ip: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n <= 255) ? parts : null;
}

/** The 16 bytes of an IPv6 address (with or without brackets, a zone, or a dotted IPv4 end), or null. */
function ipv6Bytes(input: string): number[] | null {
  let ip = input.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  if (!ip.includes(":")) return null;
  // A dotted IPv4 at the end (::ffff:127.0.0.1) becomes two hex groups.
  const tail = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(ip);
  if (tail) {
    const v4 = ipv4Parts(tail[1]);
    if (!v4) return null;
    ip = ip.slice(0, -tail[1].length) + `${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const groups = (s: string) => (s ? s.split(":") : []);
  const head = groups(halves[0]);
  const rest = halves.length === 2 ? groups(halves[1]) : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const all = [...head, ...Array(fill).fill("0"), ...rest];
  if (all.length !== 8 || !all.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return all.flatMap((g) => { const n = parseInt(g, 16); return [n >> 8, n & 255]; });
}

const inV4 = (p: number[], base: [number, number, number, number], bits: number) => {
  const a = ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
  const b = ((base[0] << 24) | (base[1] << 16) | (base[2] << 8) | base[3]) >>> 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
};

/** IPv4 ranges that are not the public internet (RFC 6890 and friends). */
const V4_BLOCKED: [[number, number, number, number], number][] = [
  [[0, 0, 0, 0], 8], // "this network"
  [[10, 0, 0, 0], 8], // private
  [[100, 64, 0, 0], 10], // carrier-grade NAT
  [[127, 0, 0, 0], 8], // this computer (localhost)
  [[169, 254, 0, 0], 16], // link-local, incl. the cloud metadata address 169.254.169.254
  [[172, 16, 0, 0], 12], // private
  [[192, 0, 0, 0], 24], // protocol assignments
  [[192, 0, 2, 0], 24], // documentation
  [[192, 88, 99, 0], 24], // old 6to4 relay
  [[192, 168, 0, 0], 16], // private
  [[198, 18, 0, 0], 15], // benchmarking
  [[198, 51, 100, 0], 24], // documentation
  [[203, 0, 113, 0], 24], // documentation
  [[224, 0, 0, 0], 4], // multicast
  [[240, 0, 0, 0], 4], // reserved, and 255.255.255.255
];

function v4Blocked(p: number[]) {
  return V4_BLOCKED.some(([base, bits]) => inV4(p, base, bits));
}

function v6Blocked(b: number[]) {
  const zeros = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);
  // ::, ::1 and the old IPv4-compatible ::a.b.c.d: none is a public address.
  if (zeros(0, 12)) return true;
  // IPv4 inside IPv6 (::ffff:a.b.c.d, and NAT64 64:ff9b::a.b.c.d): judged by the IPv4 address.
  if (zeros(0, 10) && b[10] === 0xff && b[11] === 0xff) return v4Blocked(b.slice(12));
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && zeros(4, 12)) return v4Blocked(b.slice(12));
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) return true; // local-use NAT64 64:ff9b:1::/48
  // 6to4 (2002::/16) carries an IPv4 address in bytes 2 to 5.
  if (b[0] === 0x20 && b[1] === 0x02) return v4Blocked(b.slice(2, 6));
  if (b[0] === 0x01 && b[1] === 0x00 && zeros(2, 8)) return true; // discard 100::/64
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] < 0x02) return true; // protocol assignments 2001::/23, incl. Teredo
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true; // documentation 2001:db8::/32
  if ((b[0] & 0xfe) === 0xfc) return true; // unique local fc00::/7
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // link-local fe80::/10
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0xc0) return true; // old site-local fec0::/10
  if (b[0] === 0xff) return true; // multicast
  return false;
}

/** Whether a string is an IP address at all (IPv4 or IPv6). */
export function isIpAddress(host: string): boolean {
  return ipv4Parts(host) !== null || ipv6Bytes(host) !== null;
}

/**
 * True when an IP address is NOT on the public internet: this computer,
 * a private or carrier network, link-local (the cloud metadata address),
 * multicast, documentation or reserved ranges. Anything unreadable counts as blocked.
 */
export function isPrivateAddress(ip: string): boolean {
  const v4 = ipv4Parts(ip);
  if (v4) return v4Blocked(v4);
  const v6 = ipv6Bytes(ip);
  if (v6) return v6Blocked(v6);
  return true;
}

export const PRIVATE_ADDRESS_WORDS = "This address is inside a private network or on the server itself. School OS can only reach addresses open to the internet.";

/** Host names that never mean a public address. */
function privateHostName(host: string) {
  const h = host.toLowerCase().replace(/\.$/, "");
  return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan") || h.endsWith(".home.arpa") || !h.includes(".");
}

const HOST_ONLY_WORDS = "Enter only the server name, like smtp.gmail.com, without https:// or a port.";

/**
 * Checks a server name typed on its own (the school's email server, SMTP):
 * a real internet name or a public IP address, never the server itself, a
 * private network or the cloud's metadata address. Returns the problem in
 * plain words, or null. The name is checked again after it is looked up
 * (publicAddresses in src/lib/net/public-fetch.ts).
 */
export function publicHostProblem(raw: string): string | null {
  const host = raw.trim().replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!host) return "Enter the server name, like smtp.gmail.com.";
  if (isIpAddress(host)) return isPrivateAddress(host) ? PRIVATE_ADDRESS_WORDS : null;
  if (host.length > 253 || !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/.test(host)) return HOST_ONLY_WORDS;
  // A last part that is all numbers ("127.1", "0x7f.1") is an address in disguise, never a real name.
  if (/^(0x[0-9a-f]*|\d+)$/.test(host.split(".").at(-1) ?? "")) return PRIVATE_ADDRESS_WORDS;
  return privateHostName(host) ? PRIVATE_ADDRESS_WORDS : null;
}

/**
 * Checks a typed web address before School OS calls it: https only (http
 * only where allowed, for Tally), no user name or password in it, and not a
 * private address. Returns the problem in plain words, or null. Host names are
 * checked again after they are looked up (src/lib/net/public-fetch.ts).
 */
export function publicUrlProblem(raw: string, opts: { allowHttp?: boolean } = {}): string | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return "This must be a full web address, like https://example.com."; }
  if (u.protocol !== "https:" && !(opts.allowHttp && u.protocol === "http:")) return "This must start with https:// so the connection is encrypted.";
  if (u.username || u.password) return "Take the user name and password out of the address. Put them in their own boxes.";
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!host) return "This must be a full web address, like https://example.com.";
  if (isIpAddress(host) ? isPrivateAddress(host) : privateHostName(host)) return PRIVATE_ADDRESS_WORDS;
  return null;
}
