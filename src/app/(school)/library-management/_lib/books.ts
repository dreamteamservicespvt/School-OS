// The catalogue list's filter, read from the page address, shared by the
// Books page and its export so the file has exactly the rows on screen.
import "server-only";

import type { Prisma } from "@prisma/client";
import { momentWhere, type DayRange } from "@/lib/periods";
import { catalogueWhere } from "@/lib/library/catalogue";

export type BooksFilter = { q: string; cat: string; subject: string; author: string; avail: boolean; range: DayRange | null };

export function readBooksFilter(get: (k: string) => string, range: DayRange | null): BooksFilter {
  return { q: get("q").trim().slice(0, 100), cat: /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|none)$/i.test(get("cat")) ? get("cat") : "", subject: get("subject").slice(0, 80), author: get("author").slice(0, 120), avail: get("avail") === "1", range };
}

export function booksWhere(f: BooksFilter, tz: string): Prisma.BookWhereInput {
  const base = catalogueWhere({ q: f.q, categoryId: f.cat || null, subject: f.subject || null, author: f.author || null, availableOnly: f.avail });
  return f.range ? { AND: [base, { createdAt: momentWhere(f.range, tz) }] } : base;
}
