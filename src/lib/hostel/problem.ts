// A Hostel rule said no. The message is in plain words: what happened, why,
// and what to do. It may name the field it is about, and a link to recover.
export class HostelProblem extends Error {
  constructor(message: string, public field?: string, public link?: { href: string; label: string }) {
    super(message);
    this.name = "HostelProblem";
  }
}
