# 08 Examination & Results

Build order: 10th (Stage 2, first sellable version; decided 9 October 2026, D5). Needs subjects and subject teachers (Academic), students, and attendance for the report card. The Dashboard is built right after it.

## 1. Purpose

Exams from the Datesheet to the report card.

Used by: the Exam In-charge or Academic Head role templates when the school switches them on, otherwise the Principal (datesheets, admit cards, results, report cards, settings), the Office Staff role template (preparing datesheets and printing admit cards), subject teachers (marks entry for their subjects), class teachers (remarks, report cards of their section), and the Principal (moderation approvals, result publishing, principal remarks).

## 2. Pages

### Datesheet

**Purpose:** create an exam and its subject-wise dates, times, rooms, invigilators and seating. Creating a datesheet creates the exam.

**What the person sees**

- List of datesheets as cards: exam title, class(es), year, from and to dates, number of students and subjects, status (**Draft**, **Published**, **Ongoing**, **Completed**, **Results published**; inferred names from the old "Ongoing" ribbon).
- Filters: exam title search, class, from and to date, status. Count "Showing 1 to 11 of 11".

**Actions**

- **Add datesheet:** first choose **Single class** ("pick one class and fill the schedule") or **Multiple classes** ("same schedule for several classes at once"), then the class or classes.
- Fill the exam details and the subject schedule (see fields). **Bulk apply** sets one value for all subjects: start time, duration, location, maximum marks; each Apply button changes only its own column.
- Save as draft. After saving, **Configure mark categories** for each subject becomes available (for example theory 80, internal 20).
- **Rooms and invigilators:** assign an exam room and an invigilator to each paper; clashes (a room or an invigilator used twice at the same time) are blocked.
- **Seating arrangement (optional):** generate seat numbers per room by roll number, mixing classes if chosen (inferred: the mixing option), and print seating charts.
- **Publish** the datesheet (automation A10). Once published, parents see it on Parent Link (owned by Communication, decided 9 October 2026, D4).
- View, print, edit (until results are uploaded), archive.

**Form fields: Exam details**

| Field | Required | Default | Notes |
|---|---|---|---|
| Title | Yes | | For example "FA 1", "Half Yearly" |
| Exam type | Yes | | From Exam Settings (for example Unit Test 1, FA 1, SA 1, Half Yearly, Annual) |
| Exam pattern | Yes | The class's default pattern | Percentage, Grading, CGPA |
| Term | Yes | Current term (inferred) | |
| Start date | Yes | Today | |
| End date | Yes | 15 days after the start date (as in the old software) | |

**Form fields: Subject schedule** (one row per subject of the class)

| Column | Required | Default | Notes |
|---|---|---|---|
| Exam date | No | Empty | An empty date leaves the subject out of the saved datesheet |
| Start time | Yes if dated | From Bulk apply | |
| Duration | Yes if dated | From Bulk apply, for example 3 hours | End time is shown, worked out from start time and duration |
| Location (room) | No | The class name | |
| Teacher (invigilator) | No | The subject teacher | |
| Maximum marks | Yes if dated | From Bulk apply | |
| Pattern | No | The exam's pattern | Override for this subject only |

Rules shown on the form ("Before you save"): subjects are listed by date and time; an empty exam date leaves the subject out; the pattern can be changed for one subject; mark categories are configured after saving; once results are uploaded, changes are restricted.

### Admit Cards

**Purpose:** print admit cards for a whole class or one student.

**What the person sees**

- Exams with a published schedule, as cards: exam, class, start, end, number of subjects, status ribbon.
- Preview: exam information (exam, class, type, total students), then one admit card per student: school logo and name, "Examination admit card", exam name, year and term, student name, roll number, photo, father's and mother's name, class, admission number; a subject table with number, subject (with the theory, practical and internal assessment split under it), date, day, time, maximum marks and invigilator; instructions for candidates; signature lines (student, class teacher, and the school's chosen signatory). Design from Settings, Document Designs.

**Actions**

- Preview and download for a whole class, printing in batches of up to 50.
- Single student admit card (search the student).
- Students without a photo are listed before printing, with "Print anyway" (inferred).
- Admit cards can be held back for students with fee dues only if the school switches that on (see open questions).

**Form fields:** exam, class (or student).

### Marks Entry

**Purpose:** teachers enter marks or grades subject by subject, on phone or computer.

**What the person sees**

- The teacher's own papers to mark: exam, class and section, subject, due date for marks (inferred), progress ("32 of 40 entered"), status (**Not started**, **In progress**, **Submitted**, **Locked**; inferred).
- **Marks grid:** students in roll order down the side; mark categories across (for example Theory / 80, Internal / 20); total worked out. Grade-only subjects show a grade picker instead of marks. An **Absent** tick per student.
- On a phone: one student at a time with large number keys and "Next", or a compact grid with the number pad (fast marks grid).

**Actions**

- Enter marks (each saved as typed; works offline when that option is on).
- Mark absent (no marks needed; counts as absent, not zero, in results, inferred).
- **Submit** the subject when complete. After submitting, the teacher cannot change marks.
- **Moderation:** after submission, a controlled change needs a reason and approval (Approvals); the change history (old mark, new mark, who, why) is kept.
- **Late joiners** (gap list G23): a student who joined after the paper's marks were submitted shows "Joined late" with no marks. If Exam Settings allows late marks (the default), the subject teacher adds their marks with a reason; they apply only once approved in Approvals, like a moderation. A student who changes section keeps the marks they already have; the new section's teacher enters only the rest.
- Import marks from Excel (P10) (inferred: for teachers who prefer sheets).

**Form fields:** mark per category per student (between 0 and the maximum), or grade (from the subject's grade list), absent tick, remark per student (optional, inferred).

### Results

**Purpose:** total, percentage, grade and rank worked out automatically, final result across exams, published on a set date.

**What the person sees**

- Per exam and class: each student's marks per subject, total, average, percentage, grade, rank (optional), pass or fail, worked out as soon as marks are entered (automation A9).
- **Final result:** combines all exams of the year using the weights in Exam Settings (for example Term 1 40% and Term 2 60%), with the final grade and result (pass, fail, or the school's own result types such as "compartment", inferred). An exam a late joiner missed is left out (the exams they sat count in its place) or counted as 0%, by the school's rule in Exam Settings.
- Status of each result: **Draft** or **Published**, with the publish date.
- Missing marks are highlighted ("Science marks not submitted for 7 B").
- **Joined after this exam** (gap list G23): a student who joined the section after the exam's marks were in is shown so, is left out of that exam and does not stop the results being published. When late marks complete their result, it is published on its own ("Published, except 1 result added later"); only their parents are told, and the other students' published results do not change. The final result waits for it.
- A student who changes section takes their marks, draft results and report cards with them. A result already published stays with the section it was published in, unchanged (rank included), and shows in the new section too.

**Actions**

- View and print results (class result sheet, one student's result).
- **Set a publish date and time** for a result; it publishes then by itself, or "Publish now". Drafts with missing marks cannot be published.
- When a result is published: report cards are ready, parents are told by message (A9), the report card appears on each guardian's Parent Link for download, and the result is kept in the result history.
- Unpublish (only by permitted people, with a reason; parents are not messaged again, and the report card is taken off Parent Link until it is published again) (inferred).

**Form fields: Publish result**

| Field | Required | Default | Notes |
|---|---|---|---|
| Exam and classes | Yes | The open result | |
| Publish on | Yes | Now | Date and time |
| Message parents | Yes | On | Uses the "result published" template |

### Report Cards

**Purpose:** board-style report cards with marks, grades, attendance, co-scholastic grades and remarks.

**What the person sees**

- Per class and term: report card status per student (**Not ready**, **Ready**, **Printed**, **Sent**, inferred), missing items (marks, remarks, co-scholastic grades).
- Preview of each report card from the template for the class's board (each class follows the school's board unless Academic Management sets its own board for that class) (PDF).

**Actions**

- Enter **class teacher remarks** and **principal remarks** for each student (bulk entry grid). With the AI teacher assistant on, "Draft remarks" suggests a remark per student from their marks and attendance, labelled "Suggestion"; the teacher edits and accepts each one. The suggestion is built only from that student's own records (gap list G30): the period's marks and the change in each subject since the exam before, attendance, homework handed in and co-scholastic grades, in words for the period (this exam, this term or this year), and each sentence shows its source. A student with no marks for the period (absent, medical leave, or joined after the exam) gets no suggestion: "No marks for this exam: write your own remark." The teacher keeps, edits or discards each one; a kept remark is logged "prepared by AI, confirmed by <person>".
- Enter co-scholastic grades, skills, activities and competencies (or they come from Events & Calendar and Exam Settings areas).
- Generate report cards for a class as one PDF, print in batches (P9), or send each to the parent's WhatsApp (inferred: send as PDF).

**Report card contents:** student details; marks and grades per subject and exam; attendance (days present of working days, from Attendance); co-scholastic grades; skills, activities and competencies; final result; class teacher and principal remarks; signatures.

### Question Papers

*Optional page: for schools setting their own papers.*

**Purpose:** question bank by chapter and difficulty, and papers made from it.

**What the person sees**

- Question bank: question text, type (MCQ, short, long, true or false, fill in the blanks, match), class, subject, chapter (from the syllabus tree), difficulty (easy, medium, hard), marks, answer key, used in which papers.
- Papers: title, exam, class, subject, total marks, status (Draft, Final, inferred).

**Actions**

- Add, edit, import questions; tag them.
- Make a paper: **manually** (pick questions), **automatically** (from total marks and difficulty mix), or **from a blueprint** (chapter-wise marks and question types).
- Teachers build papers from the bank for their subjects.
- **AI (optional):** generate questions and papers, with answer key, a difficulty check and a duplicate check against the bank. Everything AI makes is labelled "Suggestion" and enters the bank only when a teacher accepts it.
- Print a paper with or without answers.

**Form fields: Add question**

| Field | Required | Default | Notes |
|---|---|---|---|
| Class and subject | Yes | Teacher's own | |
| Chapter | Yes | | From the syllabus tree |
| Type | Yes | Short | |
| Question | Yes | | |
| Options and correct answer | Yes for MCQ, true or false, match | | |
| Marks | Yes | 1 (inferred) | |
| Difficulty | Yes | Medium | |

### Exam Analysis

**Purpose:** subject-wise and class-wise results and each student's progress.

**What the person sees**

- Results overview: pass %, average, grade distribution, top and bottom students, by exam and class.
- Subject-wise: average and pass % per subject and section, teacher-wise (inferred).
- Class-wise: sections compared.
- Student progress: one student across exams and years, with a trend line.
- Each number opens the students behind it.

**Actions:** filter (exam, class, section, subject); export (P8).

### Exam Settings

**Purpose:** exam types, mark categories, grade scale (CBSE, ICSE or state board ready-made), pass rules and co-scholastic areas. See section 6.

## 3. All features

42 features are mapped to this module: 31 Core and 11 Optional. Tick each one when it is built and tested.

### Datesheet (8)

- [ ] Create an exam / term with name, academic year and dates (Core) · creating a datesheet creates the exam
- [ ] Datesheet: title, start / end date, exam type, pattern (Core)
- [ ] Per-subject schedule: date, start time, end time or duration, room, max marks (Core)
- [ ] Bulk-apply start time, duration and max marks to all subjects (Core)
- [ ] No overlapping exams for a class (Core)
- [ ] Publish the datesheet to the exam calendar (Core) · automatic, see 'Datesheet published'
- [ ] Assign exam rooms and invigilators without clashes (Core)
- [ ] Seating arrangement (Optional: larger schools)

### Admit Cards (1)

- [ ] Generate, preview and download admit cards (photo, subjects; published schedule only) (Core)

### Marks Entry (4)

- [ ] Enter marks by subject and student, with absent flag; marks between 0 and max (Core)
- [ ] Grade entry for grade-only subjects (Core)
- [ ] Fast marks grid on mobile (Core)
- [ ] Moderation: controlled mark change with reason, approval and change history (Core)

### Results (7)

- [ ] Automatic total, average, percentage and grade using set weights (Core)
- [ ] Rank with a tie rule (Optional: schools that rank students)
- [ ] Final result combining all exams (Core)
- [ ] View and print results (Core)
- [ ] Result history kept (Core)
- [ ] Publish results on a date (drafts cannot be published) (Core)
- [ ] Exam reminders and result-published messages to parents (Core) · automatic, see 'Marks entered'

### Report Cards (4)

- [ ] Report card from a configurable template (format per board / school), as PDF (Core)
- [ ] Report card content: grades, attendance, skills, activities, competencies (Core)
- [ ] Principal and teacher remarks (Core)
- [ ] Published datesheet, and report cards once results are published, shown to parents on Parent Link (Core) · page owned by 11 Communication

### Question Papers (5)

- [ ] Question bank tagged by class, subject, chapter, difficulty, marks (Optional: schools setting their own papers)
- [ ] Question types: MCQ, short, long, true / false, fill in the blanks, match (Optional: schools setting their own papers)
- [ ] Generate papers automatically, manually or from a blueprint (Optional: schools setting their own papers)
- [ ] Teachers build papers from the bank (Optional: schools setting their own papers)
- [ ] AI question and paper generation, answer key, difficulty check, duplicate check (Optional: schools using AI)

### Exam Analysis (2)

- [ ] Results overview: performance, analytics, progress tracking (Core)
- [ ] Subject-wise and class-wise performance analysis (Core)

### Exam Settings (11)

- [ ] Exam types, e.g. unit / periodic tests, FA 1-2, SA 1-2, mid-term / half-yearly, pre-final, annual / final, practical, internal assessment, plus custom (Core)
- [ ] Exam pattern per exam (Core)
- [ ] Mark categories / components: theory, internal, practical, assignment, attendance, project (Core)
- [ ] Exam settings and exam rules per school (Core)
- [ ] Co-scholastic areas and their grading (Optional: CBSE-style report cards)
- [ ] Competency-based assessment (Optional: competency-based boards)
- [ ] Grade scale: ranges, grade and remark (e.g. A+ 91-100%), no overlaps or gaps (Core)
- [ ] Pass marks / pass rules (Core)
- [ ] GPA (Optional: GPA-based boards and international schools)
- [ ] Changing a grade scale never changes results already published (Core)
- [ ] Grade scale and report card format chosen by each class's board (Optional: schools running two boards in one school)

## 4. Connections

**Receives**

| From | What |
|---|---|
| 04 Academic | Subjects per class, subject teachers (who may enter marks), syllabus chapters (question bank), each class's board (grading scale and report card format) |
| 03 Student Management | Students per section with roll numbers and photos |
| 05 Attendance | Attendance for report cards |
| 18 Events & Calendar | Co-curricular achievements and activities for report cards |
| 17 Homework & Learning | AI teacher assistant drafts (remarks, questions) |
| 20 Settings | Board (default grading and report format), document designs (admit card, report card, result) |

**Sends**

| To | What |
|---|---|
| 18 Events & Calendar | Exam dates in the School Calendar (A10) |
| 04 Academic | Exam days for the Time Table (A10) |
| 11 Communication | Exam reminders to parents (A10), result-published messages (A9); published datesheets and report cards for Parent Link |
| 03 Student Management | Marks, results and report cards on the profile; results for promotion |
| 01 Dashboard | Exam average, upcoming exams, weak classes |
| 19 Reports & Analytics | Results analytics; marks for early warnings |
| Top bar Approvals | Marks moderation |

**Automations owned**

- **A9 Marks entered:** total, percentage, grade and rank are worked out as marks are saved. On the publish date, report cards are ready and parents are told.
- **A10 Datesheet published:** exams appear in the School Calendar and the Time Table, admit cards become available, and reminders go to parents (default: the day before each paper, inferred).

## 5. Rules and mistake-proofing

| Rule | How it is prevented | What the person is told | How they recover |
|---|---|---|---|
| Two exams at the same time for a class | Save blocked on overlap | "7 A already has Maths at 10:00 AM on 31-07-2026" | Change the time |
| Room or invigilator used twice | Blocked | "Room 12 is used by 8 B at that time" | Choose another |
| Datesheet changed after results | Edits restricted once results are uploaded | "Results exist for this datesheet. Only the title can change." | Ask the Exam In-charge or the Principal |
| Marks out of range | Marks must be between 0 and the maximum for the category | "Theory is out of 80. 85 is too high." | Correct the mark |
| Absent student given marks | Absent and marks cannot both be set | "Ravi is marked absent. Remove absent to enter marks." | Untick absent |
| Teacher enters marks for a subject they do not teach | Only own subjects offered; server check | Not shown | Ask the Exam In-charge or the Principal |
| Marks changed after submission | Moderation only: reason, approval and history | "Marks are submitted. Request a change?" | Moderation request |
| Publishing incomplete results | Publish blocked while any marks are missing (drafts cannot be published) | "4 subjects have missing marks in 7 B" | Complete the marks |
| Grade scale with gaps or overlaps | Save blocked | "A2 ends at 90% but B1 starts at 71%" or "82% falls in two grades" | Fix the ranges |
| Grade scale changed after results | Published results keep the scale they were made with | "Published results will not change" | Not needed |
| Rank ties | Tie rule from Exam Settings (same rank, next rank skipped, by default, inferred) | Not needed | Not needed |
| Admit cards before the schedule is published | Admit cards only for published datesheets | "Publish the datesheet first" | Publish |
| AI questions or remarks wrong | Always suggestions; teacher must accept | "Suggestion" label | Edit or reject |

## 6. Settings

The **Exam Settings** page holds:

- **Exam types:** unit or periodic tests, FA 1 and 2, SA 1 and 2, mid-term or half-yearly, pre-final, annual or final, practical, internal assessment, plus the school's own.
- **Exam pattern** per exam: Percentage, Grading or CGPA, and the default per class.
- **Mark categories (components):** theory, internal, practical, assignment, attendance, project, plus the school's own; default split per subject (inferred).
- **Grade scale:** ranges with grade, minimum %, maximum %, points and remark, and whether each grade is passing (for example A1 91 to 100% Outstanding, 10 points). Ready-made presets: CBSE 9-point, ICSE, State Board, which the school can import and change. A scale preview shows the bands. No overlaps or gaps.
- **Pass rules:** pass marks per subject and overall, and rules for grace marks if the school uses them (inferred).
- **GPA** (optional, GPA-based boards and international schools): GPA and CGPA calculation. When on, report cards show the grade points per subject and the GPA (exam or term) or CGPA (year).
- **Late joiners** (gap list G23): whether marks are added for a student who joined after the marks were in (**Added with approval**, the default, through Approvals; or **Not added**, so the student stays "Joined after this exam"), and how an exam they missed counts in the final result (**Left out**, the default, or **Counted as 0%**).
- **Ranks** on or off, and the tie rule.
- **Weights** for the final result across exams (inferred: needed for "final result combining all exams").
- **Co-scholastic areas** and their grading (optional, CBSE-style report cards), such as work education, art, health and physical education.
- **Competency-based assessment** (optional): competencies per subject and their levels; added, changed and archived here, graded on report cards when switched on.
- **Exam rules per school:** who can publish results, marks submission deadlines, admit card signatory, instructions printed on admit cards (inferred items).
- Report card templates per board are chosen here and designed in Settings, Document Designs.
- **Per board (optional, schools running two boards):** a grade scale and a report card template for each board. A class uses the ones for its board, set in Academic Management, Classes & Sections (default: the school's board). Only boards the school's classes follow can be set; an empty choice means the school's scale or design. Changing it works out draft results again; published results do not change.

## 7. Reports

- Class result sheet (marks, totals, %, grade, rank) for an exam.
- Final result sheet for the year.
- Subject-wise and class-wise performance (pass %, average, distribution).
- Toppers and students needing help per class (inferred).
- Student progress across exams.
- Marks entry status: which papers are pending, by teacher.
- Moderation report: changes after submission with reasons.

All follow P8 and appear in Reports & Analytics.

## 8. Records used

| Record | Creates | Reads | Updates |
|---|---|---|---|
| Exam | Yes (created with the datesheet) | Yes | Yes (status) |
| Datesheet Entry | Yes | Yes | Yes (until results exist) |
| Marks | Yes | Yes | Yes (before submission; after, by moderation or approved late marks) |
| Grade Scale | Yes | Yes | Yes (versioned) |
| Report Card | Yes | Yes | Yes (remarks, status) |
| Student, Class, Section, Subject, Teacher Allocation, Term, Academic Year | | Yes | |
| Attendance Mark | | Yes (report card attendance) | |
| Calendar Entry | Yes (exam dates, A10) | | |
| Message, Template | Yes (reminders, results) | Yes | |
| Approval, Notification | Yes | Yes | |
| Audit Log Entry | Yes | | |

Other records (inferred): **Exam Type**, **Mark Category**, **Exam Room Allocation** and **Seat Allocation**, **Admit Card Print**, **Result** (per student per exam: total, %, grade, rank, published date) and **Final Result**, **Marks Moderation** (old, new, reason, approval; late marks for a student who joined late have no old value), **Co-scholastic Grade**, **Competency Level**, **Question** and **Question Paper**, **Pass Rule**.

## 9. Done when

1. Creating a datesheet for one class, using Bulk apply for start time, duration and maximum marks, takes under 3 minutes, and subjects with no date are left out.
2. Two papers at the same time for one class cannot be saved.
3. Publishing the datesheet shows the exams in the School Calendar and the Time Table, and admit cards become available.
4. Admit cards for a class of 35 print in one batch with photo, subjects, dates, times, maximum marks and the theory and practical split.
5. A teacher enters marks for 40 students on a phone using the number pad; a mark above the maximum is refused.
6. Totals, percentages and grades appear as marks are entered, using the grade scale.
7. A result with any missing marks cannot be published; publishing a complete result on a set date sends one message to each parent.
8. Changing a mark after submission needs a reason and approval, and the old and new marks stay in the history.
9. Changing the grade scale does not change any published result.
10. A report card PDF shows marks, grades, attendance, co-scholastic grades and both remarks, in the board's format.
11. After the datesheet is published, a guardian sees it on Parent Link; after the result is published, the report card is there to download, and not before.
12. In a school with State board classes 1 to 8 and CBSE classes 9 to 12, class 5 and class 10 report cards use their own board's grade scale and format.

## 10. Open questions

- Should admit cards be held back for students with fee dues? Many Indian schools do this, but the inputs do not mention it. Not built unless the owner asks.
- How should "absent" count in the total and percentage: as zero, or left out with a note? Assumed: shown as AB, counted as zero for the total, and the school can choose otherwise in pass rules.
- Should parents also receive the report card PDF on WhatsApp? Report cards are on Parent Link once published (decided 9 October 2026, D4); sending the PDF on WhatsApp as well is assumed as an option.
- D5 (decided 9 October 2026): Examination & Results is in Stage 2, the first sellable version, built 10th.
- What result types does the school need beyond pass and fail (for example compartment, promoted with grace)? To be set per board.
