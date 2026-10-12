// Modules, their pages and who sees what. Page names match docs/blueprint/modules exactly.
// Access marks come from docs/blueprint/05-roles.md: 'full', 'view', 'own' or missing (not in menu).

export const MODULES = {
  dashboard: { short: 'Dashboard', pages: [] },
  admissions: { short: 'Admissions', def: 'dashboard', pages: [
    ['dashboard', 'Admission Dashboard'], ['enquiries', 'Enquiries'], ['applications', 'Applications'], ['documents', 'Documents & Verification'],
    ['tests', 'Test & Interview'], ['decision', 'Admission Decision'], ['reports', 'Admission Reports'], ['settings', 'Admission Settings'],
  ] },
  students: { short: 'Students', def: 'list', pages: [
    ['list', 'Student List'], ['parents', 'Parents & Guardians'], ['behaviour', 'Behaviour & Counselling'], ['promotion', 'Promotion'],
    ['leaving', 'Leaving & Alumni'], ['certificates', 'Certificates & ID Cards'], ['settings', 'Student Settings'],
  ] },
  academic: { short: 'Academics', def: 'timetable', pages: [
    ['classes', 'Classes & Sections'], ['subjects', 'Subjects'], ['allocation', 'Teacher Allocation'], ['timetable', 'Time Table'],
    ['substitutions', 'Substitutions'], ['syllabus', 'Syllabus & Lesson Plans'], ['settings', 'Academic Settings'],
  ] },
  attendance: { short: 'Attendance', def: 'take', pages: [
    ['take', 'Take Attendance'], ['register', 'Attendance Register'], ['leave', 'Student Leave'], ['staff', 'Staff Attendance'],
    ['reports', 'Attendance Reports'], ['devices', 'Devices & QR'], ['settings', 'Attendance Settings'],
  ] },
  fees: { short: 'Fees', def: 'collect', pages: [
    ['dashboard', 'Fee Dashboard'], ['collect', 'Collect Fee'], ['ledger', 'Student Fee Ledger'], ['defaulters', 'Defaulters'],
    ['structure', 'Fee Structure'], ['concessions', 'Concessions & Refunds'], ['reports', 'Fee Reports'], ['settings', 'Fee Settings'],
  ] },
  finance: { short: 'Finance', def: 'daybook', pages: [
    ['daybook', 'Day Book'], ['income', 'Income'], ['expenses', 'Expenses'], ['cashbank', 'Cash & Bank'],
    ['budget', 'Budget'], ['accounts', 'Accounts'], ['reports', 'Finance Reports'], ['settings', 'Finance Settings'],
  ] },
  exams: { short: 'Exams & Results', def: 'datesheet', pages: [
    ['datesheet', 'Datesheet'], ['admitcards', 'Admit Cards'], ['marks', 'Marks Entry'], ['results', 'Results'],
    ['reportcards', 'Report Cards'], ['papers', 'Question Papers'], ['analysis', 'Exam Analysis'], ['settings', 'Exam Settings'],
  ] },
  staff: { short: 'Staff & HR', def: 'list', pages: [
    ['list', 'Staff List'], ['profile', 'Staff Profile'], ['add', 'Add Staff'], ['leave', 'Staff Leave'], ['documents', 'Documents & ID Cards'],
    ['recruitment', 'Recruitment & Appraisal'], ['exit', 'Staff Exit'], ['settings', 'HR Settings'],
  ] },
  salary: { short: 'Salary', def: 'generate', pages: [
    ['generate', 'Generate Salary'], ['structures', 'Salary Structures'], ['slips', 'Salary Slips'], ['advances', 'Advances & Loans'],
    ['history', 'Salary History'], ['settings', 'Salary Settings'],
  ] },
  communication: { short: 'Communication', def: 'send', pages: [
    ['send', 'Send Message'], ['notices', 'Notice Board'], ['inbox', 'WhatsApp Inbox'], ['history', 'Message History'],
    ['feedback', 'Feedback & Queries'], ['surveys', 'Surveys'], ['templates', 'Message Templates'], ['parentlink', 'Parent Link'], ['settings', 'Message Settings'],
  ] },
  transport: { short: 'Transport', optional: true, def: 'live', pages: [
    ['live', 'Live Tracking'], ['routes', 'Routes & Stops'], ['vehicles', 'Vehicles & Drivers'], ['students', 'Student Transport'],
    ['trips', 'Trips'], ['reports', 'Transport Reports'], ['settings', 'Transport Settings'],
  ] },
  library: { short: 'Library', optional: true, def: 'issue', pages: [
    ['books', 'Books'], ['issue', 'Issue & Return'], ['members', 'Members & Cards'], ['fines', 'Fines & Stock Check'],
    ['reports', 'Library Reports'], ['settings', 'Library Settings'],
  ] },
  inventory: { short: 'Inventory', optional: true, def: 'items', pages: [
    ['items', 'Items & Stock'], ['issue', 'Issue Stock'], ['purchases', 'Purchases & Vendors'], ['assets', 'Assets'],
    ['rooms', 'Rooms, Labs & Maintenance'], ['reports', 'Inventory Reports'], ['settings', 'Inventory Settings'],
  ] },
  hostel: { short: 'Hostel', optional: true, def: 'rollcall', pages: [
    ['rooms', 'Rooms & Beds'], ['allocation', 'Allocation'], ['rollcall', 'Roll Call & Incidents'], ['outing', 'Outing & Visitors'],
    ['mess', 'Mess'], ['reports', 'Hostel Reports'], ['settings', 'Hostel Settings'],
  ] },
  frontoffice: { short: 'Front Office', def: 'desk', pages: [
    ['desk', 'Reception Desk'], ['visitors', 'Visitors'], ['pickup', 'Student Pickup'], ['enquiries', 'Enquiries & Calls'],
    ['appointments', 'Appointments'], ['postal', 'Postal & Deliveries'],
  ] },
  homework: { short: 'Homework & Learning', def: 'homework', pages: [
    ['homework', 'Homework'], ['submissions', 'Submissions & Grading'], ['material', 'Study Material'], ['quizzes', 'Quizzes'],
    ['discussions', 'Discussions'], ['online', 'Online Classes'], ['progress', 'Learning Progress'], ['settings', 'Homework Settings'],
  ] },
  events: { short: 'Events & Calendar', def: 'calendar', pages: [
    ['calendar', 'School Calendar'], ['events', 'Events'], ['ptm', 'PTM'], ['cocurricular', 'Co-curricular & Sports'],
    ['gallery', 'Gallery'], ['daily', 'Daily Activities'], ['settings', 'Events Settings'],
  ] },
  reports: { short: 'Reports & Analytics', def: 'all', pages: [
    ['all', 'All Reports'], ['analytics', 'Analytics'], ['warnings', 'Early Warnings'], ['government', 'Government Reports'], ['custom', 'Custom & Scheduled Reports'],
  ] },
  settings: { short: 'Settings', def: 'profile', pages: [
    ['profile', 'School Profile'], ['users', 'Users & Permissions'], ['gateways', 'Payment Gateways'], ['messaging', 'SMS, WhatsApp & Email'],
    ['designs', 'Document Designs'], ['forms', 'Forms & Approvals'], ['modules', 'Modules On/Off'], ['security', 'Data Backup & Security'],
  ] },
};

// Pages a role with View or Own access gets, and the labels they see. Full access gets every page.
const VIEW = {
  admissions: ['dashboard', 'enquiries', 'applications', 'reports'],
  students: ['list'],
  academic: ['classes', 'subjects', 'timetable'],
  attendance: ['register', 'reports'],
  fees: ['dashboard', 'defaulters', 'reports'],
  finance: ['daybook', 'income', 'expenses', 'cashbank', 'budget', 'reports'],
  staff: ['list', 'leave', 'documents'],
  salary: ['generate', 'history'],
  transport: ['live', 'routes', 'vehicles', 'students', 'trips', 'reports'],
  library: ['books', 'members', 'reports'],
  inventory: ['items', 'purchases', 'assets', 'reports'],
  hostel: ['rooms', 'allocation', 'rollcall', 'outing', 'mess', 'reports'],
  frontoffice: ['desk', 'visitors', 'pickup', 'appointments'],
  events: ['calendar', 'events', 'gallery'],
  reports: ['all', 'analytics'],
};
const OWN = {
  admissions: ['enquiries'],
  students: ['list', 'behaviour'],
  academic: ['timetable', 'substitutions', 'syllabus'],
  attendance: ['take', 'register'],
  exams: ['datesheet', 'marks', 'results'],
  staff: ['profile', 'leave', 'documents'],
  salary: ['slips'],
  communication: ['send', 'notices', 'inbox', 'history'],
  transport: ['trips'],
  frontoffice: ['visitors', 'pickup'],
  homework: ['homework', 'submissions', 'material', 'quizzes', 'discussions', 'online', 'progress'],
  events: ['calendar', 'events', 'ptm', 'daily'],
  reports: ['all', 'warnings'],
};
// A few roles have their own "Own" slice (from the notes in 05-roles.md)
const OWN_BY_ROLE = {
  teacher: { academic: ['timetable', 'syllabus'] },
  classteacher: { academic: ['timetable', 'syllabus'], students: ['list', 'behaviour', 'promotion'], attendance: ['take', 'register', 'leave'], exams: ['datesheet', 'marks', 'results', 'reportcards'] },
  warden: { students: ['list'] },
  counsellor: { students: ['behaviour'] },
  hr: { attendance: ['staff'] },
  officestaff: { attendance: ['leave'], academic: ['timetable', 'substitutions'], exams: ['datesheet', 'admitcards'] },
  student: { homework: ['homework', 'material', 'quizzes', 'discussions', 'online'] },
};
const OWN_LABELS = { staff: { profile: 'My Profile', leave: 'My Leave', documents: 'My Documents' }, salary: { slips: 'My Salary Slips' } };

// Staff & HR and Salary with Own access are only the person's own leave, documents and slips.
// They live under My profile, not in the menu (owner's request, 12 Oct 2026).
export const PERSONAL = ['staff', 'salary'];
export const inMenu = (role, id) => { const a = role.access[id]; return !!a && !(a === 'own' && PERSONAL.includes(id)); };

export function pagesFor(mod, access, roleId) {
  const m = MODULES[mod];
  if (!m || !access) return [];
  let ids = m.pages.map((p) => p[0]);
  if (access === 'view') ids = VIEW[mod] || ids.filter((i) => i !== 'settings');
  if (access === 'own') ids = OWN_BY_ROLE[roleId]?.[mod] || OWN[mod] || ids.filter((i) => i !== 'settings');
  if (access === 'full' && mod === 'staff') ids = ids.filter((i) => i !== 'profile');
  return m.pages.filter((p) => ids.includes(p[0])).map(([id, label]) => ({ id, label: (access === 'own' && OWN_LABELS[mod]?.[id]) || label }));
}

const F = 'full', V = 'view', O = 'own';
const ALL = Object.fromEntries(Object.keys(MODULES).map((k) => [k, F]));

// Every person used in the preview. Names are example staff of Sunrise Public School.
export const ROLES = [
  { id: 'principal', label: 'Principal', group: 'ready', person: { name: 'Lakshmi Rao', first: 'Lakshmi', role: 'Principal', email: 'lakshmi.rao@sunriseps.in', phone: '98480 22145' },
    access: ALL, approves: true, multiSchool: true },
  { id: 'schooladmin', label: 'School Admin', group: 'ready', person: { name: 'Anita Sharma', first: 'Anita', role: 'School Admin', email: 'office@sunriseps.in', phone: '98490 11223' },
    access: ALL, approves: true, multiSchool: true },
  { id: 'accountant', label: 'Accountant', group: 'ready', person: { name: 'Suresh Babu', first: 'Suresh', role: 'Accountant', email: 'accounts@sunriseps.in', phone: '98663 40128' },
    access: { dashboard: O, students: V, fees: F, finance: F, staff: O, salary: F, communication: O, inventory: V, events: V, reports: V } },
  { id: 'teacher', label: 'Teacher', group: 'ready', person: { name: 'Imran Shaikh', first: 'Imran', role: 'Teacher · Mathematics', email: 'imran.s@sunriseps.in', phone: '99482 77310' },
    access: { dashboard: O, students: O, academic: O, attendance: O, exams: O, staff: O, salary: O, communication: O, homework: O, events: O, reports: O } },
  { id: 'classteacher', label: 'Class Teacher', group: 'ready', person: { name: 'Ravi Teja', first: 'Ravi', role: 'Class Teacher · 7 B', email: 'ravi.teja@sunriseps.in', phone: '97010 45512' },
    access: { dashboard: O, students: O, academic: O, attendance: O, exams: O, staff: O, salary: O, communication: O, homework: O, events: O, reports: O }, approves: true },
  { id: 'receptionist', label: 'Receptionist / Front Office', group: 'ready', person: { name: 'Kavitha Nair', first: 'Kavitha', role: 'Receptionist', email: 'reception@sunriseps.in', phone: '90300 66184' },
    access: { dashboard: O, admissions: O, students: V, staff: O, salary: O, communication: O, frontoffice: F, events: V } },
  { id: 'transport', label: 'Transport In-charge', group: 'ready', person: { name: 'Venkatesh Goud', first: 'Venkatesh', role: 'Transport In-charge', email: 'transport@sunriseps.in', phone: '98852 30917' },
    access: { dashboard: O, staff: O, salary: O, communication: O, transport: F, events: V } },
  { id: 'librarian', label: 'Librarian', group: 'ready', person: { name: 'Padma Iyer', first: 'Padma', role: 'Librarian', email: 'library@sunriseps.in', phone: '94401 88236' },
    access: { dashboard: O, students: V, staff: O, salary: O, library: F, events: V } },
  { id: 'warden', label: 'Hostel Warden', group: 'ready', person: { name: 'Joseph Thomas', first: 'Joseph', role: 'Hostel Warden · Boys', email: 'hostel@sunriseps.in', phone: '96180 22709' },
    access: { dashboard: O, students: O, staff: O, salary: O, hostel: F, events: V }, approves: true },
  { id: 'storekeeper', label: 'Store Keeper', group: 'ready', person: { name: 'Ramu Yadav', first: 'Ramu', role: 'Store Keeper', email: 'store@sunriseps.in', phone: '93910 50442' },
    access: { dashboard: O, staff: O, salary: O, inventory: F, events: V } },
  // Role templates the school can switch on in Settings, Users & Permissions
  { id: 'vp', label: 'Vice Principal', group: 'template', person: { name: 'Srinivas Murthy', first: 'Srinivas', role: 'Vice Principal', email: 'vp@sunriseps.in', phone: '98490 70021' },
    access: { dashboard: F, admissions: V, students: F, academic: F, attendance: F, fees: V, finance: V, exams: F, staff: V, salary: O, communication: F, transport: V, library: V, inventory: V, hostel: V, frontoffice: V, homework: F, events: F, reports: V }, approves: true },
  { id: 'academichead', label: 'Academic Head', group: 'template', person: { name: 'Meena Pillai', first: 'Meena', role: 'Academic Head', email: 'academics@sunriseps.in', phone: '94900 31275' },
    access: { dashboard: O, students: V, academic: F, attendance: V, exams: F, staff: O, salary: O, communication: O, homework: F, events: V, reports: V } },
  { id: 'hr', label: 'HR', group: 'template', person: { name: 'Shalini Verma', first: 'Shalini', role: 'HR', email: 'hr@sunriseps.in', phone: '95020 18834' },
    access: { dashboard: O, attendance: O, staff: F, salary: V, communication: O, events: V, reports: V } },
  { id: 'officestaff', label: 'Office Staff', group: 'template', person: { name: 'Naveen Kumar', first: 'Naveen', role: 'Office Staff', email: 'naveen.k@sunriseps.in', phone: '90100 27745' },
    access: { dashboard: O, admissions: F, students: F, academic: O, attendance: O, exams: O, staff: O, salary: O, communication: O, frontoffice: V, events: V } },
  { id: 'examincharge', label: 'Exam In-charge', group: 'template', person: { name: 'Prakash Joshi', first: 'Prakash', role: 'Exam In-charge', email: 'exams@sunriseps.in', phone: '98481 62290' },
    access: { dashboard: O, students: V, academic: V, exams: F, staff: O, salary: O, communication: O, events: V, reports: V } },
  { id: 'admissioncounsellor', label: 'Admission Counsellor', group: 'template', person: { name: 'Divya Menon', first: 'Divya', role: 'Admission Counsellor', email: 'admissions@sunriseps.in', phone: '96660 41208' },
    access: { dashboard: O, admissions: F, students: V, fees: V, staff: O, salary: O, communication: O, events: V, reports: V } },
  { id: 'counsellor', label: 'Counsellor', group: 'template', person: { name: 'Sana Ali', first: 'Sana', role: 'Counsellor', email: 'counsellor@sunriseps.in', phone: '97040 55391' },
    access: { dashboard: O, students: O, staff: O, salary: O, communication: O, events: V } },
  { id: 'gatesecurity', label: 'Gate Security', group: 'template', person: { name: 'Bhaskar Rao', first: 'Bhaskar', role: 'Gate Security', email: '', phone: '99630 12874' },
    access: { dashboard: O, students: V, staff: O, salary: O, frontoffice: O, events: V } },
  { id: 'student', label: 'Student', group: 'template', person: { name: 'Aarav Sharma', first: 'Aarav', role: 'Student · 7 B', email: '', phone: '' },
    access: { homework: O } },
];
export const ROLE = Object.fromEntries(ROLES.map((r) => [r.id, r]));

// Phone bottom bar per role: the 4 things each person does most. The big one is the role's main action.
export const BOTTOM = {
  principal: [['dashboard', 'Home', 'House'], ['students', 'Students', 'GraduationCap'], ['fees', 'Collect', 'IndianRupee', 1], ['attendance', 'Attendance', 'CalendarCheck2']],
  schooladmin: [['dashboard', 'Home', 'House'], ['students', 'Students', 'GraduationCap'], ['fees', 'Collect', 'IndianRupee', 1], ['attendance', 'Attendance', 'CalendarCheck2']],
  vp: [['dashboard', 'Home', 'House'], ['students', 'Students', 'GraduationCap'], ['attendance', 'Attendance', 'CalendarCheck2', 1], ['exams', 'Exams', 'ClipboardCheck']],
  accountant: [['dashboard', 'Home', 'House'], ['fees.defaulters', 'Defaulters', 'UserX'], ['fees', 'Collect', 'IndianRupee', 1], ['finance', 'Day Book', 'BookOpen']],
  teacher: [['dashboard', 'Home', 'House'], ['academic', 'Time Table', 'CalendarRange'], ['attendance', 'Attendance', 'CalendarCheck2', 1], ['homework', 'Homework', 'NotebookPen']],
  classteacher: [['dashboard', 'Home', 'House'], ['students', 'My class', 'GraduationCap'], ['attendance', 'Attendance', 'CalendarCheck2', 1], ['exams.marks', 'Marks', 'ClipboardCheck']],
  receptionist: [['dashboard', 'Home', 'House'], ['frontoffice.visitors', 'Visitors', 'IdCard'], ['frontoffice.desk', 'Desk', 'DoorOpen', 1], ['frontoffice.pickup', 'Pickup', 'Users']],
  transport: [['dashboard', 'Home', 'House'], ['transport.routes', 'Routes', 'Route'], ['transport.live', 'Live', 'Bus', 1], ['transport.trips', 'Trips', 'ListChecks']],
  librarian: [['dashboard', 'Home', 'House'], ['library.books', 'Books', 'BookOpen'], ['library.issue', 'Issue', 'ArrowRightLeft', 1], ['library.fines', 'Fines', 'IndianRupee']],
  warden: [['dashboard', 'Home', 'House'], ['hostel.rooms', 'Rooms', 'BedDouble'], ['hostel.rollcall', 'Roll call', 'ListChecks', 1], ['hostel.outing', 'Outings', 'DoorOpen']],
  storekeeper: [['dashboard', 'Home', 'House'], ['inventory.items', 'Stock', 'Boxes'], ['inventory.issue', 'Issue', 'PackageMinus', 1], ['inventory.purchases', 'Purchases', 'ShoppingCart']],
  academichead: [['dashboard', 'Home', 'House'], ['academic', 'Time Table', 'CalendarRange'], ['exams', 'Exams', 'ClipboardCheck', 1], ['homework', 'Homework', 'NotebookPen']],
  hr: [['dashboard', 'Home', 'House'], ['staff', 'Staff', 'Users'], ['staff.leave', 'Leave', 'CalendarDays', 1], ['attendance', 'Attendance', 'CalendarCheck2']],
  officestaff: [['dashboard', 'Home', 'House'], ['students', 'Students', 'GraduationCap'], ['admissions', 'Admissions', 'UserPlus', 1], ['attendance', 'Leave', 'CalendarCheck2']],
  examincharge: [['dashboard', 'Home', 'House'], ['exams.datesheet', 'Datesheet', 'CalendarDays'], ['exams.marks', 'Marks', 'ClipboardCheck', 1], ['exams.reportcards', 'Reports', 'Award']],
  admissioncounsellor: [['dashboard', 'Home', 'House'], ['admissions.enquiries', 'Enquiries', 'PhoneIncoming'], ['admissions.applications', 'Apply', 'FileText', 1], ['admissions.tests', 'Tests', 'ClipboardCheck']],
  counsellor: [['dashboard', 'Home', 'House'], ['students.behaviour', 'Cases', 'HeartHandshake', 1], ['communication', 'Messages', 'MessagesSquare'], ['events', 'Calendar', 'CalendarDays']],
  gatesecurity: [['dashboard', 'Home', 'House'], ['frontoffice.visitors', 'Visitors', 'IdCard', 1], ['frontoffice.pickup', 'Pickup', 'Users'], ['events', 'Calendar', 'CalendarDays']],
  student: [['homework', 'Homework', 'NotebookPen', 1], ['homework.quizzes', 'Quizzes', 'ListChecks'], ['homework.material', 'Material', 'FolderOpen'], ['homework.online', 'Classes', 'Video']],
};

// Quick actions ("New") per role. id is a route ('module.page'), or 'add-student'.
export const QUICK_BY_ROLE = {
  accountant: [
    ['fees', 'Collect fee', 'Find a student and take payment', 'IndianRupee'], ['finance.expenses', 'Record expense', 'Bills, purchases, petty cash', 'ReceiptText'],
    ['fees.defaulters', 'Send fee reminders', '61 families are overdue', 'Send'], ['finance.daybook', 'Close the day', 'Count cash and lock the Day Book', 'BookOpen'],
  ],
  teacher: [
    ['attendance', 'Take attendance', '6 A is your first class today', 'CalendarCheck2'], ['homework', 'Give homework', 'Class, subject, due date and done', 'NotebookPen'],
    ['exams.marks', 'Enter marks', 'Half-yearly marks open on 17 Oct', 'ClipboardCheck'], ['communication', 'Message parents', 'Only parents of your classes', 'Send'],
  ],
  classteacher: [
    ['attendance', 'Take attendance', 'Class 7 B is waiting for today', 'CalendarCheck2'], ['attendance.leave', 'Record student leave', 'A parent called or wrote', 'CalendarDays'],
    ['homework', 'Give homework', 'Class, subject, due date and done', 'NotebookPen'], ['communication', 'Message 7 B parents', 'WhatsApp, with SMS backup', 'Send'],
  ],
  receptionist: [
    ['frontoffice.visitors', 'Add visitor', 'Name, phone, whom to meet', 'IdCard'], ['admissions.enquiries', 'Add enquiry', 'A parent asked about admission', 'PhoneIncoming'],
    ['frontoffice.pickup', 'Pickup gate pass', 'Early pickup by a parent', 'DoorOpen'], ['frontoffice.postal', 'Log a delivery', 'Post, courier or parcel', 'Package'],
  ],
  transport: [
    ['transport.live', 'See live buses', '9 buses on the road', 'Bus'], ['communication', 'Message a route', 'Parents of one route', 'Send'],
    ['transport.trips', 'Trips today', '18 morning trips done', 'ListChecks'], ['transport.vehicles', 'Add vehicle paper', 'Insurance, fitness, permit', 'FileText'],
  ],
  librarian: [
    ['library.issue', 'Issue a book', 'Scan the book and the card', 'ArrowRightLeft'], ['library.issue', 'Return a book', 'Fine worked out by itself', 'CornerDownLeft'],
    ['library.books', 'Add a book', 'Type the ISBN, details fill in', 'BookPlus'], ['library.fines', 'Collect a fine', '11 members owe fines', 'IndianRupee'],
  ],
  warden: [
    ['hostel.rollcall', 'Night roll call', 'Boys hostel, 9:30 PM', 'ListChecks'], ['hostel.outing', 'Approve outing', '3 requests waiting', 'DoorOpen'],
    ['hostel.outing', 'Add visitor', 'Parent visiting a boarder', 'IdCard'], ['hostel.rollcall', 'Report an incident', 'Health, discipline or damage', 'TriangleAlert'],
  ],
  storekeeper: [
    ['inventory.issue', 'Issue stock', 'To a class, lab or staff member', 'PackageMinus'], ['inventory.purchases', 'Receive goods', 'Against a purchase order', 'PackagePlus'],
    ['inventory.purchases', 'New purchase order', '4 items are below reorder level', 'ShoppingCart'], ['inventory.rooms', 'Maintenance request', 'Something is broken', 'Wrench'],
  ],
  vp: [
    ['attendance', 'Take attendance', 'Class 7 B is waiting for today', 'CalendarCheck2'], ['add-student', 'Add student', 'Name, class and parent phone is enough', 'UserPlus'],
    ['communication', 'Send message', 'WhatsApp, SMS or notice to parents', 'Send'], ['academic.substitutions', 'Arrange substitute', '2 periods have no teacher today', 'ArrowRightLeft'],
    ['exams.marks', 'Marks progress', 'Half-yearly marks open on 17 Oct', 'ClipboardCheck'], ['events.events', 'Add event', 'Function, trip or competition', 'CalendarPlus'],
  ],
  academichead: [
    ['academic.substitutions', 'Arrange substitute', '2 periods have no teacher today', 'ArrowRightLeft'], ['academic.timetable', 'Change the Time Table', 'Exam-week time table is due Sat', 'CalendarRange'],
    ['exams.papers', 'Check question papers', '6 papers are not in yet', 'FileText'], ['homework.progress', 'Homework load', 'Homework given across classes', 'NotebookPen'],
  ],
  hr: [
    ['staff.add', 'Add staff', 'Name, role and phone to start', 'UserPlus'], ['staff.leave', 'Record staff leave', 'Someone called in sick', 'CalendarDays'],
    ['attendance.staff', 'Staff attendance', '82 of 86 are in today', 'CalendarCheck2'], ['staff.documents', 'Add a staff document', 'Licence, police check, certificate', 'FileText'],
  ],
  officestaff: [
    ['attendance.leave', 'Record student leave', 'A parent called or wrote', 'CalendarDays'], ['admissions.enquiries', 'Add enquiry', 'A parent asked about admission', 'PhoneIncoming'],
    ['students.certificates', 'Give a certificate', 'Bonafide, TC or character', 'Award'], ['students.list', 'Add student', 'From the Student List', 'UserPlus'],
  ],
  examincharge: [
    ['exams.datesheet', 'Datesheet and seating', 'Half-yearly starts Mon 12 Oct', 'CalendarDays'], ['exams.admitcards', 'Admit cards', '74 are not printed yet', 'IdCard'],
    ['exams.marks', 'Marks progress', 'Who has not entered marks', 'ClipboardCheck'], ['exams.results', 'Publish results', 'Class 8 Unit Test 2 is ready', 'Award'],
  ],
  admissioncounsellor: [
    ['admissions.enquiries', 'Add enquiry', 'A parent asked about admission', 'PhoneIncoming'], ['admissions.applications', 'New application', 'Form, documents and fee', 'FileText'],
    ['admissions.tests', 'Book a test slot', 'Class 6 test on Sat 17 Oct', 'ClipboardCheck'], ['admissions.decision', 'Send for decision', '7 applications are ready', 'BadgeCheck'],
  ],
  counsellor: [
    ['students.behaviour', 'Record a session', 'For a case given to you', 'HeartHandshake'], ['communication.send', 'Message a parent', 'Only parents of your cases', 'Send'],
  ],
  gatesecurity: [
    ['frontoffice.visitors', 'Add visitor', 'Name, phone, whom to meet', 'IdCard'], ['frontoffice.pickup', 'Check a pickup pass', 'Early pickup by a parent', 'DoorOpen'],
  ],
  student: [
    ['homework', 'Submit homework', 'Maths exercise 4.2 is due today', 'Upload'], ['homework.quizzes', 'Take a quiz', 'Science quiz closes at 6 PM', 'ListChecks'],
  ],
};

// Approvals each person may decide (top bar Approvals)
export const APPROVALS_BY_ROLE = {
  classteacher: [
    { who: 'Priya Sharma (parent)', what: 'Student leave · Aarav Sharma, 7 B · Mon 12 Oct', kind: 'Student leave' },
    { who: 'Kumar Reddy (parent)', what: 'Student leave · Harini Reddy, 7 B · 13–14 Oct', kind: 'Student leave' },
  ],
  warden: [
    { who: 'Kabir Naidu, 9 C', what: 'Outing pass · Sat 10 Oct, 10 AM–6 PM · with father', kind: 'Outing' },
    { who: 'Arjun Verma, 8 A', what: 'Weekend home visit · 17–18 Oct', kind: 'Outing' },
    { who: 'Pranav Rao, 10 B', what: 'Outing pass · Sun 11 Oct · dentist', kind: 'Outing' },
  ],
  vp: [
    { who: 'Anitha K.', what: 'Sick leave · 13–14 Oct', kind: 'Leave' },
    { who: 'Ravi Teja', what: 'Casual leave · Mon 12 Oct', kind: 'Leave' },
  ],
};

export const SCHOOLS_IN_GROUP = [
  { id: 'kph', name: 'Sunrise Public School', place: 'Kukatpally, Hyderabad', students: 1236 },
  { id: 'myp', name: 'Sunrise Public School', place: 'Miyapur campus, Hyderabad', students: 684 },
];

// Notifications per role (Principal and School Admin use the round-1 list in data.js)
export const NOTIFS_BY_ROLE = {
  accountant: [
    { id: 1, when: '10:38 AM', title: '₹12,500 received from Saanvi Reddy (4 A)', body: 'UPI · Receipt R/26/05190', unread: true, to: 'fees.dashboard' },
    { id: 2, when: '9:47 AM', title: 'Cheque from Rohan Gupta (6 A) to verify', body: '₹15,000 · HDFC 004512', unread: true, to: 'fees.ledger' },
    { id: 3, when: 'Yesterday', title: 'Day Book for 8 Oct is not closed', body: 'Cash in hand ₹38,400 waiting to be counted', unread: false, to: 'finance.daybook' },
  ],
  teacher: [
    { id: 1, when: '9:02 AM', title: 'Substitution: 8 A, period 5', body: 'Anitha Kumari is on leave. You take English.', unread: true, to: 'academic.substitutions' },
    { id: 2, when: '8:30 AM', title: '14 homework submissions to check', body: 'Maths 6 A · Exercise 4.1', unread: true, to: 'homework.submissions' },
    { id: 3, when: 'Yesterday', title: 'Half-yearly marks entry opens 17 Oct', body: 'Mathematics · 6 A, 6 B, 7 A, 7 B', unread: false, to: 'exams.marks' },
  ],
  classteacher: [
    { id: 1, when: '8:40 AM', title: 'Priya Sharma asked for leave for Aarav', body: 'Mon 12 Oct · family function', unread: true, to: 'attendance.leave' },
    { id: 2, when: '8:31 AM', title: 'Take attendance for 7 B', body: 'Locks at 11:00 AM', unread: true, to: 'attendance' },
    { id: 3, when: 'Yesterday', title: 'Report card remarks due 20 Oct', body: '7 B · 38 students', unread: false, to: 'exams.reportcards' },
  ],
  receptionist: [
    { id: 1, when: '10:20 AM', title: 'Visitor waiting: Mr. Prakash Reddy', body: 'To meet the Principal · 10:30 appointment', unread: true, to: 'frontoffice.visitors' },
    { id: 2, when: '9:55 AM', title: 'New enquiry from the website form', body: 'Nursery 2027–28 · Swathi Varma', unread: true, to: 'admissions.enquiries' },
    { id: 3, when: 'Yesterday', title: 'Courier for Accounts not collected', body: 'Blue Dart · arrived 3:10 PM', unread: false, to: 'frontoffice.postal' },
  ],
  transport: [
    { id: 1, when: '7:52 AM', title: 'Bus 3 is 14 minutes late', body: 'Route 3 · Bachupally · traffic at Pragathi Nagar', unread: true, to: 'transport.live' },
    { id: 2, when: 'Yesterday', title: 'Bus 5 insurance ends in 12 days', body: 'TS 08 UC 4410 · renew by 21 Oct', unread: true, to: 'transport.vehicles' },
  ],
  librarian: [
    { id: 1, when: '9:10 AM', title: '23 books overdue this week', body: 'Reminders went to parents on WhatsApp', unread: true, to: 'library.issue' },
    { id: 2, when: 'Yesterday', title: 'Book request: “Wings of Fire”', body: 'From Kavya Rao, 5 A', unread: false, to: 'library.books' },
  ],
  warden: [
    { id: 1, when: '8:05 AM', title: '3 outing requests waiting', body: 'Saturday and Sunday outings', unread: true, to: 'hostel.outing' },
    { id: 2, when: 'Yesterday', title: 'Night roll call: 2 late returns', body: 'Room B-12 and B-17', unread: false, to: 'hostel.rollcall' },
  ],
  storekeeper: [
    { id: 1, when: '9:30 AM', title: '4 items below reorder level', body: 'A4 paper, chalk, whiteboard markers, sanitiser', unread: true, to: 'inventory.items' },
    { id: 2, when: 'Yesterday', title: 'Maintenance request: Physics lab fan', body: 'From Farhana Begum', unread: true, to: 'inventory.rooms' },
  ],
  vp: [
    { id: 1, when: '8:40 AM', title: 'Anitha K. asked for sick leave', body: '13–14 Oct · 2 days · waiting for you', unread: true, to: 'approvals' },
    { id: 2, when: '9:15 AM', title: 'Attendance done for 41 of 43 classes', body: 'Waiting on Class 8 A and Class 10 C', unread: true, to: 'attendance.register' },
    { id: 3, when: '7:52 AM', title: 'Bus 3 was 14 minutes late', body: 'Route 3 · Bachupally · parents were told', unread: false, to: 'transport.live' },
    { id: 4, when: 'Yesterday', title: 'Half-yearly datesheet published', body: 'Classes 6–10 · starts Mon 12 Oct', unread: false, to: 'exams.datesheet' },
  ],
  academichead: [
    { id: 1, when: '8:50 AM', title: '2 periods have no teacher today', body: '9 C period 6 (Hindi) · 10 A period 7 (English)', unread: true, to: 'academic.substitutions' },
    { id: 2, when: '8:30 AM', title: '6 question papers not in yet', body: 'Hindi 9, Telugu 10 and 4 more · due today', unread: true, to: 'exams.papers' },
    { id: 3, when: 'Yesterday', title: 'Exam-week time table asked for', body: 'From Lakshmi Rao · by Sat 10 Oct', unread: false, to: 'academic.timetable' },
  ],
  hr: [
    { id: 1, when: '9:20 AM', title: 'Swapna Reddy is not in yet', body: 'No leave applied · first period missed', unread: true, to: 'attendance.staff' },
    { id: 2, when: '8:10 AM', title: '5 staff documents expire this month', body: 'Driving licences (2), police verification (3)', unread: true, to: 'staff.documents' },
    { id: 3, when: 'Yesterday', title: '6 new applicants for PGT Chemistry', body: 'Interview today at 11:30 AM', unread: false, to: 'staff.recruitment' },
  ],
  officestaff: [
    { id: 1, when: '8:45 AM', title: 'Priya Sharma called about Aarav (7 B)', body: 'Leave for Mon 12 Oct · to record', unread: true, to: 'attendance.leave' },
    { id: 2, when: '8:30 AM', title: '74 admit cards not printed', body: 'Classes 9 and 10 · exams start Monday', unread: true, to: 'exams.admitcards' },
    { id: 3, when: 'Yesterday', title: 'Bonafide certificate asked for', body: 'Sneha Rao, 9 C · for a passport', unread: false, to: 'students.certificates' },
    { id: 4, when: '2 Oct', title: 'Your leave for 2 Oct was approved', body: 'Casual leave · 1 day', unread: false, to: 'staff.leave' },
  ],
  examincharge: [
    { id: 1, when: '9:05 AM', title: 'No seating plan for 9 C and 10 C', body: 'Rooms 301 and 302 · exams start Monday', unread: true, to: 'exams.datesheet' },
    { id: 2, when: '8:30 AM', title: '6 question papers not submitted', body: 'Hindi 9, Telugu 10, Science 8 and 3 more', unread: true, to: 'exams.papers' },
    { id: 3, when: 'Yesterday', title: 'Unit Test 2 marks not locked', body: 'Class 8 · Social, Hindi, Computers', unread: false, to: 'exams.marks' },
  ],
  admissioncounsellor: [
    { id: 1, when: '9:55 AM', title: 'New enquiry from the website form', body: 'Nursery 2027–28 · Swathi Varma', unread: true, to: 'admissions.enquiries' },
    { id: 2, when: '9:10 AM', title: 'Rao family uploaded 2 documents', body: 'Birth certificate and photo · to check', unread: true, to: 'admissions.documents' },
    { id: 3, when: 'Yesterday', title: 'Class 6 entrance test on Sat 17 Oct', body: '12 registered · 4 have no slot yet', unread: false, to: 'admissions.tests' },
  ],
  counsellor: [
    { id: 1, when: '8:35 AM', title: 'New referral from Ravi Teja', body: 'A Class 7 student · given to you', unread: true, to: 'students.behaviour' },
    { id: 2, when: '8:00 AM', title: 'Session at 11:15 today', body: 'Counselling room · Class 9 student', unread: true, to: 'students.behaviour' },
    { id: 3, when: 'Yesterday', title: 'Exam stress workshop is on the calendar', body: 'Class 10 · Sat 10 Oct', unread: false, to: 'events.events' },
  ],
  gatesecurity: [
    { id: 1, when: '10:05 AM', title: 'Early pickup at 12:15', body: 'Diya Menon, UKG B · mother · pass GP-0912', unread: true, to: 'frontoffice.pickup' },
    { id: 2, when: '10:20 AM', title: 'Visitor expected: Mr. Prakash Reddy', body: 'To meet the Principal · 10:30 appointment', unread: true, to: 'frontoffice.visitors' },
  ],
  student: [
    { id: 1, when: '8:00 AM', title: 'Maths homework due today', body: 'Exercise 4.2 · Imran Shaikh', unread: true, to: 'homework' },
    { id: 2, when: 'Yesterday', title: 'New quiz: Light and shadows', body: 'Science · closes 6 PM today', unread: true, to: 'homework.quizzes' },
  ],
};
// Anyone without a list of their own: school notices and their own profile only
export const NOTIFS_DEFAULT = [
  { id: 1, when: '9:00 AM', title: 'Half-yearly exams start Monday', body: 'Classes 6–10 · datesheet published', unread: true, to: 'events.calendar' },
  { id: 2, when: 'Yesterday', title: 'Your password was changed', body: 'From Chrome on Windows · it was you', unread: false, to: 'profile' },
];
