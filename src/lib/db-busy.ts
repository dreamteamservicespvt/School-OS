// The digest a "database busy" error carries to the browser (src/lib/db.ts markBusy), so the
// error page can say "busy, try again" (layman test LA5). Kept apart from db.ts, which the
// browser must never load.
export const BUSY_DIGEST = "school-os:busy:";
