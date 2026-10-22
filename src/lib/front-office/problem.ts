// A Front Office rule said no. The message is in plain words: what happened,
// why, and what to do. It may name the field it is about.
export class FrontOfficeProblem extends Error {
  constructor(message: string, public field?: string, public link?: { href: string; label: string }) {
    super(message);
    this.name = "FrontOfficeProblem";
  }
}

/**
 * A refusal whose record must stay, such as a wrong pickup code that is counted
 * and written to the audit log. The work returns it instead of throwing, so what
 * it wrote is saved; the action then answers with the message, like a problem.
 */
export class KeptRefusal {
  constructor(readonly message: string, readonly field?: string) {}
}
