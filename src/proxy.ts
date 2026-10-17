// Passes the path of a full page load to the school layout, so a record page whose
// record is not there can answer HTTP 404 before the page starts streaming
// (QA PLATFORM-17, src/lib/record-gate.ts). Nothing is decided or refused here.
//
// It runs only for plain page loads: never for Next.js's own files, the API, server
// actions, in-app navigation (the "rsc" header) or any request with a body, so
// uploads are never buffered by the proxy.
import { NextResponse, type NextRequest } from "next/server";
import { PAGE_PATH_HEADER } from "@/lib/record-gate-header";

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(PAGE_PATH_HEADER, request.nextUrl.pathname);
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
  ],
};
