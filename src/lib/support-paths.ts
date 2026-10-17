// What a DREAM TEAM support browser may reach inside a school (07-super-admin.md
// §3.4): it may open the school's pages to look, and nothing else. It can never
// send a change, export or download a file. src/proxy.ts uses this on every
// request that carries the support cookie, so it never touches the database.

/** The support browser's cookie: a random token whose hash is on the allowed Support Access Request. */
export const SUPPORT_COOKIE = "sos_support";
/** The proxy passes the path of each page a support browser opens, for the school's Audit Log. */
export const SUPPORT_PATH_HEADER = "x-school-os-support-path";

/** The support browser's own addresses: entering, ending, and leaving once it ended. */
export const SUPPORT_OWN_PATHS = ["/support/enter", "/support/end", "/support/left"] as const;

/** Reading APIs the school's screens use while a support person looks. Every other API is refused. */
const OPEN_APIS = new Set(["/api/v1/search", "/api/v1/me"]);

/** The last part of an address that is a file, an export or a print, never a page. */
const FILE_LAST = new Set([
  "export", "gate-export", "credits-export", "person-export", "print", "pdf", "template", "receipt", "tax-invoice", "offer-letter",
  "letter", "pass", "labels", "cards", "tags", "tally", "bank-file", "statement", "report", "errors", "preview-errors",
  "problems", "digilocker", "upload", "report-card",
]);
/** The last two parts, where the last word alone is also a page somewhere else. */
const FILE_LAST_TWO = new Set(["certificates/preview", "cocurricular/certificates", "staff-hr-management/id-cards"]);
/** Words followed by one file's id at the end: /files/<id>, /runs/<id>, /receipt/<payment>. */
const FILE_PARENT = new Set(["file", "files", "documents", "runs", "exports", "offers", "template", "errors", "pass", "letter", "certificate", "receipt", "fees"]);

/**
 * Whether an address is a school file, export or print (a route that sends a
 * file, never a page). tests/console/support-access.test.ts checks this against
 * every route and every page in src/app, so a new file route is never missed
 * and no page is ever refused.
 */
export function isFileAddress(pathname: string): boolean {
  const parts = pathname.split("?")[0].split("/").filter(Boolean);
  if (parts.length === 0) return false;
  if (FILE_LAST.has(parts[parts.length - 1])) return true;
  return parts.length >= 2 && (FILE_PARENT.has(parts[parts.length - 2]) || FILE_LAST_TWO.has(parts.slice(-2).join("/")));
}

export type SupportRefusal = { status: 403; text: string } | null;

/**
 * What the proxy does with a request from a support browser: null lets it
 * through (to look), anything else is refused with plain words. The console and
 * the support browser's own addresses are not school pages and always pass.
 */
export function supportRefusal(method: string, pathname: string): SupportRefusal {
  if (pathname === "/console" || pathname.startsWith("/console/")) return null;
  if ((SUPPORT_OWN_PATHS as readonly string[]).includes(pathname)) return null;
  if (method !== "GET" && method !== "HEAD") {
    return { status: 403, text: "DREAM TEAM support access is for looking only: nothing can be changed, sent or saved. Ask the school to make this change." };
  }
  if (pathname.startsWith("/api/")) {
    return OPEN_APIS.has(pathname) ? null : { status: 403, text: "DREAM TEAM support access cannot use this." };
  }
  if (isFileAddress(pathname)) {
    return { status: 403, text: "DREAM TEAM support access cannot export, print or download the school's data." };
  }
  return null;
}
