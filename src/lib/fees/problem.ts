// A rule of Fee or Finance Management stopped an action. The message is in
// plain words (what happened, why, what to do) and may name the field.
export class MoneyProblem extends Error {
  /** A short key the screen can act on, e.g. "needs-approval" shows an "Ask for approval" button. */
  public code?: string;
  constructor(message: string, public field?: string, public link?: { href: string; label: string }, public warning = false) {
    super(message);
    this.name = "MoneyProblem";
  }
  withCode(code: string) {
    this.code = code;
    return this;
  }
}

/** A likely mistake the person may confirm and go ahead with (duplicate payment or bill). */
export class MoneyWarning extends MoneyProblem {
  constructor(message: string, field?: string, link?: { href: string; label: string }) {
    super(message, field, link, true);
    this.name = "MoneyWarning";
  }
}
