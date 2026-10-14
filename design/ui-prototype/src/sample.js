// Shared example data used by several modules, so names agree everywhere. All of it is example data.

export const TODAY = 'Fri, 9 Oct 2026';

// Staff of Sunrise Public School (86 on roll; these are the ones shown in lists)
export const STAFF = [
  { id: 'T01', code: 'SPS-T-014', name: 'Ravi Teja', dept: 'Teaching', desig: 'TGT Science', subject: 'Science', classTeacher: '7 B', phone: '97010 45512', joined: '12 Jun 2019', status: 'Present', type: 'Permanent' },
  { id: 'T02', code: 'SPS-T-021', name: 'Imran Shaikh', dept: 'Teaching', desig: 'TGT Mathematics', subject: 'Mathematics', classTeacher: null, phone: '99482 77310', joined: '3 Jul 2021', status: 'Present', type: 'Permanent' },
  { id: 'T03', code: 'SPS-T-008', name: 'Anitha Kumari', dept: 'Teaching', desig: 'PGT English', subject: 'English', classTeacher: '10 A', phone: '98493 21876', joined: '1 Jun 2016', status: 'On leave', type: 'Permanent' },
  { id: 'T04', code: 'SPS-T-030', name: 'Sunitha Mohan', dept: 'Teaching', desig: 'PRT', subject: 'All subjects', classTeacher: 'UKG A', phone: '90004 55120', joined: '15 Jun 2022', status: 'Present', type: 'Permanent' },
  { id: 'T05', code: 'SPS-T-011', name: 'Venkat Rao', dept: 'Teaching', desig: 'TGT Social Studies', subject: 'Social Studies', classTeacher: '8 A', phone: '94408 77215', joined: '10 Jun 2018', status: 'Present', type: 'Permanent' },
  { id: 'T06', code: 'SPS-T-017', name: 'Lalitha Devi', dept: 'Teaching', desig: 'TGT Telugu', subject: 'Telugu', classTeacher: '6 A', phone: '98851 60433', joined: '4 Jun 2020', status: 'Present', type: 'Permanent' },
  { id: 'T07', code: 'SPS-T-019', name: 'Deepak Verma', dept: 'Teaching', desig: 'TGT Hindi', subject: 'Hindi', classTeacher: '9 C', phone: '96525 30981', joined: '8 Jun 2020', status: 'Late', type: 'Permanent' },
  { id: 'T08', code: 'SPS-T-025', name: 'Farhana Begum', dept: 'Teaching', desig: 'PGT Physics', subject: 'Physics', classTeacher: '10 C', phone: '91000 48267', joined: '20 Jun 2021', status: 'Present', type: 'Permanent' },
  { id: 'T09', code: 'SPS-T-027', name: 'Karthik Menon', dept: 'Teaching', desig: 'TGT Computer Science', subject: 'Computers', classTeacher: null, phone: '99891 22404', joined: '1 Jul 2022', status: 'Present', type: 'Contract' },
  { id: 'T10', code: 'SPS-T-005', name: 'Usha Rani', dept: 'Teaching', desig: 'PRT', subject: 'All subjects', classTeacher: '2 B', phone: '98490 66712', joined: '5 Jun 2014', status: 'Present', type: 'Permanent' },
  { id: 'T11', code: 'SPS-T-032', name: 'Mohammed Asif', dept: 'Teaching', desig: 'PET', subject: 'Physical Education', classTeacher: null, phone: '97052 18843', joined: '2 Jun 2023', status: 'Present', type: 'Permanent' },
  { id: 'T12', code: 'SPS-T-029', name: 'Swapna Reddy', dept: 'Teaching', desig: 'TGT Mathematics', subject: 'Mathematics', classTeacher: '9 B', phone: '93470 55826', joined: '1 Jun 2022', status: 'Not in yet', type: 'Permanent' },
  { id: 'A01', code: 'SPS-A-003', name: 'Suresh Babu', dept: 'Accounts', desig: 'Accountant', subject: null, classTeacher: null, phone: '98663 40128', joined: '1 Apr 2017', status: 'Present', type: 'Permanent' },
  { id: 'A02', code: 'SPS-A-006', name: 'Anita Sharma', dept: 'Office', desig: 'Office Head', subject: null, classTeacher: null, phone: '98490 11223', joined: '14 Jun 2015', status: 'Present', type: 'Permanent' },
  { id: 'A03', code: 'SPS-A-011', name: 'Kavitha Nair', dept: 'Office', desig: 'Receptionist', subject: null, classTeacher: null, phone: '90300 66184', joined: '9 Jan 2023', status: 'Present', type: 'Permanent' },
  { id: 'A04', code: 'SPS-A-009', name: 'Padma Iyer', dept: 'Library', desig: 'Librarian', subject: null, classTeacher: null, phone: '94401 88236', joined: '1 Jun 2019', status: 'Present', type: 'Permanent' },
  { id: 'A05', code: 'SPS-A-012', name: 'Venkatesh Goud', dept: 'Transport', desig: 'Transport In-charge', subject: null, classTeacher: null, phone: '98852 30917', joined: '1 Jun 2020', status: 'Present', type: 'Permanent' },
  { id: 'A06', code: 'SPS-A-014', name: 'Joseph Thomas', dept: 'Hostel', desig: 'Hostel Warden', subject: null, classTeacher: null, phone: '96180 22709', joined: '1 Jun 2021', status: 'Present', type: 'Permanent' },
  { id: 'A07', code: 'SPS-A-015', name: 'Ramu Yadav', dept: 'Stores', desig: 'Store Keeper', subject: null, classTeacher: null, phone: '93910 50442', joined: '3 Jun 2021', status: 'On leave', type: 'Permanent' },
  { id: 'S01', code: 'SPS-S-021', name: 'Mallesh Kumar', dept: 'Transport', desig: 'Driver · Bus 4', subject: null, classTeacher: null, phone: '99120 33671', joined: '1 Jun 2018', status: 'Present', type: 'Permanent' },
  { id: 'S02', code: 'SPS-S-024', name: 'Lakshmamma', dept: 'Support', desig: 'Ayah', subject: null, classTeacher: null, phone: '90590 12448', joined: '1 Jun 2017', status: 'Present', type: 'Permanent' },
];

export const DEPARTMENTS = [
  { k: 'Teaching', n: 58 }, { k: 'Office', n: 6 }, { k: 'Accounts', n: 2 }, { k: 'Transport', n: 12 }, { k: 'Library', n: 1 }, { k: 'Hostel', n: 3 }, { k: 'Stores', n: 1 }, { k: 'Support', n: 3 },
];

export const SUBJECTS = ['English', 'Telugu', 'Hindi', 'Mathematics', 'Science', 'Social Studies', 'Computers', 'Physical Education', 'Art', 'Music'];

// Bus routes (Transport is optional; switched on for this school)
export const ROUTES = [
  { id: 'R1', name: 'Route 1 · Kukatpally Housing Board', bus: 'Bus 1', reg: 'TS 07 UA 1182', driver: 'Narsimha', students: 46, stops: 9, seats: 52 },
  { id: 'R2', name: 'Route 2 · Nizampet', bus: 'Bus 2', reg: 'TS 07 UA 2245', driver: 'Yadagiri', students: 41, stops: 8, seats: 52 },
  { id: 'R3', name: 'Route 3 · Bachupally', bus: 'Bus 3', reg: 'TS 07 UB 0917', driver: 'Srisailam', students: 38, stops: 7, seats: 40 },
  { id: 'R4', name: 'Route 4 · Miyapur', bus: 'Bus 4', reg: 'TS 07 UB 2236', driver: 'Mallesh Kumar', students: 49, stops: 10, seats: 52 },
  { id: 'R5', name: 'Route 5 · Moosapet', bus: 'Bus 5', reg: 'TS 08 UC 4410', driver: 'Ramesh', students: 33, stops: 6, seats: 40 },
  { id: 'R6', name: 'Route 6 · Chandanagar', bus: 'Bus 6', reg: 'TS 08 UC 5187', driver: 'Jangaiah', students: 44, stops: 9, seats: 52 },
];

// The featured student's class 7 B time table (Friday)
export const PERIODS = [
  { p: 1, t: '8:45–9:30' }, { p: 2, t: '9:30–10:15' }, { p: 3, t: '10:30–11:15' }, { p: 4, t: '11:15–12:00' },
  { p: 5, t: '12:40–1:25' }, { p: 6, t: '1:25–2:10' }, { p: 7, t: '2:20–3:05' }, { p: 8, t: '3:05–3:45' },
];

export const HOUSES = ['Godavari House', 'Krishna House', 'Kaveri House', 'Narmada House'];
