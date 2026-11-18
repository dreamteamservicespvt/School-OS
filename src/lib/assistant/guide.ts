// The Assistant's built-in how-to guide (owner, 17 Nov 2026). "Explain me about the software, how to use
// it, in Telugu" got only a stock greeting, and "How do I take attendance?" a vague AI line with no steps.
// The guide needs no AI service (the key is on a free tier and often answers 429/503):
// - guideIntent(): the words alone say "the software in short" or "how do I <task>" (English, Telugu in
//   Telugu letters or English letters, Hindi). A question about the school's records ("explain the fee
//   structure of Class 5", "how many absent today") is never the guide: it goes on to Ask and the planner.
// - guideReply(): the software in short (one line per module the person opens, the side menu's own rule
//   menuModules(), most used first for their role, at most 8, each with its link), or 3 to 5 numbered steps
//   that name the real screen words. Those words are catalogue keys the screens themselves use, shown in
//   the person's screen language, and tests/assistant/guide.test.ts fails when a page or a label is gone.
// A role that may not do a task is told who can, in one line. Nothing here reads a record.
import "server-only";

import type { Viewer } from "../dashboard/types";
import { MODULES, type ModuleKey } from "../modules";
import { menuModules } from "../permissions";
import { pageHidden, pageMode } from "../duty";
import { moduleOpen } from "../reports/access";
import { feePageAllowedFor } from "../fees/access";
import { attendancePages } from "../attendance/access";
import { landingFor, mayApprove } from "../shell-data";
import { makeT } from "../i18n/server";
import { cleanLang, type Lang } from "../i18n/languages";
import { englishOf, fill, type MessageKey, type T } from "../i18n/t";
import { plainWords } from "../ask/questions";
import type { AssistantLang } from "./language";

export const GUIDE_TASKS = ["take-attendance", "collect-fee", "fees-owed", "send-notice", "enter-marks", "report-cards", "add-student", "add-enquiry", "apply-leave", "approve"] as const;
export type GuideTask = (typeof GUIDE_TASKS)[number];
export type GuideIntent = { kind: "overview" } | { kind: "task"; task: GuideTask };
export type GuideWho = Pick<Viewer, "permissions" | "roles" | "modulesOn" | "features" | "user"> & { aiRoles?: readonly string[] };
export type GuideReply = { reply: string; sources: { label: string; href: string; scope: null }[]; chips: string[]; may: boolean };

/** The longest guide reply: a turn keeps and the voice route reads at most this many letters (conversation.ts, speak.ts). */
export const GUIDE_MAX = 800;

type Three = readonly [string, string, string];
const AT: Record<AssistantLang, 0 | 1 | 2> = { en: 0, te: 1, hi: 2 };

/* ---------- Which words ask for the guide ---------- */

/** "How do I", "how to", "ela", "कैसे": the person asks how to do something. */
const HOW = / how (do|can|should|would|could|will|shall|does) (i|we|you|one|a teacher|a person) | how to | how does | where (do|can|should) (i|we) | steps? (to|for) | show me how | teach me | guide me | help me | process (to|for) | way to | explain how | ela | elaa | ekkada | kaise | kese | kahan | kaha |ఎలా|ఎక్కడ|कैसे|कहाँ|कहां/;
/** Words of a question about the records, not a way of working. */
const DATA = / who | whom | whose | which | how many | how much | evaru | evari | enni | entha | kaun | kitne | kitna | kitni | below | percent | percentage | % | report | reports | topper | toppers |ఎవరు|ఎవరికి|ఎన్ని|ఎంత|कौन|कितने|कितना| how is | how was | how are | undi | vundi | unnadu | unnaru |ఉంది|ఉన్నాడు|ఉన్నారు|ఉన్నది|ఉన్నాయి| kaisi hai | kaisa hai |कैसी है|कैसा है|कैसे हैं|कैसी थी|कैसा था/;

const T_ = {
  attendance: / attendance | attendence | register | hajaru | haziri | hazri |హాజరు|हाज़िरी|हाजिरी|उपस्थिति|అటెండెన్స్/,
  fee: / fee | fees | fess | payment | payments | rupees |ఫీజు|ఫీజులు|फ़ीस|फीस|शुल्क/,
  owe: / owe | owes | owing | due | dues | pending | defaulter | defaulters | unpaid | baaki | baki | bakaya | balance | kattani | kattaledu |బాకీ|బకాయి|కట్టని|कट्ट|बकाया|बाकी|बाक़ी/,
  collect: / collect | collection | receive | take | accept | pay | receipt | vasulu | jama | katt |వసూలు|కట్ట|जमा|लें|लूं|लूँ|ले /,
  notice: / notice | notices | circular | message | messages | whatsapp | sms | announcement |నోటీసు|నోటీస్|సందేశం|మెసేజ్|नोटिस|सूचना|संदेश|मैसेज/,
  send: / send | post | publish | give | share | write | pampu | pampali | pampa | bhej | bheju | bhejein |పంప|రాయ|भेज|डाल|लिख/,
  marks: / marks | mark |మార్కులు|मार्क्स|अंक|नंबर/,
  reportCards: / report card | report cards | reportcard | reportcards | progress card | progress cards | progress report |రిపోర్ట్ కార్డ్|రిపోర్ట్ కార్డులు|रिपोर्ट कार्ड/,
  student: / student | students | child | kid | pupil |విద్యార్థి|छात्र|बच्चा|बच्चे/,
  add: / add | new | register | admit | join | enrol | enroll | create | kotha | cherchu |చేర్చ|జాయిన్|కొత్త|जोड़|जोड|नया|नए|दाखिल/,
  enquiry: / enquiry | enquiries | inquiry | inquiries |पूछताछ/,
  leave: / leave | leaves | selavu | chutti | chhutti |సెలవు|छुट्टी|छुट्टियाँ/,
  apply: / apply | ask | request | take | put | get | pettu | petta | teesuko |పెట్ట|తీసుకో|अप्लाई|माँग|मांग|लूं|लूँ|लेनी|ले /,
  approve: / approve | approval | approvals |అప్రూవ్|मंज़ूर|मंजूर|अप्रूव/,
};

/** The software itself, and a word for explaining or using it. */
const SOFT = / software | app | application | school os | schoolos | platform | portal | this tool |సాఫ్ట్‌వేర్|సాఫ్ట్వేర్|యాప్|సాప్ట్‌వేర్|सॉफ़्टवेयर|सॉफ्टवेयर|सॉफ्टवेर|ऐप/;
const ABOUT = / explain | tell | describe | introduce | what is | whats | about | overview | teach | show | use | using | work | works | gurinchi | cheppu | cheppandi | vivarinchu | ela | vadali | vaadali | baare | bare | batao | bataiye | samjhao | kaise | istemal |గురించి|చెప్ప|వివరించ|ఎలా|వాడ|ఉపయోగ|बारे|बताओ|बताइए|बताएं|समझा|कैसे|इस्तेमाल|उपयोग|काम/;
const PHRASE = / how (do|can|should) (i|we) use (it|this)| how to use (it|this) | how to use $| how does (this|it) work | what can (i|we|you) do | what all can | guide me | help me use | ela vadali | ela vaadali | ela use cheyali | ela use cheyyali |ఎలా వాడాలి|ఎలా ఉపయోగించాలి|ఎలా use చేయాలి| kaise use kar| kaise istemal|कैसे इस्तेमाल|कैसे उपयोग/;

/** What the words ask the guide for, or null (a question for Ask and the planner). */
export function guideIntent(text: string): GuideIntent | null {
  const w = plainWords(String(text ?? "").slice(0, 300));
  if (!w.length) return null;
  const s = ` ${w.join(" ")} `;
  const has = (re: RegExp) => re.test(s);
  if (has(HOW)) {
    const task = ((): GuideTask | null => {
      if (has(T_.reportCards)) return "report-cards";
      if (has(T_.approve)) return "approve";
      if (has(T_.attendance) && !has(DATA)) return "take-attendance";
      if ((has(T_.fee) && has(T_.owe)) || / defaulter | defaulters /.test(s)) return "fees-owed";
      if (has(T_.fee) && has(T_.collect)) return "collect-fee";
      if (has(T_.enquiry)) return "add-enquiry";
      if (has(T_.marks) && !has(DATA) && !/ (below|fail|failed|pass|passed) /.test(s)) return "enter-marks";
      if (has(T_.notice) && has(T_.send)) return "send-notice";
      if (has(T_.leave) && has(T_.apply)) return "apply-leave";
      if (has(T_.student) && has(T_.add)) return "add-student";
      return null;
    })();
    if (task) return { kind: "task", task };
  }
  if (has(PHRASE) || (has(SOFT) && has(ABOUT))) return { kind: "overview" };
  return null;
}

/* ---------- The screen words the steps name ---------- */

const A = "src/app/(school)";
/** A screen word: its catalogue key, the file of the screen that shows it, and the text that proves it is still there. */
type Label = { text: MessageKey; file: string; match: string };
const L = (text: MessageKey, file: string, match: string = text): Label => ({ text, file, match });
const menu = (key: ModuleKey) => L(MODULES.find((m) => m.key === key)!.short as MessageKey, "src/lib/modules.ts", `short: "${MODULES.find((m) => m.key === key)!.short}"`);

type TaskDef = {
  module: ModuleKey | "approvals";
  href: (who: GuideWho) => string;
  /** The label the link opens ("Open Take Attendance"). */
  page: string;
  labels: Record<string, Label>;
  may: (who: GuideWho) => boolean;
  steps: (who: GuideWho) => Three[];
  whoCan: Three;
  chip: Three;
};

const open = (who: GuideWho, key: ModuleKey) => moduleOpen(who, key);
const changes = (who: GuideWho, key: ModuleKey) => who.permissions[key].change !== "none";
const OPEN_TAB: Three = ["Open {menu} in the menu, then {tab}.", "Menu లో {menu} ఓపెన్ చేసి, {tab} నొక్కండి.", "Menu में {menu} खोलें, फिर {tab} पर जाएँ।"];

const TASKS: Record<GuideTask, TaskDef> = {
  "take-attendance": {
    module: "attendance-management", href: () => "/attendance-management", page: "tab",
    labels: {
      menu: menu("attendance-management"),
      tab: L("Take Attendance", `${A}/attendance-management/_components/att-head.tsx`, `label: "Take Attendance"`),
      all: L("All present", `${A}/attendance-management/_components/take-sheet.tsx`, `<Words k="All present" />`),
      save: L("Save attendance: {list}", `${A}/attendance-management/_components/take-sheet.tsx`, `tr("Save attendance: {list}"`),
    },
    may: (w) => open(w, "attendance-management") && changes(w, "attendance-management") && attendancePages(w).take !== "hidden",
    steps: () => [
      OPEN_TAB,
      ["Pick your class and the date at the top.", "పైన మీ class, date select చేయండి.", "ऊपर अपनी class और date चुनें।"],
      ["Tap only the students who are absent or late; {all} marks everyone present at once.", "Absent లేదా late వచ్చిన students ని మాత్రమే tap చేయండి; {all} నొక్కితే అందరూ ఒకేసారి present అవుతారు.", "सिर्फ़ absent या late students पर tap करें; {all} से सब एक साथ present हो जाते हैं।"],
      ["Press {save} at the bottom. You can change it until the lock time.", "కింద {save} నొక్కండి. Lock time వరకు మార్చుకోవచ్చు.", "नीचे {save} दबाएँ। Lock time तक बदल सकते हैं।"],
    ],
    whoCan: ["Class teachers take attendance for their own class, and the School Admin can too.", "Attendance ని class teachers వాళ్ళ class కి తీసుకుంటారు, School Admin కూడా తీసుకోవచ్చు.", "Attendance class teacher अपनी class की लेते हैं, School Admin भी ले सकते हैं।"],
    chip: ["How do I take attendance?", "Attendance ఎలా తీసుకోవాలి?", "Attendance कैसे लें?"],
  },
  "collect-fee": {
    module: "fee-management", href: () => "/fee-management", page: "tab",
    labels: {
      menu: menu("fee-management"),
      tab: L("Collect Fee", `${A}/fee-management/_lib/page.ts`, `label: "Collect Fee"`),
      find: L("Find a student", `${A}/fee-management/page.tsx`, `label="Find a student"`),
      amount: L("Amount received", `${A}/fee-management/collect/[studentId]/collect-form.tsx`, `label="Amount received"`),
      mode: L("How is it paid?", `${A}/fee-management/collect/[studentId]/collect-form.tsx`, `<Words k="How is it paid?" />`),
      button: L("Collect {amount} in cash", `${A}/fee-management/collect/[studentId]/collect-form.tsx`, "`Collect ${inr(amt)} ${BY_MODE[mode]"),
    },
    may: (w) => open(w, "fee-management") && feePageAllowedFor(w, "collect") && !pageHidden(w, "fee-management", "collect"),
    steps: () => [
      OPEN_TAB,
      ["In {find}, type the student's name, admission number or the parent's phone, and open the student.", "{find} లో student పేరు, admission number లేదా parent phone type చేసి, student ని ఓపెన్ చేయండి.", "{find} में student का नाम, admission number या parent का phone लिखें, और student खोलें।"],
      ["The fees due are ticked for you. Check {amount} and choose the mode under {mode}.", "Due ఉన్న fees ముందే tick అయి ఉంటాయి. {amount} check చేసి, {mode} లో payment mode ఎంచుకోండి.", "Due fees पहले से tick होती हैं। {amount} check करें और {mode} में payment mode चुनें।"],
      ["Press {button}. The receipt is ready to print or to send to the parent.", "{button} నొక్కండి. Receipt print చేయవచ్చు, లేదా parent కి పంపవచ్చు.", "{button} दबाएँ। Receipt print कर सकते हैं या parent को भेज सकते हैं।"],
    ],
    whoCan: ["The Accountant collects fees at the fee counter.", "Fees ని fee counter లో Accountant collect చేస్తారు.", "Fee counter पर Accountant fees लेते हैं।"],
    chip: ["How do I collect a fee?", "Fee ఎలా collect చేయాలి?", "Fee कैसे collect करें?"],
  },
  "fees-owed": {
    module: "fee-management", href: () => "/fee-management/defaulters", page: "tab",
    labels: {
      menu: menu("fee-management"),
      tab: L("Defaulters", `${A}/fee-management/_lib/page.ts`, `label: "Defaulters"`),
      cls: L("Class", `${A}/fee-management/defaulters/page.tsx`, `label="Class"`),
      remind: L("Send reminder", `${A}/fee-management/defaulters/list.tsx`, `<Words k="Send reminder" />`),
    },
    may: (w) => open(w, "fee-management") && feePageAllowedFor(w, "defaulters"),
    steps: (w) => [
      OPEN_TAB,
      ["You see every student with fees overdue, the longest overdue first. Choose a {cls} to see one class.", "Fees pending ఉన్న students అందరూ కనిపిస్తారు, ఎక్కువ రోజులు pending ఉన్నవాళ్ళు ముందు. ఒక class కోసం {cls} select చేయండి.", "जिनकी fees बाकी है वे सब students दिखते हैं, सबसे पुराने बकाया वाले पहले। एक class के लिए {cls} चुनें।"],
      ["Tap a student to see what is due and the reminders already sent.", "Student మీద tap చేస్తే ఎంత due ఉందో, ఏ reminders వెళ్ళాయో కనిపిస్తుంది.", "Student पर tap करें, तो कितना due है और कौन से reminders गए, दिखता है।"],
      ...(w.permissions["fee-management"].change === "all"
        ? [["To remind parents, tick the students and press {remind}.", "Parents కి remind చేయాలంటే students ని tick చేసి {remind} నొక్కండి.", "Parents को याद दिलाने के लिए students को tick करके {remind} दबाएँ।"] as const]
        : []),
    ],
    whoCan: ["The Accountant, the Principal and the School Admin see who owes fees.", "Fees pending ఎవరికి ఉందో Accountant, Principal, School Admin చూడగలరు.", "किसकी fees बाकी है, यह Accountant, Principal और School Admin देख सकते हैं।"],
    chip: ["How do I see who owes fees?", "Fees pending ఎవరికి ఉందో ఎలా చూడాలి?", "किसकी fees बाकी है, कैसे देखें?"],
  },
  "send-notice": {
    module: "communication", href: () => "/communication/notices/new", page: "newNotice",
    labels: {
      menu: menu("communication"),
      board: L("Notice Board", `${A}/communication/_components/comm-head.tsx`, `label: "Notice Board"`),
      newNotice: L("New notice", `${A}/communication/notices/page.tsx`, `<Words k="New notice" />`),
      publish: L("Publish", `${A}/communication/notices/notice-form.tsx`, `"Publish"`),
      send: L("Send Message", `${A}/communication/_components/comm-head.tsx`, `label: "Send Message"`),
    },
    may: (w) => open(w, "communication") && changes(w, "communication"),
    steps: () => [
      ["Open {menu} in the menu, then {board}, and press {newNotice}.", "Menu లో {menu} ఓపెన్ చేసి, {board} లో {newNotice} నొక్కండి.", "Menu में {menu} खोलें, फिर {board} में {newNotice} दबाएँ।"],
      ["Choose who gets it (the whole school, classes or staff), then write the title and the notice.", "ఎవరికి వెళ్ళాలో select చేయండి (మొత్తం school, classes లేదా staff), తర్వాత title, notice రాయండి.", "चुनें किसे जाना है (पूरा school, classes या staff), फिर title और notice लिखें।"],
      ["Press {publish}. It goes on the {board} for the people you chose.", "{publish} నొక్కండి. మీరు select చేసిన వాళ్ళకి {board} లో కనిపిస్తుంది.", "{publish} दबाएँ। आपने जिन्हें चुना, उन्हें {board} पर दिखता है।"],
      ["For a WhatsApp or SMS message instead, use {send}: choose who gets it, write it, check the count, then send.", "WhatsApp లేదా SMS message కావాలంటే {send} వాడండి: ఎవరికో select చేసి, message రాసి, count check చేసి పంపండి.", "WhatsApp या SMS message के लिए {send} इस्तेमाल करें: किसे भेजना है चुनें, message लिखें, count check करें, फिर भेजें।"],
    ],
    whoCan: ["The Principal, the School Admin and teachers (for their own classes) send notices.", "Notices ని Principal, School Admin, teachers (వాళ్ళ classes కి) పంపుతారు.", "Notice Principal, School Admin और teachers (अपनी classes को) भेजते हैं।"],
    chip: ["How do I send a notice to parents?", "Parents కి notice ఎలా పంపాలి?", "Parents को notice कैसे भेजें?"],
  },
  "enter-marks": {
    module: "examination-results", href: () => "/examination-results/marks", page: "tab",
    labels: {
      menu: menu("examination-results"),
      tab: L("Marks Entry", `${A}/examination-results/_components/page-top.tsx`, `"Marks Entry"`),
      save: L("Save now", `${A}/examination-results/marks/marks-grid.tsx`, `<Words k="Save now" />`),
      submit: L("Submit marks", `${A}/examination-results/marks/marks-grid.tsx`, `<Words k="Submit marks" />`),
    },
    may: (w) => open(w, "examination-results") && changes(w, "examination-results") && pageMode(w, "examination-results", "marks") === "full",
    steps: () => [
      OPEN_TAB,
      ["Pick the exam, your class and the subject.", "Exam, మీ class, subject select చేయండి.", "Exam, अपनी class और subject चुनें।"],
      ["Type each student's marks. They are saved as you go; {save} saves at once.", "ప్రతి student marks type చేయండి. Type చేస్తూనే save అవుతాయి; {save} నొక్కితే వెంటనే save అవుతాయి.", "हर student के marks लिखें। लिखते-लिखते save होते हैं; {save} से तुरंत save होते हैं।"],
      ["When every mark is in, press {submit}.", "అన్ని marks వేసిన తర్వాత {submit} నొక్కండి.", "सारे marks भरने के बाद {submit} दबाएँ।"],
    ],
    whoCan: ["Subject teachers enter marks for the subjects they teach.", "Marks ని subject teachers వాళ్ళు చెప్పే subjects కి enter చేస్తారు.", "Marks subject teachers अपने subjects के लिए भरते हैं।"],
    chip: ["How do I enter marks?", "Marks ఎలా enter చేయాలి?", "Marks कैसे enter करें?"],
  },
  "report-cards": {
    module: "examination-results", href: () => "/examination-results/report-cards", page: "tab",
    labels: {
      menu: menu("examination-results"),
      tab: L("Report Cards", `${A}/examination-results/_components/page-top.tsx`, `"Report Cards"`),
      remark: L("Class teacher remark", `${A}/examination-results/report-cards/report-cards-ui.tsx`, "Class teacher remark"),
      save: L("Save", `${A}/examination-results/report-cards/report-cards-ui.tsx`, `<Words k="Save" />`),
      pdf: L("View PDF", `${A}/examination-results/report-cards/report-cards-ui.tsx`, "View PDF"),
    },
    may: (w) => open(w, "examination-results") && (w.permissions["examination-results"].change === "all" || w.roles.some((r) => r.key === "class-teacher")),
    steps: () => [
      OPEN_TAB,
      ["Report cards are ready once the exam results are published.", "Exam results publish అయిన తర్వాత report cards ready అవుతాయి.", "Exam results publish होने के बाद report cards तैयार होते हैं।"],
      ["Open a student, write the {remark} and press {save}.", "ఒక student ని ఓపెన్ చేసి {remark} రాసి {save} నొక్కండి.", "एक student खोलें, {remark} लिखें और {save} दबाएँ।"],
      ["Use {pdf} to check it, then print the report cards or send them to parents.", "{pdf} తో ఒకసారి చూసి, report cards print చేయండి లేదా parents కి పంపండి.", "{pdf} से एक बार देखें, फिर report cards print करें या parents को भेजें।"],
    ],
    whoCan: ["Class teachers write report cards for their class; the Principal publishes the results.", "Report cards ని class teachers వాళ్ళ class కి రాస్తారు; results ని Principal publish చేస్తారు.", "Report cards class teacher अपनी class के लिए लिखते हैं; results Principal publish करते हैं।"],
    chip: ["How do I make report cards?", "Report cards ఎలా తయారు చేయాలి?", "Report cards कैसे बनाएँ?"],
  },
  "add-student": {
    module: "student-management", href: () => "/student-management/new", page: "add",
    labels: {
      menu: menu("student-management"),
      add: L("Add student", `${A}/student-management/new/add-student-form.tsx`, `<Words k="Add student" />`),
    },
    may: (w) => open(w, "student-management") && w.permissions["student-management"].change === "all",
    steps: () => [
      ["Open {menu} in the menu and press {add}.", "Menu లో {menu} ఓపెన్ చేసి {add} నొక్కండి.", "Menu में {menu} खोलें और {add} दबाएँ।"],
      ["The name, the class and a parent's phone are enough to start.", "మొదలుపెట్టడానికి student పేరు, class, parent phone చాలు.", "शुरू करने के लिए नाम, class और parent का phone काफ़ी है।"],
      ["Press {add} at the bottom. School OS warns you if the student may already be there.", "కింద {add} నొక్కండి. ఆ student ఇప్పటికే ఉంటే School OS చెబుతుంది.", "नीचे {add} दबाएँ। Student पहले से हो तो School OS बता देता है।"],
      ["Add the other details later on the Student Profile.", "మిగతా details తర్వాత Student Profile లో add చేయవచ్చు.", "बाकी details बाद में Student Profile में जोड़ें।"],
    ],
    whoCan: ["The School Admin and the office add students; new admissions can also come through Admissions.", "Students ని School Admin, office add చేస్తారు; కొత్త admissions Admissions నుంచి కూడా వస్తాయి.", "Students School Admin और office जोड़ते हैं; नए admissions Admissions से भी आते हैं।"],
    chip: ["How do I add a student?", "కొత్త student ని ఎలా add చేయాలి?", "नया student कैसे जोड़ें?"],
  },
  "add-enquiry": {
    module: "admission-management", href: () => "/admission-management/enquiries?do=add", page: "tab",
    labels: {
      menu: menu("admission-management"),
      tab: L("Enquiries", `${A}/admission-management/_components/head.tsx`, `label: "Enquiries"`),
      add: L("Add enquiry", `${A}/admission-management/enquiries/enquiry-forms.tsx`, `label = "Add enquiry"`),
    },
    may: (w) => open(w, "admission-management") && changes(w, "admission-management"),
    steps: () => [
      OPEN_TAB,
      ["Press {add}.", "{add} నొక్కండి.", "{add} दबाएँ।"],
      ["Fill in the child's name, the parent's name and phone, and the class wanted.", "Child పేరు, parent పేరు, phone, ఏ class కావాలో నింపండి.", "बच्चे का नाम, parent का नाम और phone, और कौन सी class चाहिए, भरें।"],
      ["Press {add} to save it.", "Save చేయడానికి {add} నొక్కండి.", "Save करने के लिए {add} दबाएँ।"],
    ],
    whoCan: ["The front office, the School Admin and the Principal add enquiries.", "Enquiries ని front office, School Admin, Principal add చేస్తారు.", "Enquiry front office, School Admin और Principal जोड़ते हैं।"],
    chip: ["How do I add an enquiry?", "Enquiry ఎలా add చేయాలి?", "Enquiry कैसे जोड़ें?"],
  },
  "apply-leave": {
    module: "staff-hr-management",
    href: (w) => (w.permissions["staff-hr-management"].see === "all" ? "/staff-hr-management/leave" : "/staff-hr-management/leave?view=mine"),
    page: "apply",
    labels: {
      mine: L("My leave", "src/lib/shell-data.ts", `label: "My leave"`),
      staff: menu("staff-hr-management"),
      leaveTab: L("Staff Leave", `${A}/staff-hr-management/_components/head.tsx`, `label: "Staff Leave"`),
      apply: L("Apply for leave", `${A}/staff-hr-management/leave/leave-forms.tsx`, `label = "Apply for leave"`),
      send: L("Apply", `${A}/staff-hr-management/leave/leave-forms.tsx`, `submitLabel="Apply"`),
    },
    may: (w) => w.permissions["staff-hr-management"].see !== "none",
    steps: (w) => [
      w.permissions["staff-hr-management"].see === "all"
        ? ["Open {staff} in the menu, then {leaveTab}.", "Menu లో {staff} ఓపెన్ చేసి, {leaveTab} నొక్కండి.", "Menu में {staff} खोलें, फिर {leaveTab} पर जाएँ।"]
        : ["Open {mine} in the menu.", "Menu లో {mine} ఓపెన్ చేయండి.", "Menu में {mine} खोलें।"],
      ["Press {apply}.", "{apply} నొక్కండి.", "{apply} दबाएँ।"],
      ["Choose the leave type and the dates, and write the reason.", "Leave type, dates select చేసి reason రాయండి.", "Leave type और dates चुनें, और reason लिखें।"],
      ["Press {send}. You are told when it is approved.", "{send} నొక్కండి. Approve అయ్యాక మీకు తెలుస్తుంది.", "{send} दबाएँ। Approve होने पर आपको बताया जाएगा।"],
    ],
    whoCan: ["Leave is applied for by staff members. Ask your School Admin if your login should have a staff record.", "Leave ని staff members apply చేస్తారు. మీ login కి staff record కావాలంటే School Admin ని అడగండి.", "Leave staff members apply करते हैं। आपके login के लिए staff record चाहिए तो School Admin से पूछें।"],
    chip: ["How do I apply for leave?", "Leave కి ఎలా apply చేయాలి?", "Leave के लिए कैसे apply करें?"],
  },
  approve: {
    module: "approvals", href: () => "/approvals", page: "approvals",
    labels: {
      approvals: L("Approvals", "src/lib/shell-data.ts", `{ label: "Approvals", href: "/approvals" }`),
      approve: L("Approve", `${A}/approvals/approval-list.tsx`, `<Words k="Approve" />`),
      reject: L("Reject", `${A}/approvals/approval-list.tsx`, `<Words k="Reject" />`),
    },
    may: (w) => mayApprove(w, 0),
    steps: () => [
      ["Open {approvals} at the top of the screen.", "Screen పైన ఉన్న {approvals} ఓపెన్ చేయండి.", "Screen के ऊपर {approvals} खोलें।"],
      ["Each request says who asked and why. Tap one to see the details.", "ప్రతి request లో ఎవరు అడిగారు, ఎందుకు అనేది ఉంటుంది. Details కోసం tap చేయండి.", "हर request में किसने और क्यों माँगा, लिखा होता है। Details के लिए tap करें।"],
      ["Press {approve}, or {reject} with a reason. The person who asked is told.", "{approve} నొక్కండి, లేదా reason రాసి {reject} చేయండి. అడిగిన వాళ్ళకి తెలుస్తుంది.", "{approve} दबाएँ, या reason लिखकर {reject} करें। माँगने वाले को बताया जाता है।"],
    ],
    whoCan: ["Requests go to the person whose role decides them, such as the class teacher, the Principal or the School Admin.", "Requests ని decide చేసేది వాటి role ఉన్నవాళ్ళు: class teacher, Principal లేదా School Admin.", "Requests वही तय करते हैं जिनका role है, जैसे class teacher, Principal या School Admin।"],
    chip: ["How do I approve requests?", "Requests ని ఎలా approve చేయాలి?", "Requests कैसे approve करें?"],
  },
};

/** Every screen word the steps name, for the test that they are still on their screens. */
export const GUIDE_LABELS: readonly Label[] = GUIDE_TASKS.flatMap((t) => Object.values(TASKS[t].labels));
/** Every page the guide links to (both forms of leave). */
export const GUIDE_PAGES: readonly string[] = [...new Set(GUIDE_TASKS.flatMap((t) => [TASKS[t].href({ permissions: { "staff-hr-management": { see: "all" } } } as unknown as GuideWho), TASKS[t].href({ permissions: { "staff-hr-management": { see: "own" } } } as unknown as GuideWho)]))];

/** "How do I take attendance?" in the conversation's language: a suggestion the guide understands again. */
export const howToChip = (task: GuideTask, lang: AssistantLang) => TASKS[task].chip[AT[lang]];

/** May this person do the task (their role's permissions and the school's switched-on modules)? */
export const taskAllowed = (who: GuideWho, task: GuideTask) => TASKS[task].may(who);

/* ---------- The software in short ---------- */

const MODULE_LINE: Record<ModuleKey | "approvals", Three> = {
  dashboard: ["what is happening today and what needs your attention", "ఈరోజు school లో ఏం జరుగుతోంది, ఏది చూడాలి", "आज स्कूल में क्या हो रहा है, किस पर ध्यान देना है"],
  "admission-management": ["enquiries, applications and admissions", "Enquiries, applications, admissions అన్నీ ఇక్కడే", "enquiry, application और admission यहाँ"],
  "student-management": ["every student and parent, and the Student Profile", "ప్రతి student, parents details, Student Profile ఇక్కడ", "हर student और parent की details, Student Profile"],
  "academic-management": ["classes, sections, subjects and the Time Table", "Classes, sections, subjects, Time Table ఇక్కడ ఉంటాయి", "classes, sections, subjects और Time Table यहाँ"],
  "attendance-management": ["take attendance and see who is absent", "Attendance తీసుకోవడం, ఎవరు absent అని చూడడం", "attendance लेना और कौन absent है देखना"],
  "fee-management": ["collect fees, give receipts and see who owes fees", "Fee collect చేయడం, receipt, fees pending ఎవరికి అని చూడడం", "fee लेना, receipt देना, किसकी fees बाकी है देखना"],
  "finance-management": ["the Day Book, expenses and income", "Day Book, expenses, income ఇక్కడ చూసుకోవచ్చు", "Day Book, expenses और income यहाँ"],
  "examination-results": ["datesheets, marks entry, results and report cards", "Datesheet, marks entry, results, report cards ఇక్కడే", "datesheet, marks entry, results और report cards यहाँ"],
  "staff-hr-management": ["staff records and staff leave", "Staff details, staff leave ఇక్కడ ఉంటాయి", "staff की details और staff leave"],
  "salary-management": ["monthly salary and salary slips", "Monthly salary, salary slips ఇక్కడ", "monthly salary और salary slips यहाँ"],
  communication: ["messages and notices to parents and staff", "Parents కి, staff కి messages, notices పంపడం", "parents और staff को messages और notices भेजना"],
  "transport-management": ["buses, routes and stops", "Buses, routes, stops ఇక్కడ చూసుకోవచ్చు", "buses, routes और stops यहाँ"],
  "library-management": ["books, issue and return", "Books issue, return ఇక్కడ చేయవచ్చు", "books issue और return यहाँ"],
  "inventory-management": ["stock, issues and purchases", "Stock, issues, purchases ఇక్కడ చూసుకోవచ్చు", "stock, issues और purchases यहाँ"],
  "hostel-management": ["rooms, beds and roll call", "Rooms, beds, roll call ఇక్కడ", "rooms, beds और roll call यहाँ"],
  "front-office": ["visitors, gate passes and pickups", "Visitors, gate pass, student pickup ఇక్కడ", "visitors, gate pass और pickup यहाँ"],
  "homework-learning": ["give homework and check what is handed in", "Homework ఇవ్వడం, submit అయినవి check చేయడం", "homework देना और जमा हुआ check करना"],
  "events-calendar": ["events, PTMs and the School Calendar", "Events, PTM, School Calendar ఇక్కడ", "events, PTM और School Calendar यहाँ"],
  "reports-analytics": ["every report and the early warnings", "అన్ని reports, early warnings ఒకే చోట", "सारी reports और early warnings एक जगह"],
  settings: ["the school profile, users and permissions", "School profile, users, permissions ఇక్కడ మార్చవచ్చు", "school profile, users और permissions यहाँ बदलें"],
  approvals: ["leave, discounts and expenses waiting for your decision", "మీ decision కోసం waiting లో ఉన్న leave, discounts, expenses", "आपके फ़ैसले के लिए रुकी leave, discounts और expenses"],
};

/** Most used first, for the person's first role that has an order; then the side menu's order. */
const ORDER: Record<string, readonly (ModuleKey | "approvals")[]> = {
  principal: ["dashboard", "approvals", "attendance-management", "fee-management", "examination-results", "communication", "student-management", "staff-hr-management", "reports-analytics", "admission-management"],
  "vice-principal": ["dashboard", "approvals", "attendance-management", "examination-results", "communication", "student-management", "academic-management", "reports-analytics"],
  "school-admin": ["dashboard", "student-management", "admission-management", "fee-management", "attendance-management", "communication", "staff-hr-management", "settings", "approvals"],
  accountant: ["fee-management", "finance-management", "salary-management", "student-management", "dashboard", "reports-analytics", "communication", "approvals"],
  teacher: ["attendance-management", "homework-learning", "examination-results", "communication", "student-management", "academic-management", "events-calendar", "dashboard", "approvals"],
  "class-teacher": ["attendance-management", "homework-learning", "examination-results", "communication", "student-management", "academic-management", "events-calendar", "dashboard", "approvals"],
  receptionist: ["front-office", "admission-management", "student-management", "communication", "dashboard", "events-calendar"],
  "transport-in-charge": ["transport-management", "dashboard", "communication", "events-calendar"],
  librarian: ["library-management", "dashboard", "student-management", "events-calendar"],
  "hostel-warden": ["hostel-management", "dashboard", "student-management", "events-calendar"],
  "store-keeper": ["inventory-management", "dashboard", "events-calendar"],
};

/** The modules this person opens (the side menu's own rule), plus Approvals for people who may approve, most used first. */
function placesFor(who: GuideWho): (ModuleKey | "approvals")[] {
  const menuKeys = menuModules(who.permissions, who.modulesOn).map((m) => m.key);
  const all: (ModuleKey | "approvals")[] = [...menuKeys, ...(mayApprove(who, 0) ? ["approvals" as const] : [])];
  const order = who.roles.map((r) => ORDER[r.key ?? ""]).find(Boolean) ?? [];
  return [...new Set([...order.filter((k) => all.includes(k)), ...all])];
}

/* ---------- Writing the reply ---------- */

const W = {
  intro: ["School OS keeps your school's daily work in one place. Here is what you can open:", "School OS లో school పని అంతా ఒకే చోట ఉంటుంది. మీ role కి ఇవి open అవుతాయి:", "School OS में स्कूल का सारा काम एक जगह है। आपके role के लिए ये खुलते हैं:"],
  invite: ["Ask me how to do any of it, for example: {example}", "ఏ పని ఎలా చేయాలో నన్ను అడగండి, ఉదాహరణకు: {example}", "कोई भी काम कैसे करें, मुझसे पूछिए, जैसे: {example}"],
  inviteOnly: ["Ask me how to do any of it.", "ఏ పని ఎలా చేయాలో నన్ను అడగండి.", "कोई भी काम कैसे करें, मुझसे पूछिए।"],
  lead: ["Here is how:", "ఇలా చేయండి:", "ऐसे करें:"],
  notYours: ["It is not part of your role.", "ఇది మీ role లో లేదు.", "यह आपकी भूमिका में नहीं है।"],
  openPage: ["Open {name}", "{name} ఓపెన్ చేయండి", "{name} खोलें"],
} as const satisfies Record<string, Three>;

const say = (lang: AssistantLang, three: Three, vars?: Record<string, string>) => fill(three[AT[lang]], vars);

/** A screen word as the person's screen shows it: a list blank after a colon is left out ("Save attendance"), any other blank is "…". */
function shown(t: T, key: MessageKey): string {
  return t(key).replace(/\s*:\s*\{\w+\}/g, "").replace(/\{\w+\}/g, "…").trim();
}

const nameOf = (t: T, key: ModuleKey | "approvals") => (key === "approvals" ? shown(t, "Approvals") : t.any(MODULES.find((m) => m.key === key)!.short));

/** The tasks this person may do, most used first. */
function tasksFor(who: GuideWho): GuideTask[] {
  const places = placesFor(who);
  const rank = (t: GuideTask) => { const i = places.indexOf(TASKS[t].module); return i < 0 ? 99 : i; };
  return GUIDE_TASKS.filter((t) => TASKS[t].may(who)).sort((a, b) => rank(a) - rank(b) || GUIDE_TASKS.indexOf(a) - GUIDE_TASKS.indexOf(b));
}

/**
 * The guide's reply in the conversation's language, with the screen words in the person's screen
 * language (`screen`, the language their menus and buttons are in), so a step says exactly what they see.
 */
export function guideReply(who: GuideWho, intent: GuideIntent, lang: AssistantLang, screen: string = "en"): GuideReply {
  const t = makeT(cleanLang(screen) as Lang);
  const doable = tasksFor(who);
  const landing = landingFor(who as unknown as Parameters<typeof landingFor>[0]);
  if (intent.kind === "overview") {
    const places = placesFor(who).slice(0, 8);
    const lines = places.map((k) => `${nameOf(t, k)}: ${say(lang, MODULE_LINE[k])}`);
    const example = doable[0];
    const end = example ? say(lang, W.invite, { example: howToChip(example, lang) }) : say(lang, W.inviteOnly);
    return {
      reply: [say(lang, W.intro), ...lines, end].join("\n"),
      sources: places.map((k) => ({ label: say(lang, W.openPage, { name: nameOf(t, k) }), href: k === "approvals" ? "/approvals" : landing[k] ?? `/${k}`, scope: null })),
      chips: doable.slice(0, 3).map((x) => howToChip(x, lang)),
      may: true,
    };
  }
  const task = TASKS[intent.task];
  const others = doable.filter((x) => x !== intent.task).slice(0, 3).map((x) => howToChip(x, lang));
  if (!task.may(who)) return { reply: `${say(lang, task.whoCan)} ${say(lang, W.notYours)}`, sources: [], chips: others, may: false };
  const vars = Object.fromEntries(Object.entries(task.labels).map(([k, l]) => [k, shown(t, l.text)]));
  const steps = task.steps(who).slice(0, 5).map((s, i) => `${i + 1}. ${say(lang, s, vars)}`);
  const page = vars[task.page] ?? englishOf(task.page);
  return {
    reply: [say(lang, W.lead), ...steps].join("\n"),
    sources: [{ label: say(lang, W.openPage, { name: page }), href: task.href(who), scope: null }],
    chips: others,
    may: true,
  };
}
