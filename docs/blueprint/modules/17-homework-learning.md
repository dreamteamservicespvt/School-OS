# 17 Homework & Learning

Build order: 12th (Stage 3). Needs classes, subjects and Teacher Allocation.

## 1. Purpose

Homework, study material and online classes.

Used by: teachers (set and check homework, materials, quizzes, online classes), class teachers and the Academic Head (progress and reports), students with logins (optional: see and submit homework, take quizzes, join classes), and parents indirectly by message (parents have no password login or app; their Parent Link in 11 Communication does not show homework yet).

## 2. Pages

### Homework

**Purpose:** give homework to a class, section or chosen students in three taps, with attachments and due date.

**What the person sees**

- Homework list as cards or rows: title, class and section, subject, assigned and submitted counts ("14 assigned, 3 submitted"), start and due date, status (**Current**, **Past due**, **Closed**; inferred), and **Seen by parent** ("Seen by 31 of 40") when the homework message to parents is on (decided 9 October 2026).
- Filters: class, subject, date range, status. Tabs: **Current** and **History**.
- Homework details page: instructions, attachments, who it was given to, submission progress, and buttons to check work.
- **Seen by parent** on the details page (decided 9 October 2026): each student with the date and time a parent first saw the homework, or "Not seen". It is counted from WhatsApp read receipts of the homework message and from Parent Link opens (Parent Link opens count once Parent Link shows homework). Teachers know who saw it before blaming the child.
- **Student home (optional, schools giving students logins):** students see their homework, quizzes and online classes.

**Actions**

- **Set homework in three taps on a phone** (inferred taps): 1) pick the class (only the teacher's classes with students are offered), 2) type the title and instructions or attach a photo of the board, 3) send (due date defaults to the next day the subject is taught).
- Choose a whole class, a section, or chosen students.
- Attach files, photos or links.
- **AI teacher assistant (optional):** "Draft with AI" suggests homework, a worksheet or a quiz from the topic, and drafts lesson plans (in Syllabus & Lesson Plans), feedback to students, and report-card remarks (in Report Cards). Drafts are labelled "Suggestion" and the teacher edits and accepts them.
- Edit or archive homework (with Undo).
- **Resend to parents who have not seen it:** one tap from Seen by parent, by the same or another channel, with the usual preview of count and cost (Resend to unread, 11 Communication) (decided 9 October 2026).
- Students are notified when homework is set (app notification for student logins); parents get a message when the school switches on the homework message rule (Communication, Message Settings).

**Form fields: Set homework**

| Field | Required | Default | Notes |
|---|---|---|---|
| Class and section | Yes | The teacher's current or next class from the Time Table (inferred) | Only classes with students; "Sorry, no students" never appears |
| Subject | Yes | The teacher's subject for that class | |
| Title | Yes | | |
| Instructions | No | | Text or photo |
| Attachments | No | | Files, photos, links |
| Given to | Yes | Whole section | Section, whole class, or chosen students |
| Start date | Yes | Today | |
| Due date | Yes | Next day the subject is taught (inferred) | |
| Maximum marks | No | 100 | Each homework has its own maximum |
| Online submission | No | On when students have logins | |

### Submissions & Grading

**Purpose:** see who submitted, mark it complete or incorrect, give a score and feedback.

**What the person sees**

- For one homework: a table of students with admission number, submission (submitted on time, late, not submitted), status, score or grade, actions. Counter of selected rows.
- One student's work: the homework details, what they submitted (files or text), the grade box (score out of the homework's maximum, grade, feedback), and a discussion thread (optional).
- Statuses: **Assigned**, **Submitted**, **Late**, **Graded**, **Missing** (and the teacher's marking: Complete, Incorrect; inferred mapping from the old Pending, Complete, Incorrect, Cancelled).

**Actions**

- **Students submit online** (optional): before the due date; after it the submission is marked late.
- **Resubmission** when the teacher allows it for that student.
- **Review:** open each submission; mark Complete or Incorrect; give a score (out of the homework's own maximum), a grade and feedback.
- **Bulk update:** select students and set the status (for example all present students Complete for work checked in class); edit or archive selected (P11).
- Students see the teacher's feedback (optional, student logins).
- **Discussion (optional):** comments between the teacher and the student on the homework.
- Students not submitted by the due date become Missing; the pending-homework message to parents goes if switched on (Message Settings).

**Form fields: Grade**

| Field | Required | Default | Notes |
|---|---|---|---|
| Status | Yes | Complete | Complete or Incorrect |
| Score | No | | 0 to the homework's maximum |
| Grade | No | Worked out from the score if the school uses grades (inferred) | |
| Feedback | No | | AI draft optional |

### Study Material

*Optional page: for schools using digital learning.*

**Purpose:** notes, documents, videos and lessons for each class and subject.

**What the person sees**

- A **course workspace** per class and subject: lessons in order (learning path), each with notes, documents, videos and links.
- Who has opened each lesson (for student logins).

**Actions**

- Add a lesson; upload notes, documents and videos, or add video links; reorder lessons.
- Copy a course to another section or year (inferred).
- Publish or hide a lesson.

**Form fields: Lesson**

| Field | Required | Default | Notes |
|---|---|---|---|
| Course (class and subject) | Yes | The teacher's own | |
| Lesson title | Yes | | |
| Chapter | No | | From the syllabus tree (inferred link) |
| Content | Yes | | Notes, files, video links |
| Visible to students | Yes | On | |

### Quizzes

*Optional page: for schools using digital learning.*

**Purpose:** quizzes that mark themselves, for practice and class tests.

**What the person sees**

- Quizzes list: title, class, subject, questions, time limit, attempts, average score, status (**Draft**, **Open**, **Closed**).
- Results per quiz: each student's score and answers.

**Actions**

- Create a quiz: questions with automatic marking (multiple choice, true or false; inferred: types that mark themselves); pick questions from the Question Papers bank when that page is on (inferred link).
- Set opening and closing time, time limit, attempts allowed, and whether answers are shown after.
- Students take the quiz in the app; marks are worked out automatically.
- Essay or short answers, if added, are marked by the teacher (from the old permission "grade essay and short answer questions").

**Form fields:** title, class and section, subject, questions, opens and closes (default: now to 7 days, inferred), time limit (default none), attempts (default 1).

### Discussions

*Optional page: for schools using digital learning.*

**Purpose:** class discussion boards for questions and answers.

**What the person sees**

- Boards (for example per class and subject): title, number of topics and posts.
- Topics in a board, and the replies.

**Actions**

- Create a board: title, type, description, which roles can use it (staff, students), visible or not, active or not. (Technical fields such as icon classes or linked IDs are not shown.)
- Post a topic or reply.
- Moderate: pin, lock, or hide a post (hidden, not deleted).

**Form fields: Board**

| Field | Required | Default | Notes |
|---|---|---|---|
| Title | Yes | | |
| Class and subject | No | | (inferred) |
| Description | No | | |
| Who can use it | Yes | All roles | Staff, students |
| Active | Yes | On | |

### Online Classes

*Optional page: for schools running online classes.*

**Purpose:** online class schedule, meeting link, attendance and recordings.

**What the person sees**

- Schedule: date, time, class, subject, teacher, meeting link, status (**Scheduled**, **Live**, **Done**, **Cancelled**).
- One session: link, who joined (online class attendance), materials shared, recording.

**Actions**

- Schedule a session (single or repeating weekly, inferred), with a meeting link (pasted, or made with the connected Google or Microsoft account; integration in Settings, Modules On/Off).
- Students and staff get a reminder before the start (inferred).
- Record attendance (from the meeting tool if connected, or marked by the teacher).
- Share materials in the session; add the recording link after.

**Form fields: Online class**

| Field | Required | Default | Notes |
|---|---|---|---|
| Class and section | Yes | | |
| Subject | Yes | | |
| Date and time | Yes | | |
| Length | Yes | 40 minutes (inferred) | |
| Meeting link | Yes | Made automatically if connected | |
| Repeat | No | Off | |

### Learning Progress

**Purpose:** homework done, quiz scores and progress for each student, plus course certificates.

**What the person sees**

- Per class: homework completion rate per student, average homework score, quizzes taken and average, lessons completed (optional).
- Per student: the same, over time.
- **Learning analytics (optional):** which lessons and quizzes students struggle with.
- **Course certificates:** certificates for finishing a course or learning path (design from Settings, Document Designs).

**Actions:** filter (class, subject, date range); open the records behind a number; issue course certificates; export homework reports (P8).

**Form fields:** none (filters only).

### Homework Settings

**Purpose:** submission rules, late marking, grading and who can see which course. See section 6.

## 3. All features

31 features are mapped to this module: 13 Core and 18 Optional. Tick each one when it is built and tested.

### Homework (11)

- [ ] Create homework / assignment: subject, class, title, instructions, due date (Core)
- [ ] Homework attachments (Core)
- [ ] Assign homework to a class, section or chosen students (Core)
- [ ] Students notified when homework is set (Core) · automatic
- [ ] Homework list with filters (class, subject, date, status) (Core)
- [ ] Homework cards view (Core)
- [ ] Homework details page (Core)
- [ ] Set homework in three taps on mobile (Core)
- [ ] "Seen by parent" with date and time on the homework list and one homework, from WhatsApp read receipts and Parent Link opens, with resend to those who have not seen it (Core) (decided 9 October 2026)
- [ ] Teacher assistant: drafts lesson plans, worksheets, quizzes, homework, student feedback and report-card remarks (Optional: schools using AI) · drafts appear as suggestions in Homework, Syllabus & Lesson Plans, Question Papers and Report Cards
- [ ] Student app / student home (Optional: schools giving students logins) · students who have logins see their homework, quizzes and classes

### Submissions & Grading (7)

- [ ] Student submits homework online (before due date; late marked) (Optional: schools using online submission)
- [ ] Resubmission when the teacher allows it (Optional: schools using online submission)
- [ ] Teacher reviews submissions (Core)
- [ ] Grade homework: score, grade, feedback (Core)
- [ ] Homework status: assigned, submitted, late, graded, missing (Core)
- [ ] Student sees teacher feedback (Optional: schools using online submission)
- [ ] Homework discussion thread (Optional: schools allowing discussion)

### Study Material (2)

- [ ] Course workspace per class and subject (Optional: schools using digital learning)
- [ ] Lessons with notes, documents and videos (study material) (Optional: schools using digital learning)

### Quizzes (1)

- [ ] Quizzes with automatic marking (Optional: schools using digital learning)

### Discussions (1)

- [ ] Course discussions (Optional: schools using digital learning)

### Online Classes (5)

- [ ] Online class sessions and schedules (Optional: schools running online classes)
- [ ] Meeting links (Optional: schools running online classes)
- [ ] Online class attendance (Optional: schools running online classes)
- [ ] Class materials shared in the session (Optional: schools running online classes)
- [ ] Class recordings (Optional: schools running online classes)

### Learning Progress (3)

- [ ] Homework reports (Core)
- [ ] Learning progress per student (Optional: schools using digital learning)
- [ ] Learning analytics (Optional: schools using digital learning)

### Homework Settings (1)

- [ ] Course access rules by class and role (Optional: schools using digital learning)

## 4. Connections

**Receives**

| From | What |
|---|---|
| 04 Academic | Classes, sections, subjects, Teacher Allocation, Time Table (default due dates); syllabus chapters |
| 03 Student Management | Students per section; student logins (optional) |
| 08 Examination & Results | Question bank for quizzes (optional) |
| 20 Settings | Google or Microsoft accounts and outside learning platforms; AI on or off |
| 11 Communication | For Seen by parent: WhatsApp read receipts of homework messages and Parent Link opens, per guardian with date and time (decided 9 October 2026) |

**Sends**

| To | What |
|---|---|
| 11 Communication | Homework set and pending-homework messages to parents (rules in Message Settings) |
| Notifications | Homework set (students with logins), submissions to check (teachers) |
| 01 Dashboard | Teacher to-do: homework to check |
| 03 Student Management | Homework tab on the profile |
| 04 Academic, 08 Exams | AI teacher assistant drafts for lesson plans, question papers and report-card remarks |
| 19 Reports & Analytics | Homework and learning reports |

**Automations:** none owned. Homework messages to parents run as automatic message rules in Communication.

## 5. Rules and mistake-proofing

| Rule | How it is prevented | What the person is told | How they recover |
|---|---|---|---|
| Homework for a class with no students | Such classes are not offered (instead of the old "Sorry! no students" error) | Not shown | Add students first |
| Teacher sets homework for a class they do not teach | Only own classes and subjects offered | Not shown | Ask the Academic Head |
| Due date before start date | Blocked | "Due date is before the start date" | Fix the date |
| Score above the maximum | Score must be 0 to the homework's own maximum | "Out of 20. 25 is too high." | Correct |
| Late submission | Marked late automatically after the due time | Shown on the submission | Teacher can accept |
| Bulk status change by mistake | Preview and Undo (P5, P11) | "Mark 32 students Complete?" | Undo |
| Discussion posts removed silently | Moderation hides posts with a reason; nothing is deleted | "Hidden by the teacher" | Unhide |
| AI drafts used as is | Labelled "Suggestion"; teacher must accept | "Suggestion" | Edit or reject |
| Students seeing other courses | Course access rules by class and role | Not shown | Change access rules |

## 6. Settings

The **Homework Settings** page holds:

- **Submission rules:** online submission on or off; allowed file types and size (inferred); resubmission allowed by default or per student.
- **Late marking:** when a submission counts as late (after the due date, or after a grace time, inferred).
- **Grading:** scores, grades or both; default maximum marks (100); grade bands for homework (inferred: may reuse the exam grade scale).
- **Course access rules** by class and role (optional, digital learning).
- **Display:** cards or list view by default, and which details show on cards (from the old settings "card display and listing design").
- **Homework messages to parents:** shown here, set in Communication, Message Settings.
- **Optional pages on or off:** Study Material, Quizzes, Discussions, Online Classes (inferred placement).
- **AI teacher assistant** on or off is in Settings, Modules On/Off.

## 7. Reports

- Homework reports: homework set per teacher, class and subject; submission and completion rates; missing work by student.
- Quiz results (optional).
- Online class attendance (optional).
- Learning progress and learning analytics per student and class (optional).
- Course certificates issued.

All follow P8 and appear in Reports & Analytics.

## 8. Records used

| Record | Creates | Reads | Updates |
|---|---|---|---|
| Homework | Yes | Yes | Yes (edit, archive) |
| Submission | Yes (online submissions; teacher marking) | Yes | Yes (status, score, feedback) |
| Student, Class, Section, Subject, Teacher Allocation, Timetable Period | | Yes | |
| User Login | | Yes (student logins) | |
| Message, Notification | Yes | | |
| Audit Log Entry | Yes | | |

Other records (inferred): **Homework Attachment**, **Homework Comment** (discussion), **Course** and **Lesson** (study material and learning path), **Lesson View**, **Quiz**, **Quiz Question**, **Quiz Attempt**, **Discussion Board**, **Discussion Post**, **Online Class Session** with **Online Class Attendance**, **Course Certificate**.

## 9. Done when

1. A teacher on a phone sets homework for their class in three taps; the due date fills with the next day the subject is taught.
2. Classes with no students are never offered when setting homework.
3. The homework card shows "assigned" and "submitted" counts that match the submissions table.
4. A teacher marks 30 students Complete in one bulk action with a preview, and can undo it.
5. A score above the homework's own maximum is refused.
6. With student logins on, a student submits work before the due date, and a submission after it is marked late.
7. With the pending-homework rule on, parents of students with missing work get one message.
8. With Quizzes on, a quiz marks itself and the score appears in Learning Progress.
9. AI drafts appear only when AI is switched on, and always carry the "Suggestion" label.
10. After a homework message to 40 parents, the homework shows "Seen by 31 of 40" with each parent's date and time, and Resend reaches only the 9 who have not seen it (decided 9 October 2026).

## 10. Open questions

- What exactly are the "three taps" for setting homework? This spec assumes: class, content, send, with smart defaults for the rest.
- Should the old status "Cancelled" be kept for a student excused from a homework? Assumed: yes, as "Excused" (inferred), not counted as missing.
- Which meeting tools should online classes connect to first (Google Meet, Microsoft Teams, Zoom)? The inputs mention Google and Microsoft accounts.
