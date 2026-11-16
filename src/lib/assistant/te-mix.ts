// The assistant's everyday Telugu (owner, 16 Nov 2026): educated Telugu
// speakers talk Telugu with English school words in it ("ఈరోజు attendance
// ఇంకా తీసుకోలేదు"), so when the person talks like that the assistant answers
// like that, not in the bookish Telugu of the screens ("హాజరు ... గైర్హాజరుగా
// లెక్కించలేము"). These replace the Telugu screen words for Ask's answers in
// the assistant only; the screens keep src/lib/i18n/catalogues/te.ts.
// Blanks ({n}, {date}, {class}...) are the same as the English key's, and the
// test (tests/assistant/style.test.ts) proves it. Numbers, amounts and dates
// are filled in exactly, never written here.

export const TE_MIX: Readonly<Record<string, string>> = {
  // Labels and links
  "Whole school": "మొత్తం school",
  "All staff": "అందరు staff",
  "Your classes only": "మీ classes మాత్రమే",
  "Your classes and subjects only": "మీ classes, subjects మాత్రమే",
  "Your campus": "మీ campus",
  "Open the Dashboard": "Dashboard ఓపెన్ చేయండి",
  "Open Defaulters": "Defaulters list ఓపెన్ చేయండి",
  "Open Fee Reports": "Fee Reports ఓపెన్ చేయండి",
  "Open Staff Attendance": "Staff Attendance ఓపెన్ చేయండి",
  "Open the Absent list": "Absent list ఓపెన్ చేయండి",
  "Open the Attendance Register": "Attendance Register ఓపెన్ చేయండి",
  "Open the full report": "Full report ఓపెన్ చేయండి",
  "No school": "School లేదు",
  "Not taken": "తీసుకోలేదు",
  "{n} in {class}": "{class}లో {n}",
  "{list} and more": "{list}, ఇంకా కొంతమంది",
  "{from} to {to}": "{from} నుంచి {to} వరకు",
  "today": "ఈరోజు",
  "yesterday": "నిన్న",

  "As on {date}": "{date} నాటికి",

  // The ready-made questions, shown as chips (each is understood again when tapped: tests/assistant/style.test.ts)
  "Who was absent yesterday in {class}?": "నిన్న {class}లో absent ఎవరు?",
  "Who was absent yesterday?": "నిన్న absent ఎవరు?",
  "Who is absent today in {class}?": "ఈరోజు {class}లో absent ఎవరు?",
  "Who is absent today?": "ఈరోజు absent ఎవరు?",
  "Who has been absent several days in a row in {class}?": "{class}లో వరుసగా కొన్ని రోజులు absent ఎవరు?",
  "Who has been absent several days in a row?": "వరుసగా కొన్ని రోజులు absent ఎవరు?",
  "Who is below the attendance line in {class}?": "{class}లో attendance తక్కువ ఉన్నది ఎవరికి?",
  "Who is below the attendance line?": "Attendance తక్కువ ఉన్నది ఎవరికి?",
  "Which classes have not taken attendance today?": "ఈరోజు attendance తీసుకోని classes ఏవి?",
  "Which staff came late {when}?": "{when} late గా వచ్చిన staff ఎవరు?",
  "Which staff are absent {when}?": "{when} absent ఉన్న staff ఎవరు?",
  "Which staff are on leave {when}?": "{when} leave లో ఉన్న staff ఎవరు?",
  "How much fee was collected {when} in {class}?": "{when} {class}లో ఎంత fee collect అయ్యింది?",
  "How much fee was collected {when}?": "{when} ఎంత fee collect అయ్యింది?",
  "Who owes {amount} or more in {class}?": "{class}లో {amount} లేదా ఎక్కువ fees pending ఎవరికి?",
  "Who owes {amount} or more?": "{amount} లేదా ఎక్కువ fees pending ఎవరికి?",
  "Who has fees overdue in {class}?": "{class}లో fees pending ఎవరికి ఉంది?",
  "Who has fees overdue?": "Fees pending ఎవరికి ఉంది?",
  "Who is below the pass mark in {class}?": "{class}లో pass mark కంటే తక్కువ ఎవరు?",
  "Which classes have marks below the pass mark?": "ఏ classes లో marks pass mark కంటే తక్కువ ఉన్నాయి?",
  "Whose birthday is today?": "ఈరోజు birthday ఎవరిది?",
  "Whose birthday is coming up this week?": "ఈ వారం birthday ఎవరిది?",

  // Refusals
  "Student attendance is not part of your role.": "Student attendance మీ role లో లేదు.",
  "Fee defaulters are not part of your role.": "Fee defaulters మీ role లో లేరు.",
  "The staff's attendance is not part of your role.": "Staff attendance మీ role లో లేదు.",
  "This question is about a list your role does not open. Ask your School Admin if you need it (Settings, Users & Permissions).": "ఈ list మీ role కి open అవ్వదు. కావాలంటే మీ School Admin ని అడగండి (Settings, Users & Permissions).",
  "You can see your own classes only. Ask about one of your classes, or leave the class out.": "మీరు మీ classes మాత్రమే చూడగలరు. మీ class గురించి అడగండి, లేదా class చెప్పకుండా అడగండి.",
  "You have no class this year, so there is no absent list for you.": "ఈ year మీకు class లేదు, అందుకే మీకు absent list లేదు.",
  "There is no {class} in this year's classes. Check the class, or leave it out.": "ఈ year classes లో {class} లేదు. Class ఒకసారి check చేయండి, లేదా class చెప్పకుండా అడగండి.",
  "{class} is in more than one campus. Open the full list and choose the campus there.": "{class} ఒకటి కంటే ఎక్కువ campuses లో ఉంది. Full list ఓపెన్ చేసి అక్కడ campus select చేయండి.",
  "{date} is not a school day.": "{date} school day కాదు.",

  // Absent today
  "Attendance for {date} has not been taken yet in {class}, so nobody can be counted absent.": "{class}లో {date} attendance ఇంకా తీసుకోలేదు, అందుకే ఎవరు absent అనేది ఇప్పుడే చెప్పలేను.",
  "Attendance for {date} has not been taken yet, so nobody can be counted absent.": "{date} attendance ఇంకా తీసుకోలేదు, అందుకే ఎవరు absent అనేది ఇప్పుడే చెప్పలేను.",
  "Nobody is marked absent on {date} in {class}.": "{date} న {class}లో ఎవరూ absent లేరు.",
  "Nobody is marked absent on {date}.": "{date} న ఎవరూ absent లేరు.",
  "{n} students are absent on {date}: {list}.": "{date} న {n} students absent: {list}.",
  "{n} student is absent on {date} in {class}.": "{date} న {class}లో {n} student absent.",
  "{n} students are absent on {date} in {class}.": "{date} న {class}లో {n} students absent.",
  "{n} class has not taken attendance yet, so the number may still go up.": "{n} class ఇంకా attendance తీసుకోలేదు, కాబట్టి ఈ number ఇంకా పెరగొచ్చు.",
  "{n} classes have not taken attendance yet, so the number may still go up.": "{n} classes ఇంకా attendance తీసుకోలేదు, కాబట్టి ఈ number ఇంకా పెరగొచ్చు.",

  // Absent in a row
  "{n} student has been absent {days} or more school days in a row and the flag is still open. Call the parents; the flag goes when they are marked present.": "{n} student వరుసగా {days} లేదా ఎక్కువ school days absent. Parents కి ఒకసారి call చేయండి; present mark చేయగానే flag పోతుంది.",
  "{n} students have been absent {days} or more school days in a row and the flag is still open. Call the parents; the flag goes when they are marked present.": "{n} students వరుసగా {days} లేదా ఎక్కువ school days absent. Parents కి ఒకసారి call చేయండి; present mark చేయగానే flag పోతుంది.",
  "Nobody has been absent {days} school days in a row in {class}.": "{class}లో ఎవరూ వరుసగా {days} school days absent అవ్వలేదు.",
  "Nobody has been absent {days} school days in a row.": "ఎవరూ వరుసగా {days} school days absent అవ్వలేదు.",

  // Below the attendance line
  "{n} student is below {pct}% attendance this year.": "ఈ year {n} student {pct}% attendance కంటే తక్కువ ఉన్నారు.",
  "{n} student is below {pct}% attendance this year; {m} more is close to it.": "ఈ year {n} student {pct}% attendance కంటే తక్కువ ఉన్నారు; ఇంకో {m} student దగ్గరలో ఉన్నారు.",
  "{n} student is below {pct}% attendance this year; {m} more are close to it.": "ఈ year {n} student {pct}% attendance కంటే తక్కువ ఉన్నారు; ఇంకో {m} students దగ్గరలో ఉన్నారు.",
  "{n} student is below {pct}% attendance this year in {class}.": "ఈ year {class}లో {n} student {pct}% attendance కంటే తక్కువ ఉన్నారు.",
  "{n} student is below {pct}% attendance this year in {class}; {m} more is close to it.": "ఈ year {class}లో {n} student {pct}% attendance కంటే తక్కువ ఉన్నారు; ఇంకో {m} student దగ్గరలో ఉన్నారు.",
  "{n} student is below {pct}% attendance this year in {class}; {m} more are close to it.": "ఈ year {class}లో {n} student {pct}% attendance కంటే తక్కువ ఉన్నారు; ఇంకో {m} students దగ్గరలో ఉన్నారు.",
  "{n} students are below {pct}% attendance this year.": "ఈ year {n} students {pct}% attendance కంటే తక్కువ ఉన్నారు.",
  "{n} students are below {pct}% attendance this year; {m} more is close to it.": "ఈ year {n} students {pct}% attendance కంటే తక్కువ ఉన్నారు; ఇంకో {m} student దగ్గరలో ఉన్నారు.",
  "{n} students are below {pct}% attendance this year; {m} more are close to it.": "ఈ year {n} students {pct}% attendance కంటే తక్కువ ఉన్నారు; ఇంకో {m} students దగ్గరలో ఉన్నారు.",
  "{n} students are below {pct}% attendance this year in {class}.": "ఈ year {class}లో {n} students {pct}% attendance కంటే తక్కువ ఉన్నారు.",
  "{n} students are below {pct}% attendance this year in {class}; {m} more is close to it.": "ఈ year {class}లో {n} students {pct}% attendance కంటే తక్కువ ఉన్నారు; ఇంకో {m} student దగ్గరలో ఉన్నారు.",
  "{n} students are below {pct}% attendance this year in {class}; {m} more are close to it.": "ఈ year {class}లో {n} students {pct}% attendance కంటే తక్కువ ఉన్నారు; ఇంకో {m} students దగ్గరలో ఉన్నారు.",

  // Attendance not taken
  "{n} class has students without a mark today.": "{n} class లో ఈరోజు కొంతమంది students కి mark పడలేదు.",
  "{n} class has students without a mark today; {m} class has not taken attendance at all.": "{n} class లో ఈరోజు కొంతమంది students కి mark పడలేదు; {m} class అసలు attendance తీసుకోలేదు.",
  "{n} class has students without a mark today; {m} classes have not taken attendance at all.": "{n} class లో ఈరోజు కొంతమంది students కి mark పడలేదు; {m} classes అసలు attendance తీసుకోలేదు.",
  "{n} classes have students without a mark today.": "{n} classes లో ఈరోజు కొంతమంది students కి mark పడలేదు.",
  "{n} classes have students without a mark today; {m} class has not taken attendance at all.": "{n} classes లో ఈరోజు కొంతమంది students కి mark పడలేదు; {m} class అసలు attendance తీసుకోలేదు.",
  "{n} classes have students without a mark today; {m} classes have not taken attendance at all.": "{n} classes లో ఈరోజు కొంతమంది students కి mark పడలేదు; {m} classes అసలు attendance తీసుకోలేదు.",
  "Every class has taken attendance today.": "ఈరోజు అన్ని classes attendance తీసుకున్నాయి.",

  // Below the pass mark
  "Nobody is below the pass mark in {exam} in {class}.": "{exam}లో {class}లో ఎవరూ pass mark కంటే తక్కువ లేరు.",
  "Nobody is below the pass mark in {exam}.": "{exam}లో ఎవరూ pass mark కంటే తక్కువ లేరు.",
  "{n} students are below the pass mark in at least one subject in {exam}, in {k} classes: {list}.": "{exam}లో {n} students కనీసం ఒక subject లో pass mark కంటే తక్కువ, {k} classes లో: {list}.",
  "{n} student is below the pass mark in at least one subject in {exam}, all in {class}.": "{exam}లో {class}లో {n} student కనీసం ఒక subject లో pass mark కంటే తక్కువ.",
  "{n} students are below the pass mark in at least one subject in {exam}, all in {class}.": "{exam}లో {n} students కనీసం ఒక subject లో pass mark కంటే తక్కువ, అందరూ {class}లోనే.",

  // Fee collected
  "{amount} was collected {when} ({dates}) from {class}, in {n} payment. Cancelled payments are not counted.": "{when} ({dates}) {class} నుంచి {amount} fee collect అయ్యింది, {n} payment లో. Cancel చేసిన payments లెక్కలో లేవు.",
  "{amount} was collected {when} ({dates}) from {class}, in {n} payments. Cancelled payments are not counted.": "{when} ({dates}) {class} నుంచి {amount} fee collect అయ్యింది, {n} payments లో. Cancel చేసిన payments లెక్కలో లేవు.",
  "{amount} was collected {when} ({dates}), in {n} payment. Cancelled payments are not counted.": "{when} ({dates}) {amount} fee collect అయ్యింది, {n} payment లో. Cancel చేసిన payments లెక్కలో లేవు.",
  "{amount} was collected {when} ({dates}), in {n} payments. Cancelled payments are not counted.": "{when} ({dates}) {amount} fee collect అయ్యింది, {n} payments లో. Cancel చేసిన payments లెక్కలో లేవు.",
  "No fee was collected {when} ({dates}) from {class}.": "{when} ({dates}) {class} నుంచి fee ఏమీ రాలేదు.",
  "No fee was collected {when} ({dates}).": "{when} ({dates}) fee ఏమీ రాలేదు.",

  // Fees overdue
  "Nobody has fees overdue.": "ఎవరికీ fees pending లేదు.",
  "Nobody has fees overdue in {class}.": "{class}లో ఎవరికీ fees pending లేదు.",
  "Nobody has fees overdue ({amount} or more each).": "ఎవరికీ fees pending లేదు ({amount} లేదా ఎక్కువ).",
  "Nobody has fees overdue ({amount} or more each) in {class}.": "{class}లో ఎవరికీ fees pending లేదు ({amount} లేదా ఎక్కువ).",
  "{n} student has {total} overdue. Fees not yet due are not counted.": "{n} student కి {total} fees pending ఉంది. ఇంకా due date రాని fees లెక్కలో లేవు.",
  "{n} student has {total} overdue ({amount} or more each). Fees not yet due are not counted.": "{n} student కి {total} fees pending ఉంది ({amount} లేదా ఎక్కువ). ఇంకా due date రాని fees లెక్కలో లేవు.",
  "{n} student has {total} overdue in {class}. Fees not yet due are not counted.": "{class}లో {n} student కి {total} fees pending ఉంది. ఇంకా due date రాని fees లెక్కలో లేవు.",
  "{n} student has {total} overdue ({amount} or more each) in {class}. Fees not yet due are not counted.": "{class}లో {n} student కి {total} fees pending ఉంది ({amount} లేదా ఎక్కువ). ఇంకా due date రాని fees లెక్కలో లేవు.",
  "{n} students have {total} overdue. Fees not yet due are not counted.": "{n} students కి మొత్తం {total} fees pending ఉంది. ఇంకా due date రాని fees లెక్కలో లేవు.",
  "{n} students have {total} overdue ({amount} or more each). Fees not yet due are not counted.": "{n} students కి మొత్తం {total} fees pending ఉంది (ఒక్కొక్కరికి {amount} లేదా ఎక్కువ). ఇంకా due date రాని fees లెక్కలో లేవు.",
  "{n} students have {total} overdue in {class}. Fees not yet due are not counted.": "{class}లో {n} students కి మొత్తం {total} fees pending ఉంది. ఇంకా due date రాని fees లెక్కలో లేవు.",
  "{n} students have {total} overdue ({amount} or more each) in {class}. Fees not yet due are not counted.": "{class}లో {n} students కి మొత్తం {total} fees pending ఉంది (ఒక్కొక్కరికి {amount} లేదా ఎక్కువ). ఇంకా due date రాని fees లెక్కలో లేవు.",

  // Staff
  "{n} staff member came late on {date}.": "{date} న {n} staff late గా వచ్చారు.",
  "{n} staff came late on {date}.": "{date} న {n} staff late గా వచ్చారు.",
  "Nobody came late on {date}.": "{date} న ఎవరూ late గా రాలేదు.",
  "{n} staff member absent on {date}.": "{date} న {n} staff absent.",
  "{n} staff absent on {date}.": "{date} న {n} staff absent.",
  "{n} staff member on leave on {date}.": "{date} న {n} staff leave లో ఉన్నారు.",
  "{n} staff on leave on {date}.": "{date} న {n} staff leave లో ఉన్నారు.",
  "Nobody is on leave on {date}.": "{date} న ఎవరూ leave లో లేరు.",

  // Birthdays
  "No birthday today among the people your Dashboard shows.": "మీ Dashboard లో ఉన్నవాళ్ళలో ఈరోజు ఎవరికీ birthday లేదు.",
  "No birthday in the next 7 days among the people your Dashboard shows.": "మీ Dashboard లో ఉన్నవాళ్ళలో next 7 days లో ఎవరికీ birthday లేదు.",
  "{n} birthday today, among the students, parents and staff your Dashboard shows.": "ఈరోజు {n} birthday ఉంది! మీ Dashboard లోని students, parents, staff లో.",
  "{n} birthdays today, among the students, parents and staff your Dashboard shows.": "ఈరోజు {n} birthdays ఉన్నాయి! మీ Dashboard లోని students, parents, staff లో.",
  "{n} birthday in the next 7 days, among the students, parents and staff your Dashboard shows.": "Next 7 days లో {n} birthday ఉంది, మీ Dashboard లోని students, parents, staff లో.",
  "{n} birthdays in the next 7 days, among the students, parents and staff your Dashboard shows.": "Next 7 days లో {n} birthdays ఉన్నాయి, మీ Dashboard లోని students, parents, staff లో.",
};
