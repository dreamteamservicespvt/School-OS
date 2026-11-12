// Add book shows every problem at once (layman test LE6): a missing author, a bad
// ISBN and an accession number already in use come back together, each next to
// its field, instead of the next one only after the next try.
import { beforeAll, describe, expect, it } from "vitest";
import { ISBN_INVALID } from "@/lib/library/isbn";
import { LibraryProblem, Problems } from "@/lib/library/problem";
import { addTestBook, makeLibrarySchool, type LibFixture } from "./fixture";

describe("the problems of a form", () => {
  it("are kept per field, the first one for each field", () => {
    const p = new Problems();
    expect(p.take(() => { throw new LibraryProblem("Title is needed.", "title"); })).toBeNull();
    p.add("title", "Another title problem.");
    p.add("isbn", ISBN_INVALID);
    expect(p.take(() => 5)).toBe(5);
    expect(() => p.done()).toThrow("Please fix 2 things before saving.");
    try { p.done(); } catch (e) { expect((e as LibraryProblem).errors).toEqual({ title: "Title is needed.", isbn: ISBN_INVALID }); }
  });

  it("stop at once for a problem that names no field", () => {
    const p = new Problems();
    expect(() => p.take(() => { throw new LibraryProblem("Your role cannot add books."); })).toThrow("Your role cannot add books.");
  });

  it("say a single problem as it is, next to its field", () => {
    const p = new Problems();
    p.add("isbn", ISBN_INVALID);
    expect(() => p.done()).toThrow(ISBN_INVALID);
  });
});

describe("Add book", () => {
  let f: LibFixture;
  beforeAll(async () => {
    f = await makeLibrarySchool("LE6 Library School");
    await addTestBook(f, "First book", 1, { accessions: ["00392"] });
  });

  it("names the author, the ISBN and the accession number in one go", async () => {
    const e = await addTestBook(f, "Second book", 1, { authors: [], isbn: "978-0-306-40615-8", accessions: ["00392"] }).catch((x) => x);
    expect(e).toBeInstanceOf(LibraryProblem);
    expect(e.message).toBe("Please fix 3 things before saving.");
    expect(Object.keys(e.errors).sort()).toEqual(["accessions", "authors", "isbn"]);
    expect(e.errors.isbn).toBe(ISBN_INVALID);
    expect(e.errors.accessions).toMatch(/00392/);
  });

  it("still adds a book with nothing wrong", async () => {
    const { book, copies } = await addTestBook(f, "Third book", 1, { accessions: ["00393"] });
    expect(book.title).toBe("Third book");
    expect(copies.map((c) => c.accessionNo)).toEqual(["00393"]);
  });
});
