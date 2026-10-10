// Which component draws each page of each module. Keys match MODULES in config.js.
import { StudentListPage } from './students.jsx';
import { ATTENDANCE_BASE } from './attendance.jsx';
import { FEES_BASE } from './fees.jsx';

export const REGISTRY = {
  students: { list: StudentListPage },
  attendance: { ...ATTENDANCE_BASE },
  fees: { ...FEES_BASE },
};
