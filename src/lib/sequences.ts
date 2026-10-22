// Running numbers that are unique in the school and never reused
// (04-data-model.md rules 7 and 25). Taken inside the same transaction as
// the record: a failed save gives the number back, and a saved one can
// never be given out twice.
import type { SchoolContext, Tx } from "./db";

export async function nextNumber(tx: Tx, ctx: SchoolContext, key: string): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO number_sequence (school_id, key, next_value, updated_at)
    VALUES (${ctx.schoolId}::uuid, ${key}, 2, now() AT TIME ZONE 'UTC')
    ON CONFLICT (school_id, key) DO UPDATE SET next_value = number_sequence.next_value + 1, updated_at = now() AT TIME ZONE 'UTC'
    RETURNING next_value - 1 AS value`;
  return Number(rows[0].value);
}

/** Formats a number like SPS/2026/00123. */
export function formatNumber(prefix: string, value: number, width = 5) {
  return `${prefix}${String(value).padStart(width, "0")}`;
}
