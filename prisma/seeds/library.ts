// Library Management demo (13): switched on for Sunrise only (it is an
// optional module, off for every other school). A few hundred titles with
// copies and accession numbers, added as the librarian would (authors,
// publishers, valid ISBNs); some labels printed; books out with students and
// staff, some due today and some overdue; returns this term, a few late with
// fines (in the students' fees, and one staff fine to collect at the desk);
// a member who has reached the limit; a blocked member; a reservation waiting
// and one copy kept at the desk for the first in the queue; a lost-book
// charge above ₹500 waiting in Approvals; a closed stock check with copies
// missing. Dates are set from the day the demo is seeded.
import { withSchool, type SchoolContext, type Tx } from "../../src/lib/db";
import { librarySettings } from "../../src/lib/library/settings";
import { addBook } from "../../src/lib/library/catalogue";
import { memberByKey, setBlocked, type Member } from "../../src/lib/library/members";
import { createFine, markLostOrDamaged, waiveFine } from "../../src/lib/library/fines";
import { lateFine, addDays } from "../../src/lib/library/desk";
import { closeSession, scanCode, startSession } from "../../src/lib/library/stock";
import type { SeedSchool } from "./types";

const OFFSET = 330 * 60_000; // Asia/Kolkata
const today = () => new Date(`${new Date(Date.now() + OFFSET).toISOString().slice(0, 10)}T00:00:00Z`);

/** A valid ISBN-13 from a 12-digit stem (978 + 9 digits). */
function isbn13(stem: string) {
  const d = stem.split("").map(Number);
  const sum = d.reduce((a, x, i) => a + x * (i % 2 ? 3 : 1), 0);
  return `${stem}${(10 - (sum % 10)) % 10}`;
}

type B = [title: string, authors: string, publisher: string, category: string, subject: string | null, price: number, copies: number];

const BOOKS: B[] = [
  ["Wings of Fire", "A. P. J. Abdul Kalam; Arun Tiwari", "Universities Press", "Biography", null, 275, 4],
  ["Malgudi Days", "R. K. Narayan", "Indian Thought Publications", "Fiction", null, 199, 3],
  ["Swami and Friends", "R. K. Narayan", "Indian Thought Publications", "Fiction", null, 150, 3],
  ["The Room on the Roof", "Ruskin Bond", "Penguin India", "Fiction", null, 250, 2],
  ["The Blue Umbrella", "Ruskin Bond", "Rupa Publications", "Children's", null, 95, 3],
  ["Rusty Runs Away", "Ruskin Bond", "Penguin India", "Children's", null, 150, 2],
  ["Panchatantra Stories", "Vishnu Sharma", "Pustak Mahal", "Children's", null, 120, 4],
  ["Tales of Akbar and Birbal", "Anant Pai", "Amar Chitra Katha", "Comics", null, 80, 3],
  ["The Story of My Experiments with Truth", "M. K. Gandhi", "Navajivan", "Biography", null, 120, 2],
  ["Discovery of India", "Jawaharlal Nehru", "Penguin India", "General", "Social Science", 499, 2],
  ["Ignited Minds", "A. P. J. Abdul Kalam", "Penguin India", "General", null, 225, 2],
  ["My Experiments with Science", "Arvind Gupta", "National Book Trust", "Science", "Science", 110, 3],
  ["Toys from Trash", "Arvind Gupta", "National Book Trust", "Science", "Science", 90, 2],
  ["Harry Potter and the Philosopher's Stone", "J. K. Rowling", "Bloomsbury", "Fiction", null, 399, 3],
  ["Harry Potter and the Chamber of Secrets", "J. K. Rowling", "Bloomsbury", "Fiction", null, 399, 2],
  ["Charlotte's Web", "E. B. White", "HarperCollins", "Children's", null, 299, 2],
  ["Matilda", "Roald Dahl", "Puffin", "Children's", null, 299, 2],
  ["Charlie and the Chocolate Factory", "Roald Dahl", "Puffin", "Children's", null, 299, 2],
  ["The Jungle Book", "Rudyard Kipling", "Penguin India", "Fiction", null, 199, 2],
  ["Gitanjali", "Rabindranath Tagore", "Rupa Publications", "Fiction", null, 150, 1],
  ["The Kabuliwala and Other Stories", "Rabindranath Tagore", "Rupa Publications", "Fiction", null, 125, 2],
  ["A Brief History of Time", "Stephen Hawking", "Bantam", "Science", "Physics", 450, 1],
  ["The Diary of a Young Girl", "Anne Frank", "Penguin", "Biography", null, 250, 2],
  ["Godaan", "Premchand", "Rajkamal Prakashan", "Hindi", "Hindi", 175, 2],
  ["Idgah aur Anya Kahaniyan", "Premchand", "Rajkamal Prakashan", "Hindi", "Hindi", 120, 3],
  ["Madhushala", "Harivansh Rai Bachchan", "Rajpal and Sons", "Hindi", "Hindi", 99, 2],
  ["Kanyasulkam", "Gurajada Apparao", "Visalaandhra", "Telugu", "Telugu", 180, 2],
  ["Maha Prasthanam", "Sri Sri", "Visalaandhra", "Telugu", "Telugu", 90, 2],
  ["Chandamama Kathalu", "Various", "Chandamama", "Telugu", "Telugu", 60, 4],
  ["Oxford Student Atlas for India", "Oxford Editors", "Oxford University Press", "Reference", "Geography", 395, 4],
  ["Oxford Advanced Learner's Dictionary", "A. S. Hornby", "Oxford University Press", "Reference", "English", 725, 3],
  ["Manorama Year Book 2026", "Malayala Manorama", "Malayala Manorama", "Reference", "General Knowledge", 350, 2],
  ["Indian Polity for Young Readers", "M. Laxmikanth", "McGraw Hill", "General", "Civics", 325, 1],
  ["The Elephant Bird", "Ruskin Bond", "Puffin", "Children's", null, 199, 2],
  ["Grandpa's Tales", "Sudha Murty", "Puffin", "Children's", null, 199, 3],
  ["How I Taught My Grandmother to Read", "Sudha Murty", "Puffin", "Children's", null, 199, 3],
  ["The Magic Drum and Other Favourite Stories", "Sudha Murty", "Puffin", "Children's", null, 199, 2],
  ["Gopal the Jester", "Anant Pai", "Amar Chitra Katha", "Comics", null, 80, 2],
  ["Shivaji", "Anant Pai", "Amar Chitra Katha", "Comics", "History", 80, 2],
  ["Rani of Jhansi", "Anant Pai", "Amar Chitra Katha", "Comics", "History", 80, 2],
  ["Science Experiments for Young Learners", "Rina Mehta", "Navneet", "Science", "Science", 210, 2],
  ["Fun with Numbers", "Shakuntala Devi", "Orient Paperbacks", "Science", "Mathematics", 150, 2],
  ["Puzzles to Puzzle You", "Shakuntala Devi", "Orient Paperbacks", "Science", "Mathematics", 150, 2],
  ["Train to Pakistan", "Khushwant Singh", "Penguin India", "Fiction", null, 250, 1],
  ["The God of Small Things", "Arundhati Roy", "Penguin India", "Fiction", null, 399, 1],
  ["The Guide", "R. K. Narayan", "Indian Thought Publications", "Fiction", null, 195, 2],
  ["India After Gandhi", "Ramachandra Guha", "Picador", "General", "History", 799, 1],
  ["Stories from the Mahabharata", "C. Rajagopalachari", "Bharatiya Vidya Bhavan", "Children's", null, 160, 3],
  ["Ramayana for Children", "C. Rajagopalachari", "Bharatiya Vidya Bhavan", "Children's", null, 150, 3],
  ["The Cat Who Went to Heaven", "Elizabeth Coatsworth", "Simon and Schuster", "Children's", null, 220, 1],
];

const ACK = ["Chanakya", "Ashoka", "Harsha", "Raja Raja Chola", "Krishnadevaraya", "Rana Pratap", "Guru Nanak", "Kabir", "Mirabai", "Tansen", "Birbal the Wise", "Tenali Raman", "Vikram and Vetal", "Jataka Tales", "Hitopadesha", "Savitri", "Nala Damayanti", "Bhagat Singh", "Subhas Chandra Bose", "Sardar Patel", "Swami Vivekananda", "Sarojini Naidu", "C. V. Raman", "Jagadish Chandra Bose", "Homi Bhabha", "Vikram Sarabhai", "Ramanujan", "Aryabhata", "Kalpana Chawla", "Dhyan Chand"];

const SUBJECTS: [string, string][] = [["Science", "Science"], ["Mathematics", "Science"], ["Social Science", "General"], ["English", "General"], ["Hindi", "Hindi"], ["Telugu", "Telugu"], ["Computer Science", "Science"]];

/** Builds a few hundred titles: the named books above, NCERT textbooks and workbooks, comics and an encyclopaedia set. */
function allBooks(): B[] {
  const out: B[] = [...BOOKS];
  for (let cls = 1; cls <= 12; cls++) {
    for (const [subject, cat] of SUBJECTS) {
      if (cls <= 2 && ["Social Science", "Computer Science"].includes(subject)) continue;
      out.push([`${subject} Textbook for Class ${cls}`, "NCERT", "NCERT", cat, subject, 65 + cls * 10, cls <= 5 ? 2 : 3]);
    }
    if (cls >= 6) out.push([`${["Mathematics", "Science"][cls % 2]} Practice Workbook ${cls}`, "R. S. Aggarwal", "Bharati Bhawan", "Science", ["Mathematics", "Science"][cls % 2], 280, 1]);
  }
  for (let i = 1; i <= 60; i++) out.push([`Tinkle Digest ${i}`, "Anant Pai", "Amar Chitra Katha", "Comics", null, 90, 1]);
  for (const t of ACK) out.push([`Amar Chitra Katha: ${t}`, "Anant Pai", "Amar Chitra Katha", "Comics", "History", 80, 2]);
  for (let level = 1; level <= 6; level++) for (let b = 1; b <= 6; b++) out.push([`Ladybird Readers Level ${level}, Book ${b}`, "Ladybird Editors", "Ladybird Books", "Children's", "English", 120, 2]);
  for (let v = 1; v <= 12; v++) out.push([`Children's Encyclopaedia, Volume ${v}`, "Britannica Editors", "Encyclopaedia Britannica", "Reference", "General Knowledge", 650, 1]);
  return out;
}

const plainCtx = (school: SeedSchool, userId: string | null): SchoolContext => ({ schoolId: school.schoolId, userId });

export async function seedLibrary(school: SeedSchool) {
  if (!school.full) return;
  const librarian = school.users.librarian ?? school.users.principal;
  const ctx = plainCtx(school, librarian);
  const t0 = today();

  // 1. The module is on for the demo school, with the default settings and categories.
  await withSchool(ctx, async (tx) => {
    await tx.schoolModule.upsert({ where: { schoolId_moduleKey: { schoolId: school.schoolId, moduleKey: "library-management" } }, create: { schoolId: school.schoolId, moduleKey: "library-management", isOn: true }, update: { isOn: true } });
    await librarySettings(tx, ctx);
  });

  // 2. The catalogue, as the librarian adds it (in batches, so no transaction runs long).
  const list = allBooks();
  for (let i = 0; i < list.length; i += 40) {
    await withSchool(ctx, async (tx) => {
      const cats = await tx.libraryCategory.findMany({ where: { archivedAt: null } });
      for (const [j, [title, authors, publisher, category, subject, price, copies]] of list.slice(i, i + 40).entries()) {
        const n = i + j;
        await addBook(tx, ctx, {
          title, authors: authors.split(";").map((a) => a.trim()), publisher, isbn: n % 3 === 0 ? null : isbn13(`97881${String(7000000 + n * 37).padStart(7, "0")}`),
          categoryId: cats.find((c) => c.name === category)?.id ?? null, subject, language: category === "Hindi" ? "Hindi" : category === "Telugu" ? "Telugu" : "English", edition: null,
          pricePaise: BigInt(price * 100), shelf: null, copies, acquiredOn: addDays(t0, -400 + (n % 300)),
        });
      }
    }, { timeout: 300_000 });
  }

  await withSchool(ctx, async (tx) => {
    const s = await librarySettings(tx, ctx);
    // Most labels are printed; the newest copies are not yet.
    const all = await tx.bookCopy.findMany({ orderBy: { accessionNo: "asc" }, select: { id: true } });
    await tx.bookCopy.updateMany({ where: { id: { in: all.slice(0, all.length - 18).map((c) => c.id) } }, data: { labelPrintedAt: addDays(t0, -60) } });

    // Members: students of this year by class, and working staff.
    const enrol = await tx.enrolment.findMany({ where: { academicYearId: school.yearId, archivedAt: null, status: "STUDYING" }, select: { studentId: true, sectionId: true }, orderBy: [{ sectionId: "asc" }, { rollNo: "asc" }] });
    const staffRows = await tx.staff.findMany({ where: { archivedAt: null, status: "ACTIVE" }, select: { id: true }, orderBy: { staffCode: "asc" } });
    const pickStudents = enrol.filter((_, i) => i % 3 === 0).slice(0, 110);
    const member = async (key: string) => (await memberByKey(tx, ctx, s, key))!;
    const lendable = await tx.bookCopy.findMany({
      where: { status: "AVAILABLE", book: { categoryId: { in: (await tx.libraryCategory.findMany({ where: { forLoan: true } })).map((c) => c.id) } } },
      include: { book: true }, orderBy: { accessionNo: "asc" },
    }).then((rows) => {
      // Spread the loans over the catalogue, and keep the books used for the stories below free.
      const keep = ["Wings of Fire", "Matilda", "Charlotte's Web", "India After Gandhi"];
      const pool = rows.filter((c) => !keep.includes(c.book.title));
      return pool.map((c, i) => ({ c, k: (i * 37) % pool.length })).sort((a, b) => a.k - b.k).map((x) => x.c);
    });
    // Books out now each take a copy of their own; past (returned) issues may reuse any copy.
    let nextOut = 0;
    let nextAny = lendable.length - 1;
    const takeOut = () => lendable[nextOut++];
    const takeAny = () => { const c = lendable[nextAny--]; if (nextAny < nextOut) nextAny = lendable.length - 1; return c; };

    async function issue(m: Member, copy: (typeof lendable)[number], issuedDaysAgo: number, returnedDaysAgo: number | null, renewals = 0) {
      const issuedOn = addDays(t0, -issuedDaysAgo);
      const dueOn = addDays(issuedOn, m.loanDays * (1 + renewals));
      const returnedOn = returnedDaysAgo === null ? null : addDays(t0, -returnedDaysAgo);
      const late = returnedOn ? Math.max(0, Math.round((returnedOn.getTime() - dueOn.getTime()) / 86_400_000)) : 0;
      const row = await tx.bookIssue.create({
        data: {
          schoolId: school.schoolId, copyId: copy.id, bookId: copy.bookId, memberKind: m.kind, studentId: m.studentId, staffId: m.staffId, sectionId: m.sectionId,
          issuedOn, issuedAt: new Date(issuedOn.getTime() + 4 * 3_600_000), dueOn, renewals, issuedById: librarian,
          ...(returnedOn ? { returnedOn, returnedAt: new Date(returnedOn.getTime() + 5 * 3_600_000), outcome: "RETURNED" as const, lateDays: late, returnedById: librarian } : {}),
        },
      });
      if (!returnedOn) await tx.bookCopy.update({ where: { id: copy.id }, data: { status: "ISSUED", statusAt: row.issuedAt } });
      if (returnedOn && late > 0) {
        const f = lateFine(s, dueOn, returnedOn);
        if (f.amountPaise > BigInt(0)) {
          const fine = await createFine(tx, ctx, s, { member: m, reason: "LATE", issueId: row.id, copyId: copy.id, bookId: copy.bookId, lateDays: late, amountPaise: f.amountPaise, note: `${late} days late`, book: copy.book, today: returnedOn });
          // The fine dates from the day the book came back.
          await tx.libraryFine.update({ where: { id: fine.id }, data: { createdAt: new Date(returnedOn.getTime() + 5 * 3_600_000) } });
        }
      }
      return row;
    }

    // Returned earlier this term (a few late, with fines), then books out now.
    for (const [i, e] of pickStudents.entries()) {
      const m = await member(`S:${e.studentId}`);
      if (!m.active) continue;
      const lateBy = i % 9 === 0 ? 5 : i % 13 === 0 ? 2 : 0;
      await issue(m, takeAny(), 70 - (i % 20), 70 - (i % 20) - m.loanDays - lateBy);
      if (i % 2 === 0) await issue(m, takeAny(), 40 - (i % 10), 40 - (i % 10) - Math.max(3, m.loanDays - 4));
    }
    // Out now: most within the due date, some due today, some overdue (1 to 40 days).
    for (const [i, e] of pickStudents.entries()) {
      const m = await member(`S:${e.studentId}`);
      if (!m.active || i % 4 === 3) continue;
      const daysAgo = i % 10 === 0 ? m.loanDays + 1 + (i % 7) : i % 17 === 0 ? m.loanDays + 25 : i % 11 === 0 ? m.loanDays : (i % m.loanDays);
      await issue(m, takeOut(), daysAgo, null, i % 15 === 0 ? 1 : 0);
    }
    // A student who has reached the limit (the issue would be refused).
    const full = await member(`S:${pickStudents[5].studentId}`);
    const outNow = await tx.bookIssue.count({ where: { studentId: full.studentId, returnedAt: null } });
    for (let k = outNow; k < full.limit; k++) await issue(full, takeOut(), 3 + k, null);
    // Staff borrow too: one overdue, one late return with a fine to collect at the desk.
    for (const [i, st] of staffRows.slice(0, 8).entries()) {
      const m = await member(`T:${st.id}`);
      await issue(m, takeOut(), 10 + i * 3, null);
      if (i === 0) await issue(m, takeAny(), 50, 50 - m.loanDays - 6);
    }
    const lateStaff = await member(`T:${staffRows[1].id}`);
    await issue(lateStaff, takeOut(), lateStaff.loanDays + 4, null);

    // A blocked member.
    await setBlocked(tx, ctx, await member(`S:${pickStudents[12].studentId}`), true, "Two books not returned last term; parents asked to meet the librarian");

    // Reservations: every copy of "Wings of Fire" is out, two members wait (staff first is off).
    const wings = await tx.book.findFirstOrThrow({ where: { title: "Wings of Fire" }, include: { copies: { where: { status: "AVAILABLE" } } } });
    for (const [k, c] of wings.copies.entries()) await issue(await member(`S:${pickStudents[20 + k].studentId}`), { ...c, book: wings }, 6 + k, null);
    for (const [k, key] of [`S:${pickStudents[30].studentId}`, `T:${staffRows[3].id}`].entries()) {
      const m = await member(key);
      await tx.reservation.create({ data: { schoolId: school.schoolId, bookId: wings.id, memberKind: m.kind, studentId: m.studentId, staffId: m.staffId, reservedAt: addDays(t0, -4 + k), createdById: librarian } });
    }
    // One copy kept at the desk for the first in the queue of another book.
    const kept = await tx.book.findFirstOrThrow({ where: { title: "Matilda" }, include: { copies: { orderBy: { accessionNo: "asc" } } } });
    const keptFor = await member(`S:${pickStudents[33].studentId}`);
    if (kept.copies[0].status === "AVAILABLE") {
      await tx.bookCopy.update({ where: { id: kept.copies[0].id }, data: { status: "RESERVED", statusAt: addDays(t0, -1) } });
      await tx.reservation.create({ data: { schoolId: school.schoolId, bookId: kept.id, memberKind: keptFor.kind, studentId: keptFor.studentId, reservedAt: addDays(t0, -9), status: "READY", copyId: kept.copies[0].id, readyAt: addDays(t0, -1), createdById: librarian } });
    }

    // A lost book with a charge above ₹500: waiting in Approvals.
    const pricey = await tx.book.findFirstOrThrow({ where: { title: "India After Gandhi" }, include: { copies: true } });
    const priceyCopy = pricey.copies.find((c) => c.status === "AVAILABLE");
    if (priceyCopy) {
      await issue(await member(`S:${pickStudents[40].studentId}`), { ...priceyCopy, book: pricey }, 30, null);
      await markLostOrDamaged(tx, ctx, { copyId: priceyCopy.id, kind: "LOST", chargePaise: BigInt(84900), note: "Lost on the school bus, parent informed", today: t0 });
    }
    // A damaged copy, charged below the approval amount (straight into the fees).
    const dmg = await tx.book.findFirstOrThrow({ where: { title: "Charlotte's Web" }, include: { copies: { orderBy: { accessionNo: "asc" } } } });
    const dmgCopy = dmg.copies.find((c) => c.status === "AVAILABLE");
    if (dmgCopy) {
      await issue(await member(`S:${pickStudents[41].studentId}`), { ...dmgCopy, book: dmg }, 12, null);
      await markLostOrDamaged(tx, ctx, { copyId: dmgCopy.id, kind: "DAMAGED", chargePaise: BigInt(15000), note: "Cover torn and pages wet", today: t0 });
    }
    // One fine already waived, with its reason.
    const waive = await tx.libraryFine.findFirst({ where: { status: "DUE", reason: "LATE", staffId: null }, orderBy: { createdAt: "asc" } });
    if (waive) await waiveFine(tx, ctx, waive.id, "The child was unwell and absent that week");
  }, { timeout: 300_000 });

  // A stock check last month: most shelves scanned, a few copies missing.
  await withSchool(ctx, async (tx: Tx) => {
    const session = await startSession(tx, ctx, "Term 1 stock check");
    const shelf = await tx.bookCopy.findMany({ where: { status: { in: ["AVAILABLE", "RESERVED", "DAMAGED"] } }, select: { accessionNo: true }, orderBy: { accessionNo: "asc" } });
    for (const [i, c] of shelf.entries()) if (i % 61 !== 7) await scanCode(tx, ctx, session.id, c.accessionNo);
    await scanCode(tx, ctx, session.id, "OLD-0042");
    await closeSession(tx, ctx, session.id);
    const when = addDays(t0, -35);
    await tx.stockCheckSession.update({ where: { id: session.id }, data: { startedAt: when, closedAt: new Date(when.getTime() + 6 * 3_600_000) } });
  }, { timeout: 300_000 });
}
