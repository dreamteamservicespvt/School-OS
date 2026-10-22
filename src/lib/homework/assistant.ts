// The teacher assistant (17 §2, optional: schools using AI). It drafts
// homework from the class's syllabus (the next topic not yet done and what was
// taught this week) and feedback from the student's own work. It needs no
// outside service and never acts by itself: every draft is shown as a
// "Suggestion" that the teacher edits, uses or discards (Done when 9).
import "server-only";

import type { Tx } from "../db";
import { flatten, syllabusTree } from "../academic/syllabus";
import { HomeworkProblem } from "./access";
import { mayWork, type HomeworkScope } from "./scope";

export type Draft = { title: string; instructions: string; source: string };

/** A homework draft for a section and subject, from its syllabus. Null when there is nothing to draft from. */
export async function draftHomework(tx: Tx, s: HomeworkScope, sectionId: string, subjectId: string, today: Date, on: boolean): Promise<Draft | null> {
  if (!on) throw new HomeworkProblem("The teacher assistant is switched off. The School Admin switches it on in Settings, Modules On/Off.");
  if (!s.yearIds.length || !mayWork(s, { sectionId, subjectId })) return null;
  const section = await tx.section.findFirst({ where: { id: sectionId }, include: { schoolClass: { select: { name: true } } } });
  const subject = await tx.subject.findUnique({ where: { id: subjectId }, select: { name: true } });
  if (!section || !subject) return null;
  // The section's own year's syllabus (each campus has its own year).
  const tree = await syllabusTree(tx, section.academicYearId, section.classId, subjectId, sectionId, today);
  const flat = flatten(tree);
  const leaves = flat.filter((n) => n.children.length === 0);
  if (!leaves.length) return null;
  const taught = leaves.filter((n) => n.lastTaught).sort((a, b) => b.lastTaught!.getTime() - a.lastTaught!.getTime());
  const recent = taught[0];
  const next = leaves.find((n) => n.done === 0);
  const topic = recent ?? next;
  if (!topic) return null;
  const parent = flat.find((n) => n.children.some((c) => c.id === topic.id));
  const chapter = parent?.title ?? topic.title;
  const place = leaves.indexOf(topic) + 1;
  const isMaths = /math/i.test(subject.name);
  const isLang = /english|hindi|telugu|tamil|kannada|sanskrit|urdu|french|language/i.test(subject.name);
  const title = isMaths ? `${topic.title}: practice questions` : isLang ? `${topic.title}: reading and writing` : `${topic.title}: questions and a diagram`;
  const instructions = isMaths
    ? `Solve 8 questions on ${topic.title.toLowerCase()} from ${chapter}. Write each step: what you know, the working and the answer. Check each answer at the end. The last two questions are a little harder: try them after the others.`
    : isLang
      ? `Read ${topic.title} again. Write the meanings of 5 new words, and answer the questions at the end of the lesson in full sentences. Then write 5 lines in your own words about what you liked.`
      : `Read ${topic.title} in ${chapter} again. Answer the questions at the end of the lesson in your notebook. Draw and label one neat diagram from the lesson.`;
  return { title, instructions, source: `the ${section.schoolClass.name} ${subject.name} syllabus (${chapter}, topic ${place} of ${leaves.length})${recent ? ` and what ${section.name} was taught on ${recent.lastTaught!.toISOString().slice(0, 10).split("-").reverse().join("-")}` : ""}` };
}

/** A feedback draft for one student's work, from their score, the check and whether it was late. */
export function draftFeedback(input: { firstName: string; score: number | null; max: number; result: "COMPLETE" | "INCORRECT"; late: boolean; note: string | null }, on: boolean): Draft {
  if (!on) throw new HomeworkProblem("The teacher assistant is switched off. The School Admin switches it on in Settings, Modules On/Off.");
  const p = input.score === null ? null : (input.score / Math.max(1, input.max)) * 100;
  const parts: string[] = [];
  if (input.result === "INCORRECT") parts.push(`${input.firstName}, some answers need another look. Go through the questions you got wrong, find the step where it went off, and try them again.`);
  else if (p === null) parts.push(`${input.firstName}, your work is complete. Well done for finishing it on your own.`);
  else if (p >= 85) parts.push(`${input.firstName}, excellent work: your answers are correct and neatly set out.`);
  else if (p >= 60) parts.push(`${input.firstName}, good work. Most answers are right; check your working in the ones you lost marks on.`);
  else parts.push(`${input.firstName}, you have made a start. Read the lesson again and practise similar questions before the next class.`);
  if (input.note?.trim()) parts.push("Thank you for your note. We will go over it together in class.");
  if (input.late) parts.push("Try to hand in by the due date next time.");
  return { title: "Feedback draft", instructions: parts.join(" "), source: `the score${input.score !== null ? ` (${input.score} of ${input.max})` : ""}, the check${input.late ? ", the late hand-in" : ""}${input.note ? " and the student's note" : ""}` };
}
