// A rule of Fee or Finance Management stopped an action. The message is in
// plain words (what happened, why, what to do) and may name the field.
export class MoneyProblem extends Error {
  constructor(message: string, public field?: string, public link?: { href: string; label: string }, public warning = false) {
    super(message);
    this.name = "MoneyProblem";
  }
}

/** A likely mistake the person may confirm and go ahead with (duplicate payment or bill). */
export class MoneyWarning extends MoneyProblem {
  constructor(message: string, field?: string, link?: { href: string; label: string }) {
    super(message, field, link, true);
    this.name = "MoneyWarning";
  }
}
