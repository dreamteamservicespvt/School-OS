// An Events & Calendar rule said no. The message is in plain words: what
// happened, why, and what to do. It may name the field it is about.
export class EventsProblem extends Error {
  constructor(message: string, public field?: string, public link?: { href: string; label: string }) {
    super(message);
    this.name = "EventsProblem";
  }
}

/** A warning the person may accept ("Make it a holiday anyway?"): sent back with `confirm` to go ahead. */
export class EventsWarning extends EventsProblem {
  constructor(message: string, public confirmKey: string, field?: string) {
    super(message, field);
    this.name = "EventsWarning";
  }
}
