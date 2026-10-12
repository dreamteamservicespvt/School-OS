// Which component draws each page of each module. Keys match MODULES in config.js.
import { StudentListPage } from './students.jsx';
import { ATTENDANCE_BASE } from './attendance.jsx';
import { FEES_BASE } from './fees.jsx';
import { ADMISSIONS_PAGES } from './mod-admissions.jsx';
import { STUDENTS_PAGES } from './mod-students.jsx';
import { ACADEMIC_PAGES } from './mod-academic.jsx';
import { ATTENDANCE_PAGES } from './mod-attendance.jsx';
import { FEES_PAGES } from './mod-fees.jsx';
import { EXAMS_PAGES } from './mod-exams.jsx';
import { STAFF_PAGES } from './mod-staff.jsx';
import { SALARY_PAGES } from './mod-salary.jsx';
import { COMMUNICATION_PAGES } from './mod-communication.jsx';
import { TRANSPORT_PAGES } from './mod-transport.jsx';
import { LIBRARY_PAGES } from './mod-library.jsx';
import { INVENTORY_PAGES } from './mod-inventory.jsx';
import { FRONTOFFICE_PAGES } from './mod-frontoffice.jsx';
import { HOMEWORK_PAGES } from './mod-homework.jsx';
import { EVENTS_PAGES } from './mod-events.jsx';
import { SETTINGS_PAGES } from './mod-settings.jsx';

export const REGISTRY = {
  admissions: ADMISSIONS_PAGES,
  students: { list: StudentListPage, ...STUDENTS_PAGES },
  academic: ACADEMIC_PAGES,
  attendance: { ...ATTENDANCE_BASE, ...ATTENDANCE_PAGES },
  fees: { ...FEES_BASE, ...FEES_PAGES },
  exams: EXAMS_PAGES,
  staff: STAFF_PAGES,
  salary: SALARY_PAGES,
  communication: COMMUNICATION_PAGES,
  transport: TRANSPORT_PAGES,
  library: LIBRARY_PAGES,
  inventory: INVENTORY_PAGES,
  frontoffice: FRONTOFFICE_PAGES,
  homework: HOMEWORK_PAGES,
  events: EVENTS_PAGES,
  settings: SETTINGS_PAGES,
};
