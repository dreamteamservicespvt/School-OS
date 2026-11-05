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
  // @sparticuz/chromium reads its packed browser from bin/ at run time, and PDFs
  // read the Indian-script fonts from src/app/fonts; file tracing finds neither.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/@sparticuz/chromium/bin/**", "./src/app/fonts/noto-sans-*.woff2"],
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
