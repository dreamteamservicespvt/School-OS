# 16 Front Office

Build order: 14th (Stage 3). Hands enquiries to Admission Management and checks pickups against student records.

## 1. Purpose

The reception desk: visitors, calls, appointments and student pickup.

Used by: the Receptionist / Front Office (everything here, plus new enquiries in Admission Management, student search for pickup, and messages to parents), gate security (the Gate Security role template the school can switch on: visitor and gate entries, vehicle numbers, checking gate passes; optional; decided 9 October 2026), and staff members being visited or meeting people (notified, see their appointments).

## 2. Pages

### Reception Desk

**Purpose:** today's visitors, calls, appointments and walk-in requests on one screen.

**What the person sees**

- Big buttons for the four common jobs: **New visitor**, **Student pickup**, **New enquiry**, **Log a call** (inferred: the four shortcuts).
- Today at a glance: visitors in the building now, visitors today, enquiries today, appointments today (next one first), calls today, open walk-in requests.
- Front-office notes: short notes for the desk (for example "Principal out till 12:00").

**Actions**

- Start any of the four jobs.
- **Request desk:** record a walk-in request (for example a parent asking for a bonafide certificate or a fee statement) and route it to the right department. Each request gets a request number (for example REQ-2026-0042, inferred format), which is given to the person by message or on a printed slip so they can ask about it later; the department gets it as a task or query (inferred: as a Communication query for parents' requests, or a Task for internal routing). Complaints go to Communication, Feedback & Queries.
- Add, edit or clear a front-office note.

**Form fields: Walk-in request**

| Field | Required | Default | Notes |
|---|---|---|---|
| From | Yes | | Search parent or student, or type name and phone |
| Request | Yes | | |
| Department | Yes | | Office, accounts, academics, transport and others (inferred list) |
| Note | No | | |
| Request number | Shown | Made automatically | Unique; read-only |

### Visitors

**Purpose:** register a visitor with photo and pass, tell the staff member, and record time in and out.

**What the person sees**

- Visitor log: date, name, phone, purpose, person to meet, vehicle number, time in, time out, pass number, status (**In**, **Out**, **Expired**).
- Visitors still in the building at the top.
- Search the log by name, phone, vehicle number or date.
- **Gate log (optional, schools with gate security):** entries and exits at the gate with time, person, purpose and vehicle number (for example a car, a delivery van or a school bus), and gate passes checked at the gate.

**Actions**

- **Register a visitor** in under a minute: returning visitors are found by phone and their details fill in.
- Take a visitor photo with the camera (optional).
- Print or show a **visitor pass** with a pass number (and QR, inferred), from the design in Settings, Document Designs.
- **Notify the staff member** being visited (in-app and push notification; SMS if the school allows, inferred). The staff member can reply "Send in", "Wait" or "Not available" (inferred).
- **Check out** a visitor (time out). A visitor pass expires by itself at the time set in Front Office settings (default the end of the school day); an expired pass shows "Expired" on screen and when its QR is scanned, and the entry's status becomes **Expired**. Expired passes not checked out are listed for the desk to close with the right time.
- **Record a gate entry** (Gate Security, optional): person or vehicle, vehicle number, in or out, time.
- Visitor reports (see section 7).

**Form fields: Register visitor**

| Field | Required | Default | Notes |
|---|---|---|---|
| Phone | Yes | +91 | Fills the rest for returning visitors |
| Name | Yes | | |
| Purpose | Yes | Meeting (inferred) | Meeting, fee payment, admission enquiry, delivery, interview, other (inferred list) |
| Person to meet | Yes for meetings | | Staff picker; shows if they are on leave or in class now (inferred) |
| Photo | No (optional setting) | | Camera |
| Number of people | No | 1 | |
| ID proof type and number | As the school sets | Not required (inferred) | Required or optional by school policy in Front Office settings; restricted (inferred) |
| Vehicle number | No | | Format check for Indian numbers (inferred); also recorded in the gate log |

If the purpose is "Admission enquiry", the screen also opens the enquiry form (Enquiries & Calls).

### Student Pickup

**Purpose:** gate pass for early pickup, given only to parents and guardians on the approved list.

The gate pass made here is a **Gate Pass** of the kind **Pickup**: only guardians on the student's approved pickup list can collect. The other kind, **Hostel Outing**, belongs to 15 Hostel Management (decided 9 October 2026).

**What the person sees**

- Search the student (name, class, admission number, or scan the ID card).
- The student's **authorised pickup list**: photo, name, relation and phone of each parent or guardian allowed to collect them (from Student Management, Parents & Guardians). Any custody or access restriction is shown in red with its note.
- Today's early pickups: student, picked up by, time, reason, released by.

**Actions**

- **Release a student:** choose the person collecting from the authorised list; verify them (photo match, and a one-time code sent to the guardian's registered phone if the school switches it on, inferred); record reason and time; issue a **gate pass** of kind Pickup (printed or shown on screen), which Gate Security checks at the gate. The class teacher is told the student has left (inferred), and the attendance for the rest of the day is marked as the school sets (inferred: for example half-day).
- Someone not on the list cannot be selected. The desk can call the registered guardian; adding a person to the list is done in Student Management by someone allowed, never at the gate (inferred).

**Form fields: Release student**

| Field | Required | Default | Notes |
|---|---|---|---|
| Student | Yes | | |
| Collected by | Yes | | Only from the authorised list |
| Verification | Yes | Photo match | Code check if switched on |
| Reason | Yes | | |
| Time | Yes | Now | |

### Enquiries & Calls

**Purpose:** walk-in and phone enquiries, which go straight to Admission Management, and the call log.

**What the person sees**

- **Enquiry register:** today's enquiries taken at the desk, with child, parent, phone, class wanted, owner and next follow-up (the same records as Admission Management, Enquiries).
- **Call log:** incoming and outgoing calls with date, time, caller or person called, phone, purpose, follow-up date and status. Parents' phone numbers are hidden from roles without the "see parent phone numbers" permission: they see only the last 4 digits (for example ••••••3210), and the full number is never in their exports or search results (inferred: the permission name).

**Actions**

- **New enquiry:** the short enquiry form from Admission Management (child's name, parent's name, phone, class wanted). Source is set to walk-in or phone automatically. Automation A3 gives it an owner and a follow-up reminder in Admission Management.
- **Log a call:** incoming or outgoing; if the purpose is an admission enquiry, the enquiry is created in the same step; if a complaint, it becomes a query in Communication (inferred).
- Set a follow-up on a call (reminder to the person named).

**Form fields: Log a call**

| Field | Required | Default | Notes |
|---|---|---|---|
| Direction | Yes | Incoming | |
| Phone | Yes | +91 | Recognises known parents and enquiries |
| Name | Yes | From the phone match | |
| Purpose | Yes | | Admission enquiry, fee, transport, complaint, other (inferred list) |
| Note | No | | |
| Follow-up | No | | Date, time, who |

### Appointments

**Purpose:** meetings with the principal or staff, with no double booking.

**What the person sees**

- Calendar by day for the Principal and any staff member: booked slots, free slots, meetings in progress.
- Today's appointments list: time, visitor, with whom, purpose, status (**Booked**, **Arrived**, **Done**, **Cancelled**, **No-show**; inferred).

**Actions**

- **Book an appointment** in a free slot. A slot already booked, or a time when the staff member is on leave or teaching (from the Time Table), cannot be chosen (inferred: leave and teaching checks).
- Send the visitor a confirmation message (inferred).
- Mark arrived (creates the visitor entry with the details filled), done, cancelled or no-show.
- Reschedule.

**Form fields: Book appointment**

| Field | Required | Default | Notes |
|---|---|---|---|
| With | Yes | Principal | Staff picker |
| Date and time | Yes | Next free slot | |
| Length | Yes | 15 minutes (inferred) | |
| Visitor name and phone | Yes | | Recognises parents |
| Purpose | Yes | | |

### Postal & Deliveries

*This page is for schools logging deliveries (optional feature).*

**Purpose:** letters and couriers received and sent.

**What the person sees**

- Register: date, received or sent, type (letter, courier, parcel), from or to, for (staff or department), courier company and tracking number, status (**At desk**, **Handed over**, **Sent**).

**Actions**

- Record a received item; notify the person it is for (inferred); mark handed over (with who collected it).
- Record a sent item with courier and tracking number.

**Form fields: Received item**

| Field | Required | Default | Notes |
|---|---|---|---|
| Type | Yes | Courier | |
| From | Yes | | |
| For | Yes | | Staff or department |
| Courier and tracking number | No | | |
| Photo | No | | (inferred) |

## 3. All features

22 features are mapped to this module: 18 Core and 4 Optional. Tick each one when it is built and tested.

### Reception Desk (4)

- [ ] Reception dashboard: today's visitors, enquiries, appointments, calls (Core)
- [ ] Front-office notes (Core)
- [ ] Request desk: walk-in requests routed to the right department (Core)
- [ ] Request number for each walk-in request (Core)

### Visitors (11)

- [ ] Register a visitor: name, phone, purpose, person to meet (Core)
- [ ] Visitor photo (Optional: schools photographing visitors)
- [ ] Visitor pass / visitor ID (Core)
- [ ] Visitor check-in and check-out times (Core)
- [ ] Notify the staff member being visited (Core)
- [ ] Search the visitor log (Core)
- [ ] Gate entry and exit logs (Optional: schools with gate security)
- [ ] Vehicle number in the visitor and gate log (Optional: schools with gate security)
- [ ] Visitor ID proof required or optional by school policy (Core)
- [ ] Visitor pass expires by itself at a set time (default end of day) and shows "Expired" (Core)
- [ ] Visitor reports (Core)

### Student Pickup (2)

- [ ] Authorised pickup list; student released only to an authorised person (Core)
- [ ] Parent / guardian verification and a release record at pickup (Core)

### Enquiries & Calls (3)

- [ ] Enquiry register at the front desk (hand-off to Admissions) (Core) · automatic hand-off, see 'Enquiry at the front desk'
- [ ] Call log (incoming / outgoing, purpose, follow-up) (Core)
- [ ] Parents' phone numbers in the call log hidden (last 4 digits only) for roles without permission (Core)

### Appointments (1)

- [ ] Appointments with staff (no double booking) (Core)

### Postal & Deliveries (1)

- [ ] Deliveries / courier register (Optional: schools logging deliveries)

## 4. Connections

**Receives**

| From | What |
|---|---|
| 03 Student Management | Students, photos, authorised pickup list, custody flags |
| 09 Staff & HR | Staff to meet; leave status |
| 04 Academic | Time Table (who is teaching now, for appointments and visitor notes; inferred) |
| 20 Settings | Visitor pass design, roles |

**Sends**

| To | What |
|---|---|
| 02 Admission | Walk-in and phone enquiries (A3) |
| 11 Communication | Complaints as queries; appointment confirmations; pickup code messages (inferred) |
| Notifications | Visitor arrived for a staff member; delivery for a staff member |
| 05 Attendance | Early pickup time for the student's attendance (inferred) |
| 01 Dashboard | Visitors today in the operations panel |
| Tasks (01) | Walk-in requests routed to a department (inferred) |

**Automations:** starts **A3 Enquiry at the front desk** (built together with Admission Management, which receives it).

## 5. Rules and mistake-proofing

| Rule | How it is prevented | What the person is told | How they recover |
|---|---|---|---|
| Child released to the wrong person | Only people on the authorised list can be chosen; restricted guardians shown in red | "Not on Ravi's pickup list. Call a registered guardian." | Call the guardian; list changes only in Student Management |
| Pickup without a record | Release needs collector, verification, reason and time | Not possible to skip | Not needed |
| Double-booked appointment | Booked, leave and teaching times not offered; server check | "Principal already has a meeting at 11:00" | Pick another slot |
| Visitor never checked out | The pass expires by itself at the set time and shows "Expired"; expired passes not checked out are listed | "3 visitors not checked out today" | Check them out with the right time |
| Old pass reused to get in | An expired pass shows "Expired" on screen and when scanned | "Pass V-0231 expired at 4:00 PM" | Register the visitor again |
| Visitor without ID when the school requires it | ID proof type and number required by the school's policy | "ID proof is required by school policy" | Enter the ID, or the visitor cannot be registered |
| Parents' phone numbers copied from the call log | Roles without permission see only the last 4 digits, also in exports and search | "••••••3210" | Ask someone with permission |
| Walk-in request forgotten | Every request gets a number and a department | "Request REQ-2026-0042 sent to Accounts" | Search by the request number |
| Enquiry lost at the desk | Enquiry goes to Admission Management with an owner and follow-up at once (A3) | "Enquiry sent to Admissions. Owner: Meena." | Not needed |
| Same visitor typed again | Phone lookup fills returning visitors | Not needed | Not needed |
| Visitor ID numbers seen by everyone | Restricted field (inferred) | Hidden | Not needed |

## 6. Settings

Front Office has no settings page in the plan. What it needs is kept here (inferred):

- **Visitor purposes**, **call purposes** and **request departments** lists are edited inline (an "Add" option in each list) by people with Front Office manager permission.
- **Visitor photo required**, **visitor ID proof required** and **pickup code check** on or off: in Settings, Forms & Approvals (inferred placement; ID proof default not required, inferred).
- **Visitor pass expiry time:** default the end of the school day (inferred: from the school day timings), or a set time such as 6:00 PM.
- **Request number format** for walk-in requests (inferred).
- **See parent phone numbers** permission: in Settings, Users & Permissions; roles without it see only the last 4 digits (inferred: on by default for School Admin, Principal and Receptionist / Front Office).
- Gate work is done by the **Gate Security** role template, switched on in Settings, Users & Permissions (decided 9 October 2026).
- **Visitor pass design:** Settings, Document Designs.
- **Appointment slot length:** per staff member in their calendar (inferred).
- Front Office permissions (manage, approve and close records, manager) are in Settings, Users & Permissions.

## 7. Reports

- Visitor reports: visitors by day, purpose and person met; average time in the building (inferred).
- Early pickups by class and month.
- Enquiries taken at the desk, by source and day.
- Call log by purpose.
- Appointments by staff member, with no-shows.
- Postal register (optional).

All follow P8 and appear in Reports & Analytics.

## 8. Records used

| Record | Creates | Reads | Updates |
|---|---|---|---|
| Visitor Entry | Yes (with vehicle number and pass expiry time) | Yes | Yes (check-out, expired) |
| Gate Pass | Yes (kind Pickup: early pickup by a guardian on the approved pickup list; decided 9 October 2026) | Yes (Gate Security checks Pickup and Hostel Outing passes at the gate) | |
| Enquiry | Yes (A3) | Yes | |
| Student, Guardian, Staff, Timetable Period, Leave Request | | Yes | |
| Attendance Mark | | | Yes (early pickup, inferred) |
| Task | Yes (walk-in requests, inferred) | | |
| Message, Notification | Yes | | |
| Audit Log Entry | Yes | | |

Other records (inferred): **Front Office Note**, **Walk-in Request** (with its request number), **Call Log Entry**, **Appointment**, **Postal Entry**, **Gate Entry** (optional gate log, with vehicle number).

## 9. Done when

1. A receptionist registers a returning visitor by typing the phone number; the rest fills in; the staff member gets a notification.
2. A visitor pass prints with a pass number; checking out records the time out.
3. For early pickup, only people on the student's authorised list can be chosen; a custody-restricted guardian is shown in red and cannot be chosen.
4. Each early pickup creates a gate pass with collector, verification, reason and time.
5. A walk-in enquiry entered at the desk appears in Admission Management, Enquiries with an owner and a follow-up reminder.
6. Booking the Principal at a time already booked is not possible.
7. The Reception Desk shows today's visitors, enquiries, appointments and calls with the right counts.
8. A visitor pass not checked out shows "Expired" after the set time, including when its QR is scanned.
9. With ID proof required, a visitor cannot be registered without it; with it optional, the field can be left blank.
10. A user without the "see parent phone numbers" permission sees only the last 4 digits of parents' numbers in the call log and its export.
11. A walk-in request gets a request number that can be searched.
12. An early pickup gate pass is saved with kind Pickup.

## 10. Open questions

- Should the school be able to require a one-time code to the guardian's phone before releasing a child? Not in the inputs; listed as an option.
- Front Office has no settings page in the plan. Should it get one (visitor purposes, photo and ID proof required, pass expiry time, pickup checks), or are inline lists and the settings listed in section 6 enough?
- C4 (decided 9 October 2026): Gate Pass has two kinds, Pickup (here) and Hostel Outing (15 Hostel Management). C1 (decided 9 October 2026): gate work is done by the Gate Security role template.
- How should early pickup affect the day's attendance (half-day, present, or a special status)? Not stated.
