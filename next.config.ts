import type { NextConfig } from "next";

// Security headers for every page (08-platform-security.md §3: HTTPS only).
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
  // No script rules here (Next.js runs inline scripts); these close what needs none:
  // a planted <base> tag re-pointing links, plugins, and other sites framing a page.
  { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The PDF browser (src/lib/pdf.ts) is loaded from node_modules at run time, not bundled.
  serverExternalPackages: ["@node-rs/argon2", "playwright-core", "@sparticuz/chromium"],
  // PDFs read the Indian-script fonts from src/app/fonts; file tracing does not find them.
  // The browser itself is NOT bundled: bundled (~68 MB in every function) it made the
  // functions too big to share, and Vercel needed more than the Hobby plan's 12 (deploys of
  // 2026-11-12 failed). src/lib/pdf.ts fetches the pinned pack at run time instead.
  outputFileTracingIncludes: {
    "/**": ["./src/app/fonts/noto-sans-*.woff2"],
  },
  // Never loaded, so left out of every function: the browser's bundled bin/ and Prisma's
  // WebAssembly and edge engines (the Node client uses library.js and the native engine;
  // engineWasm is undefined), about 60 MB per function.
  outputFileTracingExcludes: {
    "/**": [
      "./node_modules/@sparticuz/chromium/bin/**",
      "./node_modules/@prisma/client/runtime/*.wasm",
      "./node_modules/@prisma/client/runtime/*.wasm-base64.js",
      "./node_modules/@prisma/client/runtime/*.wasm-base64.mjs",
      "./node_modules/@prisma/client/runtime/wasm-*.js",
      "./node_modules/@prisma/client/runtime/wasm-*.mjs",
      "./node_modules/@prisma/client/runtime/edge*.js",
      "./node_modules/@prisma/client/runtime/edge*.mjs",
      "./node_modules/.prisma/client/query_engine_bg.*",
      "./node_modules/.prisma/client/edge.js",
      "./node_modules/.prisma/client/wasm.js",
      "./node_modules/.prisma/client/wasm-*.mjs",
      "./node_modules/.prisma/client/*.tmp*",
    ],
  },
  // Homework hand-ins and study material carry photos and PDFs of up to 10 MB each (17 §6).
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Short words people type (live test 28: /exams said "This page is not here").
  async redirects() {
    return [
      { source: "/exams", destination: "/examination-results", permanent: false },
      { source: "/exams/:path*", destination: "/examination-results", permanent: false },
    ];
  },
};

export default nextConfig;
