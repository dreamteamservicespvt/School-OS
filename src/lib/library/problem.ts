// A Library rule said no. The message is in plain words: what happened, why,
// and what to do. It may name the field it is about, and a link to recover.
// With `errors`, it carries every field's problem at once (layman test LE6).
export class LibraryProblem extends Error {
  constructor(message: string, public field?: string, public link?: { href: string; label: string }, public errors?: Record<string, string>) {
    super(message);
    this.name = "LibraryProblem";
  }
}

/**
 * Collects the problems of a whole form, so the person sees every one together
 * instead of the next only after the next try (layman test LE6). A problem that
 * names no field is not collected: it stops the work at once, as before.
 */
export class Problems {
  readonly errors: Record<string, string> = {};
  private link?: { href: string; label: string };

  add(field: string, message: string, link?: { href: string; label: string }) {
    if (!this.errors[field]) this.errors[field] = message;
    this.link ??= link;
  }

  private keep(e: unknown) {
    if (e instanceof LibraryProblem && e.field) {
      if (e.errors) for (const [f, m] of Object.entries(e.errors)) this.add(f, m);
      else this.add(e.field, e.message, e.link);
      return;
    }
    if (e instanceof LibraryProblem && e.errors) {
      for (const [f, m] of Object.entries(e.errors)) this.add(f, m, e.link);
      return;
    }
    throw e;
  }

  /** Reads one field; its problem is kept and null comes back. */
  take<T>(read: () => T): T | null {
    try {
      return read();
    } catch (e) {
      this.keep(e);
      return null;
    }
  }

  /** Runs one check that may look in the database; its problem is kept. */
  async check<T>(run: () => Promise<T>): Promise<T | null> {
    try {
      return await run();
    } catch (e) {
      this.keep(e);
      return null;
    }
  }

  has(field: string) {
    return field in this.errors;
  }

  /** Stops with every problem found so far; does nothing when there is none. */
  done() {
    const fields = Object.keys(this.errors);
    if (!fields.length) return;
    if (fields.length === 1) throw new LibraryProblem(this.errors[fields[0]], fields[0], this.link);
    throw new LibraryProblem(`Please fix ${fields.length} things before saving.`, undefined, this.link, { ...this.errors });
  }
}
