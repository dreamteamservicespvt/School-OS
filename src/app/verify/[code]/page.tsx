import type { Metadata } from "next";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { CERTIFICATE_LABEL } from "@/lib/students/labels";
import { I18nProvider, Words } from "@/lib/i18n/client";
import { catalogueFor, getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Check a certificate", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Found = { cert_number: string | null; cert_type: string; issue_date: Date; cert_status: string; is_duplicate: boolean; school_name: string };

/**
 * Public QR check (03 §2): shows only the certificate number, type, issue date
 * and "Valid" (or "Cancelled"). The code is random and holds no personal data;
 * the database function returns nothing else.
 */
export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const clean = /^[A-Z2-9]{12,64}$/.test(code) ? code : null;
  const rows = clean ? await prisma.$queryRaw<Found[]>`SELECT * FROM verify_certificate(${clean})` : [];
  const c = rows[0];
  const valid = c?.cert_status === "ISSUED";
  // No school is known before the code is checked: the language this browser chose, else English.
  const t = await getT();
  return (
    <I18nProvider lang={t.lang} dict={catalogueFor(t.lang)}>
    <main className="flex min-h-dvh items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <Image src="/icon.svg" alt="" width={40} height={40} />
          <h1 className="text-xl font-semibold"><Words k="Check a certificate" /></h1>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          {!c ? (
            <>
              <p className="text-lg font-semibold text-danger"><Words k="Not found" /></p>
              <p className="mt-2 text-ink-2"><Words k="No issued certificate has this code. Check that the whole QR code was scanned, or ask the school that issued it." /></p>
            </>
          ) : (
            <>
              <p className={`text-2xl font-bold ${valid ? "text-success" : "text-danger"}`}>{valid ? t("Valid") : t("Cancelled")}</p>
              <dl className="mt-4 space-y-3">
                <div><dt className="text-sm text-ink-2"><Words k="Certificate number" /></dt><dd className="font-medium">{c.cert_number ?? ""}</dd></div>
                <div><dt className="text-sm text-ink-2"><Words k="Type" /></dt><dd className="font-medium">{t.any(CERTIFICATE_LABEL[c.cert_type as keyof typeof CERTIFICATE_LABEL] ?? c.cert_type)}{c.is_duplicate ? ` (${t("duplicate")})` : ""}</dd></div>
                <div><dt className="text-sm text-ink-2"><Words k="Date of issue" /></dt><dd className="font-medium">{formatDate(c.issue_date)}</dd></div>
                <div><dt className="text-sm text-ink-2"><Words k="Issued by" /></dt><dd className="font-medium">{c.school_name}</dd></div>
              </dl>
              {!valid && <p className="mt-4 text-ink-2"><Words k="The school cancelled this certificate. Ask the school for a current one." /></p>}
            </>
          )}
        </div>
      </div>
    </main>
    </I18nProvider>
  );
}
