// The "correct a closed year" pass (04 §5) is kept in a cookie for 30
// minutes. It is signed, so nobody can write their own pass: a pass that was
// not started with startCorrection (which writes the audit entry) or that was
// changed (longer time, other reason, other year) is ignored (ACADEMICS-06).
import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export type CorrectionPass = { yearId: string; reason: string; userId: string; until: number };

function key() {
  const s = process.env.FILE_LINK_SECRET ?? process.env.FIELD_ENCRYPTION_KEY;
  if (!s) throw new Error("FILE_LINK_SECRET is not set");
  return `${s}:year-correction`;
}

const mac = (body: string) => createHmac("sha256", key()).update(body).digest("base64url");

export function sealCorrection(pass: CorrectionPass): string {
  const body = Buffer.from(JSON.stringify(pass)).toString("base64url");
  return `${body}.${mac(body)}`;
}

/** The pass, or null when it is missing, changed or not signed by this server. */
export function openCorrection(raw: string | undefined | null): CorrectionPass | null {
  if (!raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(mac(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as CorrectionPass;
    return typeof p.yearId === "string" && typeof p.userId === "string" && typeof p.until === "number" && typeof p.reason === "string" ? p : null;
  } catch {
    return null;
  }
}
