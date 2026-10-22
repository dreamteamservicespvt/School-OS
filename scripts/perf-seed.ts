// Makes the demo school as big as a real one, to measure speed (gap list G37).
//
//   npx tsx --env-file=.env scripts/perf-seed.ts [school code, default SPS] [copies, default 7]
//   (HISTORY=0: no fee and message history; ONLY_HISTORY=1: only the history, no copies)
//
// Run it after the demo seed (npm run db:seed). It copies every student of the
// school `copies` times, with their parents, class, attendance marks, fee rows,
// payments, receipts, Day Book lines, reminders and messages, so the numbers
// and their mix stay those of the demo, only bigger: the demo's 321 students
// become about 2,600, with about 4,500 parents and 900,000 attendance marks.
// Staff are copied 3 times (with their own attendance) to about 140.
//
// Safety: it runs only on a worker's or a measuring database (a name ending in
// _w1, _w2... or _perf, optionally _test), never on the everyday school_os.
// It writes as the owner role inside the school's own wall (app.school_id),
// so row-level security still checks every row. Copies are marked: admission
// numbers and staff codes end in "~1", "~2"... Running it twice adds more copies.
import { PrismaClient } from "@prisma/client";

const [code = "SPS", copiesArg = "7"] = process.argv.slice(2);
const COPIES = Math.max(1, Math.min(20, Number(copiesArg) || 7));
const STAFF_COPIES = 3;

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error("MIGRATION_DATABASE_URL is not set (see .env).");
const dbName = new URL(url).pathname.slice(1);
if (!/_(w\d+|perf)(_test)?$/.test(dbName)) {
  throw new Error(`Refusing to run on database "${dbName}": only a worker's or measuring database (…_w3, …_perf) may be filled with copies.`);
}

const db = new PrismaClient({ datasourceUrl: url });

/** Columns of a table, in order. */
async function columns(table: string): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, table);
  if (!rows.length) throw new Error(`No table ${table}`);
  return rows.map((r) => r.column_name);
}

type Clone = {
  table: string;
  /** Which rows: a condition on t (the row copied). */
  where?: string;
  /** The map that drives the copies: one copy per (row, k) pair it holds for `col`. "k" alone: one copy per k from 1 to n. */
  drive: { col: string; map: string; cast?: string } | { k: number };
  /** Other id columns mapped to their copy (same k). */
  maps?: Record<string, string>;
  /** Column values as SQL over t (the row), k (the copy number) and m.new (the new id when `own`). */
  set?: Record<string, string>;
  /** Keep the new ids in this map (for tables others point to). */
  own?: string;
};

async function makeMap(tx: PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0], name: string) {
  await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS perf.map_${name} (old uuid NOT NULL, new uuid NOT NULL, k int NOT NULL)`);
  await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS map_${name}_old ON perf.map_${name} (old, k)`);
}

async function clone(tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0], schoolId: string, c: Clone) {
  const cols = await columns(c.table);
  const where = [`t.school_id = '${schoolId}'`, ...(c.where ? [c.where] : [])].join(" AND ");
  const driveFrom = "k" in c.drive
    ? `FROM ${c.table} t CROSS JOIN generate_series(1, ${c.drive.k}) AS g(k)`
    : `FROM ${c.table} t JOIN perf.map_${c.drive.map} d ON d.old${c.drive.cast ?? ""} = t.${c.drive.col}`;
  const kExpr = "k" in c.drive ? "g.k" : "d.k";
  let from = driveFrom;
  if (c.own) {
    await makeMap(tx, c.own);
    await tx.$executeRawUnsafe(`INSERT INTO perf.map_${c.own} (old, new, k) SELECT t.id, gen_random_uuid(), ${kExpr} ${driveFrom} WHERE ${where}`);
    from = `FROM ${c.table} t JOIN perf.map_${c.own} m ON m.old = t.id`;
  }
  const k = c.own ? "m.k" : kExpr;
  const joins: string[] = [];
  const exprs = cols.map((col) => {
    if (c.set?.[col]) return c.set[col].replaceAll("$k", k);
    if (col === "id") return c.own ? "m.new" : "gen_random_uuid()";
    if (!c.own && "col" in c.drive && col === c.drive.col) return c.drive.cast ? `d.new${c.drive.cast}` : "d.new";
    const map = c.maps?.[col];
    if (map) {
      const a = `j_${col}`;
      joins.push(`LEFT JOIN perf.map_${map} ${a} ON ${a}.old = t.${col} AND ${a}.k = ${k}`);
      return `COALESCE(${a}.new, t.${col})`;
    }
    return `t.${col}`;
  });
  // A row whose own map was made from a drive map keeps that drive's id too.
  if (c.own && "col" in c.drive) {
    const i = cols.indexOf(c.drive.col);
    const a = "j_drive";
    joins.push(`JOIN perf.map_${c.drive.map} ${a} ON ${a}.old${c.drive.cast ?? ""} = t.${c.drive.col} AND ${a}.k = m.k`);
    if (!c.set?.[c.drive.col]) exprs[i] = c.drive.cast ? `${a}.new${c.drive.cast}` : `${a}.new`;
  }
  const sql = `INSERT INTO ${c.table} (${cols.map((x) => `"${x}"`).join(", ")}) SELECT ${exprs.join(", ")} ${from} ${joins.join(" ")} WHERE ${where}`;
  const n = await tx.$executeRawUnsafe(sql);
  console.log(`  ${c.table.padEnd(22)} +${n}`);
  return n;
}

/**
 * A real school's past: last year's fees paid one installment at a time (a
 * payment, receipt and Day Book line for each fee row), an "Absent today"
 * message to a parent for every absence marked, and notices to every parent
 * (two a week). The demo itself has about one payment per student and a few
 * messages. Marked: receipt numbers start "H/", message triggers "(history)".
 */
async function history(schoolId: string) {
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.school_id', '${schoolId}', true), set_config('app.user_id', '', true)`);
    const [y] = await tx.$queryRawUnsafe<{ cur: string; prev: string | null; fy: string | null }[]>(`
      SELECT c.id AS cur,
        (SELECT p.id FROM academic_year p WHERE p.school_id = c.school_id AND p.campus_id = c.campus_id AND p.end_date < c.start_date ORDER BY p.end_date DESC LIMIT 1) AS prev,
        (SELECT f.id FROM financial_year f WHERE f.school_id = c.school_id AND f.end_date < c.start_date ORDER BY f.end_date DESC LIMIT 1) AS fy
      FROM academic_year c WHERE c.school_id = '${schoolId}' AND c.status = 'ACTIVE' ORDER BY c.start_date LIMIT 1`);
    if (!y?.prev || !y.fy) {
      console.log("  (no earlier academic and financial year: no fee history added)");
    } else {
      await makeMap(tx, "hdue");
      await tx.$executeRawUnsafe(`TRUNCATE perf.map_hdue`);
      await tx.$executeRawUnsafe(`INSERT INTO perf.map_hdue (old, new, k) SELECT id, gen_random_uuid(), 0 FROM student_fee_due WHERE school_id = '${schoolId}' AND academic_year_id = '${y.cur}' AND kind = 'FEE' AND state = 'OPEN' AND amount_paise > 0`);
      const dues = await tx.$executeRawUnsafe(`
        INSERT INTO student_fee_due (id, school_id, student_id, academic_year_id, fee_head_id, kind, label, due_date, amount_paise, concession_paise, adjustment_paise, paid_paise, balance_paise, state, note, created_at, updated_at)
        SELECT m.new, t.school_id, t.student_id, '${y.prev}', t.fee_head_id, t.kind, t.label, (t.due_date - interval '1 year')::date, t.amount_paise, 0, 0, t.amount_paise, 0, 'OPEN', 'Last year (measuring copy)', t.created_at - interval '1 year', now()
        FROM student_fee_due t JOIN perf.map_hdue m ON m.old = t.id`);
      const pays = await tx.$executeRawUnsafe(`
        INSERT INTO payment (id, school_id, student_id, academic_year_id, amount_paise, mode, paid_at, payment_date, status, source, created_at, updated_at)
        SELECT m.new, t.school_id, t.student_id, '${y.prev}', t.amount_paise,
          (ARRAY['CASH','UPI','UPI','CASH','CHEQUE','BANK_TRANSFER']::"PaymentMode"[])[1 + abs(hashtext(m.new::text)) % 6],
          (t.due_date - interval '1 year' + (abs(hashtext(t.id::text)) % 25) * interval '1 day' + interval '4 hours 30 minutes'),
          (t.due_date - interval '1 year' + (abs(hashtext(t.id::text)) % 25) * interval '1 day')::date, 'POSTED', 'COUNTER', now(), now()
        FROM student_fee_due t JOIN perf.map_hdue m ON m.old = t.id`);
      await tx.$executeRawUnsafe(`
        INSERT INTO payment_allocation (id, school_id, payment_id, due_id, fee_head_id, amount_paise)
        SELECT gen_random_uuid(), p.school_id, p.id, p.id, d.fee_head_id, p.amount_paise
        FROM payment p JOIN student_fee_due d ON d.id = p.id WHERE p.id IN (SELECT new FROM perf.map_hdue)`);
      await tx.$executeRawUnsafe(`
        INSERT INTO receipt (id, school_id, payment_id, number, date)
        SELECT gen_random_uuid(), p.school_id, p.id, 'H/' || row_number() OVER (ORDER BY p.paid_at, p.id), p.payment_date
        FROM payment p WHERE p.id IN (SELECT new FROM perf.map_hdue)`);
      await tx.$executeRawUnsafe(`
        INSERT INTO day_book_entry (id, school_id, financial_year_id, date, posted_at, direction, amount_paise, mode, section, head_name, fee_head_ids, account_id, deposit_account_id, source_type, source_id, source_key, student_id, class_id, section_id, party_name)
        SELECT gen_random_uuid(), p.school_id, '${y.fy}', p.payment_date, p.paid_at, 'IN', p.amount_paise, p.mode::text, 'fees-full', h.name, ARRAY[h.id::text],
          CASE WHEN p.mode = 'CASH' THEN cash.id ELSE bank.id END, bank.id, 'payment', p.id::text, 'payment:' || p.id || ':' || bank.id, p.student_id, e.class_id, e.section_id, s.full_name
        FROM payment p
        JOIN student_fee_due d ON d.id = p.id
        JOIN fee_head h ON h.id = d.fee_head_id
        JOIN student s ON s.id = p.student_id
        LEFT JOIN enrolment e ON e.student_id = p.student_id AND e.academic_year_id = '${y.prev}'
        CROSS JOIN LATERAL (SELECT id FROM bank_account WHERE school_id = p.school_id AND kind = 'CASH' ORDER BY created_at LIMIT 1) cash
        CROSS JOIN LATERAL (SELECT id FROM bank_account WHERE school_id = p.school_id AND kind = 'BANK' ORDER BY created_at LIMIT 1) bank
        WHERE p.id IN (SELECT new FROM perf.map_hdue)`);
      console.log(`  last year's fees         +${dues} fee rows, +${pays} payments with receipts and Day Book lines`);
    }

    // "Absent today" messages: one message a day, one parent for each absence marked.
    const days = await tx.$executeRawUnsafe(`
      INSERT INTO message (id, school_id, body, channels, audience_label, status, message_type, rule_key, trigger, sent_at, created_at)
      SELECT gen_random_uuid(), '${schoolId}', 'Dear parent, {student} was absent today.', ARRAY['whatsapp'], 'Parents of absent students', 'SENT', 'attendance', 'absence',
        'Absent on ' || to_char(d, 'DD-MM-YYYY') || ' (history)', d + interval '5 hours', d + interval '5 hours'
      FROM (SELECT DISTINCT date AS d FROM attendance_mark WHERE school_id = '${schoolId}' AND student_id IS NOT NULL AND status_key = 'absent') x`);
    const absent = await tx.$executeRawUnsafe(`
      INSERT INTO message_recipient (id, school_id, message_id, recipient_type, guardian_id, student_id, name, description, channel, address, text, status, provider, queued_at, sent_at, delivered_at)
      SELECT gen_random_uuid(), a.school_id, m.id, 'guardian', g.id, a.student_id, g.name, 'Parent of ' || s.full_name, 'whatsapp', g.phone,
        'Dear parent, ' || s.full_name || ' was absent today.', (ARRAY['DELIVERED','READ','READ','SENT','FAILED']::"DeliveryStatus"[])[1 + abs(hashtext(a.id::text)) % 5], 'sandbox', m.created_at, m.created_at, m.created_at
      FROM attendance_mark a
      JOIN message m ON m.school_id = a.school_id AND m.trigger = 'Absent on ' || to_char(a.date, 'DD-MM-YYYY') || ' (history)'
      JOIN student s ON s.id = a.student_id
      CROSS JOIN LATERAL (SELECT gg.id, gg.name, gg.phone FROM student_guardian sg JOIN guardian gg ON gg.id = sg.guardian_id WHERE sg.student_id = a.student_id ORDER BY sg.is_primary DESC, sg.created_at LIMIT 1) g
      WHERE a.school_id = '${schoolId}' AND a.student_id IS NOT NULL AND a.status_key = 'absent'`);
    console.log(`  absence messages         +${days} messages, +${absent} recipients`);

    // Notices to every parent, two a week over the marked days.
    const notices = await tx.$executeRawUnsafe(`
      INSERT INTO message (id, school_id, title, body, channels, audience_label, status, message_type, source_type, trigger, sent_at, created_at)
      SELECT gen_random_uuid(), '${schoolId}', 'Notice of ' || to_char(d, 'DD-MM-YYYY'), 'School notice for all parents.', ARRAY['whatsapp'], 'All parents', 'SENT', 'general', NULL,
        'Notice (history)', d + interval '9 hours', d + interval '9 hours'
      FROM (SELECT DISTINCT date AS d FROM attendance_mark WHERE school_id = '${schoolId}' AND student_id IS NOT NULL AND extract(isodow FROM date) IN (2, 5)) x`);
    const toAll = await tx.$executeRawUnsafe(`
      INSERT INTO message_recipient (id, school_id, message_id, recipient_type, guardian_id, name, description, channel, address, text, status, provider, queued_at, sent_at, delivered_at)
      SELECT gen_random_uuid(), m.school_id, m.id, 'guardian', g.id, g.name, 'Parent', 'whatsapp', g.phone, 'School notice for all parents.',
        (ARRAY['DELIVERED','READ','READ','SENT','FAILED']::"DeliveryStatus"[])[1 + abs(hashtext(g.id::text || m.id::text)) % 5], 'sandbox', m.created_at, m.created_at, m.created_at
      FROM message m JOIN guardian g ON g.school_id = m.school_id AND g.archived_at IS NULL
      WHERE m.school_id = '${schoolId}' AND m.trigger = 'Notice (history)'`);
    await tx.$executeRawUnsafe(`UPDATE message m SET recipient_count = (SELECT count(*) FROM message_recipient r WHERE r.message_id = m.id) WHERE m.school_id = '${schoolId}' AND m.trigger LIKE '%(history)'`);
    console.log(`  notices to all parents   +${notices} messages, +${toAll} recipients`);
  }, { timeout: 30 * 60_000, maxWait: 60_000 });
}

async function main() {
  // School rows are behind the wall too: the owner lists them the way the job worker does.
  const [school] = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.job_claim', 'on', true)`);
    return tx.$queryRawUnsafe<{ id: string; name: string }[]>(`SELECT id, name FROM school WHERE code = $1`, code);
  });
  if (!school) throw new Error(`No school with code ${code}. Load the demo first (npm run db:seed).`);
  console.log(`Copying ${school.name}: students ${COPIES} times, staff ${STAFF_COPIES} times, in ${dbName}`);
  const started = Date.now();

  await db.$executeRawUnsafe("CREATE SCHEMA IF NOT EXISTS perf");
  if (process.env.ONLY_HISTORY !== "1") for (const m of ["student", "guardian", "due", "payment", "staff"]) {
    await db.$executeRawUnsafe(`DROP TABLE IF EXISTS perf.map_${m}`);
  }

  if (process.env.ONLY_HISTORY !== "1") await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.school_id', '${school.id}', true), set_config('app.user_id', '', true)`);
    // Copies of copies are never made: only rows that are not copies themselves.
    const notCopy = "t.admission_no NOT LIKE '%~%'";
    await clone(tx, school.id, {
      table: "student", where: notCopy, drive: { k: COPIES }, own: "student",
      set: {
        admission_no: "t.admission_no || '~' || $k",
        // Mix first and last names between copies, so names repeat the way they do in a big school.
        first_name: "(SELECT s2.first_name FROM student s2 WHERE s2.school_id = t.school_id AND s2.admission_no NOT LIKE '%~%' ORDER BY md5(s2.id::text || $k) LIMIT 1 OFFSET (abs(hashtext(t.id::text)) % 50))",
        full_name: "t.full_name",
        user_login_id: "NULL", application_id: "NULL", photo_file_id: "NULL", aadhaar_enc: "NULL",
      },
    });
    await tx.$executeRawUnsafe(`UPDATE student s SET full_name = s.first_name || COALESCE(' ' || s.last_name, '') FROM perf.map_student m WHERE m.new = s.id`);
    await clone(tx, school.id, {
      table: "guardian", drive: { k: COPIES }, own: "guardian",
      where: "EXISTS (SELECT 1 FROM student_guardian sg JOIN student s ON s.id = sg.student_id WHERE sg.guardian_id = t.id AND s.admission_no NOT LIKE '%~%')",
      set: { phone: "left(t.phone, 4) || lpad(((right(t.phone, 6)::bigint + $k * 104729) % 1000000)::text, 6, '0')", photo_file_id: "NULL" },
    });
    await clone(tx, school.id, { table: "student_guardian", drive: { col: "student_id", map: "student" }, maps: { guardian_id: "guardian" } });
    await clone(tx, school.id, { table: "enrolment", drive: { col: "student_id", map: "student" }, set: { roll_no: "CASE WHEN t.roll_no IS NULL THEN NULL ELSE t.roll_no + $k * 100 END" } });
    await clone(tx, school.id, { table: "attendance_mark", where: "t.student_id IS NOT NULL", drive: { col: "student_id", map: "student" } });
    for (const table of ["marks", "result", "report_card", "co_scholastic_grade"]) {
      await clone(tx, school.id, { table, drive: { col: "student_id", map: "student" } });
    }

    await clone(tx, school.id, { table: "student_fee_due", drive: { col: "student_id", map: "student" }, own: "due" });
    await tx.$executeRawUnsafe(`UPDATE student_fee_due f SET parent_due_id = m2.new FROM perf.map_due m, perf.map_due m2 WHERE m.new = f.id AND f.parent_due_id = m2.old AND m2.k = m.k`);
    await clone(tx, school.id, {
      table: "payment", drive: { col: "student_id", map: "student" }, own: "payment",
      set: { gateway_payment_id: "CASE WHEN t.gateway_payment_id IS NULL THEN NULL ELSE t.gateway_payment_id || '~' || $k END", cancel_approval_id: "NULL", verify_approval_id: "NULL" },
    });
    await clone(tx, school.id, { table: "payment_allocation", drive: { col: "payment_id", map: "payment" }, maps: { due_id: "due" } });
    await clone(tx, school.id, { table: "receipt", drive: { col: "payment_id", map: "payment" }, set: { number: "t.number || '~' || $k" } });
    await clone(tx, school.id, {
      table: "day_book_entry", where: "t.source_type IN ('payment', 'payment-cancel')", drive: { col: "source_id", map: "payment", cast: "::text" },
      maps: { student_id: "student" },
      set: { source_key: "replace(t.source_key, t.source_id, d.new::text)", reverses_entry_id: "NULL" },
    });
    await clone(tx, school.id, { table: "fee_reminder", drive: { col: "student_id", map: "student" }, set: { once_key: "CASE WHEN t.once_key IS NULL THEN NULL ELSE t.once_key || '~' || $k END" } });
    await clone(tx, school.id, { table: "fee_call_note", drive: { col: "student_id", map: "student" } });
    await clone(tx, school.id, { table: "message_recipient", where: "t.guardian_id IS NOT NULL AND t.backup_of_id IS NULL", drive: { col: "guardian_id", map: "guardian" }, maps: { student_id: "student" } });
    await tx.$executeRawUnsafe(`UPDATE message m SET recipient_count = (SELECT count(*) FROM message_recipient r WHERE r.message_id = m.id) WHERE m.school_id = '${school.id}'`);

    await clone(tx, school.id, {
      table: "staff", where: "t.staff_code NOT LIKE '%~%'", drive: { k: STAFF_COPIES }, own: "staff",
      set: { staff_code: "t.staff_code || '~' || $k", user_login_id: "NULL", photo_file_id: "NULL" },
    });
    await clone(tx, school.id, { table: "attendance_mark", where: "t.staff_id IS NOT NULL", drive: { col: "staff_id", map: "staff" } });
  }, { timeout: 30 * 60_000, maxWait: 60_000 });

  if (process.env.HISTORY !== "0") await history(school.id);

  await db.$executeRawUnsafe("ANALYZE");
  const [counts] = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.school_id', '${school.id}', true)`);
    return tx.$queryRawUnsafe<Record<string, bigint>[]>(`SELECT
    (SELECT count(*) FROM student WHERE school_id = '${school.id}') AS students,
    (SELECT count(*) FROM guardian WHERE school_id = '${school.id}') AS guardians,
    (SELECT count(*) FROM staff WHERE school_id = '${school.id}') AS staff,
    (SELECT count(*) FROM attendance_mark WHERE school_id = '${school.id}') AS attendance_marks,
    (SELECT count(*) FROM student_fee_due WHERE school_id = '${school.id}') AS fee_rows,
    (SELECT count(*) FROM payment WHERE school_id = '${school.id}') AS payments,
    (SELECT count(*) FROM day_book_entry WHERE school_id = '${school.id}') AS day_book,
    (SELECT count(*) FROM message_recipient WHERE school_id = '${school.id}') AS message_recipients`);
  });
  console.log(`Done in ${Math.round((Date.now() - started) / 1000)} s:`, Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(v)])));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
