// Two jobs, both before a page runs:
//
// 1. Passes the path of a full page load to the school layout, so a record page
//    whose record is not there can answer HTTP 404 before the page starts
//    streaming (QA PLATFORM-17, src/lib/record-gate.ts). Nothing is decided or
//    refused for this. It runs only for plain page loads: never for Next.js's own
//    files, the API, server actions, in-app navigation (the "rsc" header) or any
//    request with a body, so uploads are never buffered by the proxy.
//
// 2. A DREAM TEAM support browser (the support cookie, 07-super-admin.md §3.4)
//    may only look: every change (any request that is not GET), export, print,
//    download and API is refused here, before any school code runs
//    (src/lib/support-paths.ts). Whether its access is still allowed is checked
//    on the server for every page (src/lib/current.ts); the path of each page it
//    opens is passed on for the school's Audit Log.
import { NextResponse, type NextRequest } from "next/server";
import { PAGE_PATH_HEADER } from "@/lib/record-gate-header";
import { SUPPORT_COOKIE, SUPPORT_PATH_HEADER, supportRefusal } from "@/lib/support-paths";

const plainPageLoad = (request: NextRequest) =>
  !request.nextUrl.pathname.startsWith("/api/") && !request.headers.has("rsc") && !request.headers.has("next-action") && !request.headers.has("content-type");

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  if (request.cookies.has(SUPPORT_COOKIE)) {
    const refused = supportRefusal(request.method, request.nextUrl.pathname);
    if (refused) return new NextResponse(refused.text, { status: refused.status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
    // Prefetches are not pages the person opened.
    if (!request.headers.has("next-router-prefetch")) headers.set(SUPPORT_PATH_HEADER, request.nextUrl.pathname);
    else headers.delete(SUPPORT_PATH_HEADER);
  } else {
    headers.delete(SUPPORT_PATH_HEADER);
  }
  if (plainPageLoad(request)) headers.set(PAGE_PATH_HEADER, request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/|api/).*)",
      missing: [
        { type: "header", key: "rsc" },
        { type: "header", key: "next-action" },
        { type: "header", key: "content-type" },
      ],
    },
    // Every request from a support browser, including server actions, in-app navigation and the API.
    {
      source: "/((?!_next/static|_next/image).*)",
      has: [{ type: "cookie", key: "sos_support" }],
    },
  ],
};
