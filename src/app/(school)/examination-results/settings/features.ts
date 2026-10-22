/** The features Exam Settings may switch on and off for the school, with plain words. */
export const EXAM_FEATURES = ["exam-seating", "exam-question-papers", "exam-co-scholastic", "exam-competencies", "exam-boards", "exam-remark-suggestions"] as const;

export const FEATURE_WORDS: Record<(typeof EXAM_FEATURES)[number], { title: string; sub: string }> = {
  "exam-seating": { title: "Seating plans", sub: "Seat students room by room for each paper" },
  "exam-question-papers": { title: "Question Papers", sub: "A question bank and papers made from it" },
  "exam-co-scholastic": { title: "Co-scholastic grades", sub: "Areas such as Art and Discipline on report cards" },
  "exam-competencies": { title: "Competency-based assessment", sub: "Competencies per subject with levels" },
  "exam-boards": { title: "Different boards", sub: "A grade scale and report card format for each board" },
  "exam-remark-suggestions": { title: "Remark suggestions", sub: "Suggested report card remarks from each student's own marks, attendance and homework, for the class teacher to check. No AI needed" },
};
