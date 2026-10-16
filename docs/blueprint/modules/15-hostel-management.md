# 15 Hostel Management

*Can be switched off.* Build order: 20th (last). Needs students, fees and attendance. Fewest schools use it.

## 1. Purpose

Boarding students: rooms, beds, roll call, outings and mess.

Used by: wardens (roll call, incidents, outings, visitors, daily hostel life), the hostel manager (rooms, allocation, mess, reports), the Principal (approvals, reports), and the Accountant (hostel fees and mess expenses).

## 2. Pages

### Rooms & Beds

**Purpose:** hostels, floors, rooms and beds, and which beds are free.

**What the person sees**

- Hostels (boys, girls), each with its warden(s), floors, rooms and beds.
- **Bed occupancy view:** a grid of rooms with each bed shown as free (green), taken (with the student's name), or blocked (under repair). Totals: beds, taken, free, by hostel.

**Actions**

- Add a hostel, floors, rooms and beds (add a room with N beds in one step, inferred).
- Assign wardens to a hostel.
- Block a bed (repair) or unblock it, with a reason.

**Form fields: Add room**

| Field | Required | Default | Notes |
|---|---|---|---|
| Hostel | Yes | | |
| Floor | Yes | Ground | |
| Room number | Yes | | Unique in the hostel |
| Beds | Yes | 4 (inferred) | Beds are created and numbered |
| Room type | No | | For example AC or non-AC, if fees differ (inferred) |

### Allocation

**Purpose:** give a student a bed, with check-in and check-out.

**What the person sees**

- Residents list: student, class, hostel, room, bed, check-in date, status (**Checked in**, **On outing**, **Checked out**).
- Waiting for a bed (students marked "hostel needed" at admission, inferred).

**Actions**

- **Allocate** a free bed to a student (one active bed per student). Hostel fees for the student are added from the hostel fee plan in Fee Management (inferred link, see Hostel Settings).
- **Check in** (date and time) and **check out** (date, reason; the bed becomes free; hostel fees stop from the next installment, inferred).
- Move a student to another bed (history kept).

**Form fields: Allocate**

| Field | Required | Default | Notes |
|---|---|---|---|
| Student | Yes | | Boys or girls hostel matched to gender (inferred) |
| Hostel, room, bed | Yes | First free bed in the right hostel (inferred) | |
| Check-in date | Yes | Today | |
| Fee plan | Yes | Hostel fee plan for the room type | |

### Roll Call & Incidents

**Purpose:** morning and night roll call, and a record of incidents.

**What the person sees**

- Roll call sheet by hostel and floor: residents with Present, Absent, On outing (already filled from approved outings), On leave.
- Incident log: date, student(s), type (discipline, medical, maintenance), description, action, recorded by.

**Actions**

- **Take roll call** (morning or night): mark all present, change exceptions, save (same pattern as Take Attendance).
- A student absent at night roll call and not on outing raises an alert to the warden and the Principal at once (inferred).
- **Record an incident** (discipline, medical, maintenance). Discipline incidents can also be added to the student's behaviour record (inferred link to Student Management); maintenance incidents can raise a maintenance request (inferred link to Inventory).

**Form fields: Roll call:** hostel, session (morning or night; default by time of day), status per student (default Present).

**Form fields: Incident**

| Field | Required | Default | Notes |
|---|---|---|---|
| Student(s) | No (No for maintenance) | | |
| Type | Yes | Discipline | Discipline, medical, maintenance |
| What happened | Yes | | |
| Date and time | Yes | Now | |
| Action taken | No | | |
| Inform parent | No | Off | Uses a template |

### Outing & Visitors

**Purpose:** outing passes with approval and return time, and the hostel visitor log.

An outing or leave pass is a **Gate Pass** of the kind **Hostel Outing**: the student goes with a named person, and the warden approves it. The other kind, **Pickup**, is the front gate's early pickup by a guardian on the approved pickup list (16 Front Office) (decided 9 October 2026).

**What the person sees**

- Outing passes: student, going with, from and to (date and time), reason, status (**Waiting**, **Approved**, **Out**, **Returned**, **Late**, **Rejected**).
- Students out now and late returns, in red.
- Hostel visitor log: date, student met, visitor name, relation, in and out time. Every hostel visitor comes to meet one resident student, who is named on the entry.

**Actions**

- **Request an outing or leave pass** (Gate Pass, kind Hostel Outing) for a student (recorded by the warden, for example on a parent's call); the warden approves it through Approvals (decided 9 October 2026).
- Mark out (time) and returned (time); a student not back by the return time raises an alert (inferred).
- Parent informed when the student leaves and returns (inferred: optional automatic message).
- **Record a visitor:** pick the resident student the visitor has come to meet; only people on that student's authorised list can meet without the warden's approval (inferred link to Parents & Guardians).
- Requests and complaints from residents go to Communication, Feedback & Queries.

**Form fields: Outing pass**

| Field | Required | Default | Notes |
|---|---|---|---|
| Student | Yes | | Resident students only |
| Kind | Shown | Hostel Outing | Fixed on this page (decided 9 October 2026) |
| Type | Yes | Outing | Outing (same day) or leave (overnight) |
| From and to | Yes | Now to 6:00 PM today (inferred) | |
| Going with | Yes | | A named person: pick from the student's guardians, or type a name and phone |
| Reason | Yes | | |

### Mess

**Purpose:** weekly mess menu, daily head count and mess expenses.

**What the person sees**

- Weekly menu by day and meal (breakfast, lunch, snacks, dinner).
- Daily head count per meal: expected (residents present, not on outing) and actual.
- Mess expenses: date, item, amount.
- **Nutrition tracking:** nutrition notes per menu item or meal (for example calories, protein) (inferred: notes per meal).

**Actions**

- Set the weekly menu; copy last week's.
- Record the head count per meal (default the expected count).
- Record mess expenses; they go to Finance, Expenses (and the Day Book when paid).
- Record nutrition values for menu items.

**Form fields: Mess expense**

| Field | Required | Default | Notes |
|---|---|---|---|
| Date | Yes | Today | |
| Item or head | Yes | | |
| Amount | Yes | | |
| Bill photo | No | | |
| Vendor | No | | |

### Hostel Reports

**Purpose:** occupancy, roll call and outing reports. See section 7.

### Hostel Settings

**Purpose:** hostel rules, wardens and fees linked to Fee Management. See section 6.

## 3. All features

15 features are mapped to this module: 0 Core and 15 Optional. Tick each one when it is built and tested.

### Rooms & Beds (3)

- [ ] Hostels (boys / girls), with warden (Optional: boarding schools)
- [ ] Floors, rooms and beds (Optional: boarding schools)
- [ ] Bed occupancy view (Optional: boarding schools)

### Allocation (2)

- [ ] Allocate a student to a bed (one active bed per student) (Optional: boarding schools)
- [ ] Hostel check-in and check-out (Optional: boarding schools)

### Roll Call & Incidents (2)

- [ ] Hostel roll call (morning / night) (Optional: boarding schools)
- [ ] Hostel incident log (discipline, medical, maintenance) (Optional: boarding schools)

### Outing & Visitors (2)

- [ ] Outing / leave pass with approval and return time (Optional: boarding schools)
- [ ] Hostel visitor log (Optional: boarding schools)

### Mess (4)

- [ ] Mess menu by day and meal (Optional: boarding schools)
- [ ] Daily mess head count (Optional: boarding schools)
- [ ] Mess / hostel expenses (Optional: boarding schools) · also posted to Finance, Expenses
- [ ] Nutrition tracking (Optional: boarding schools)

### Hostel Reports (1)

- [ ] Hostel reports: occupancy, attendance, outings (Optional: boarding schools)

### Hostel Settings (1)

- [ ] Hostel rules (Optional: boarding schools)

## 4. Connections

**Receives**

| From | What |
|---|---|
| 03 Student Management | Students, gender, guardians and authorised list; "hostel needed" from admission preferences (inferred) |
| 06 Fee Management | Hostel fee head and plans |
| 05 Attendance | School attendance, to compare with roll call (inferred) |
| 09 Staff & HR | Wardens as staff |
| 20 Settings | Approval rules |

**Sends**

| To | What |
|---|---|
| 06 Fee Management | Hostel fees on allocation, stopped on check-out (inferred) |
| 07 Finance | Mess and hostel expenses |
| 03 Student Management | Hostel details on the profile; discipline incidents (inferred); bed clearance on leaving (inferred) |
| 11 Communication | Outing and incident messages to parents; complaints to Feedback & Queries |
| Top bar Approvals | Outing and leave passes |
| Notifications | Night roll call absences, late returns |
| 01 Dashboard | Hostel occupancy in the operations panel (inferred) |

**Automations:** none owned. Hostel fees follow the same pattern as A12 for transport (inferred).

## 5. Rules and mistake-proofing

| Rule | How it is prevented | What the person is told | How they recover |
|---|---|---|---|
| Two beds for one student | One active bed per student | "Ravi already has Bed 3, Room 12" | Move instead |
| Two students in one bed | Only free beds offered | Not shown | Not needed |
| Wrong hostel for gender | Hostel matched to gender (inferred) | "Girls' hostel. Choose the boys' hostel." | Choose another |
| Outing without approval | Pass must be approved before "Mark out" | "Outing waiting for approval" | Wait or ask the approver |
| Student not back | Alert after the return time | "Kiran not returned (due 6:00 PM)" | Call the guardian, mark returned |
| Missing at night roll call | Immediate alert to warden and Principal (inferred) | "1 student absent at night roll call" | Find the student; record an incident |
| Visitor not authorised | Only the authorised list can visit without approval (inferred) | "Not on Kiran's authorised list" | Warden approval |
| Check-out with fees due | Warning only (clearance happens in Leaving & Alumni) (inferred) | "₹12,000 hostel fees due" | Collect fees |

## 6. Settings

The **Hostel Settings** page holds:

- **Hostel rules:** text shown to staff and printed on allocation (inferred), roll call times (morning and night), outing return deadline default, visiting hours (inferred).
- **Wardens** per hostel.
- **Hostel fees:** which Fee Structure plans apply to which hostel or room type, linked to Fee Management.
- **Outing approvers:** the warden of the student's hostel by default (decided 9 October 2026); shown here, stored in Settings, Forms & Approvals.
- **Meals** list (breakfast, lunch, snacks, dinner) (inferred).
- **Parent messages** for outing out and return, and incidents, on or off (inferred).

## 7. Reports

- Occupancy: beds, taken and free, by hostel and room.
- Roll call: absences by date and student.
- Outings: by student and month; late returns.
- Incidents by type and month.
- Visitors log.
- Mess: head counts and expenses by month.

All follow P8 and appear in Reports & Analytics.

## 8. Records used

| Record | Creates | Reads | Updates |
|---|---|---|---|
| Hostel Room | Yes | Yes | Yes |
| Bed Allocation | Yes | Yes | Yes (check-out, move) |
| Gate Pass | Yes (kind Hostel Outing: outing and leave passes, going with a named person, approved by the warden; decided 9 October 2026) | Yes | Yes (out, returned) |
| Visitor Entry | Yes (hostel visitors, each naming the student met) | Yes | Yes (out time) |
| Student, Guardian, Staff | | Yes | |
| Student Fee Due | Yes (hostel fees, inferred) | | Yes (stop on check-out) |
| Expense | Yes (mess expenses) | | |
| Message, Approval, Notification | Yes | Yes | |
| Audit Log Entry | Yes | | |

Other records (inferred): **Hostel** (building with warden), **Bed**, **Roll Call** with **Roll Call Mark**, **Hostel Incident**, **Mess Menu**, **Meal Head Count**, **Nutrition Entry**.

## 9. Done when

1. The bed occupancy view shows free and taken beds for each hostel, matching the residents list.
2. Allocating a second bed to a student is blocked.
3. Allocating a bed adds the hostel fees to the student's fees; checking out stops them from the next installment.
4. Night roll call opens with students on approved outings already marked, and an unexplained absence alerts the warden at once.
5. An outing pass cannot be marked "out" before it is approved; a late return raises an alert.
6. A mess expense appears in Finance, Expenses.
7. Hostel reports show occupancy, roll call absences and outings for a month.
8. An outing pass is saved as a Gate Pass of kind Hostel Outing, names the person the student goes with, and waits for the warden's approval.
9. A hostel visitor entry cannot be saved without the student the visitor is meeting.

## 10. Open questions

- C4 (decided 9 October 2026): outing and leave passes use the same Gate Pass record as the front gate, with two kinds: Pickup (front gate) and Hostel Outing (this module, going with a named person, approved by the warden). The school can add further approvers in Forms & Approvals.
- Is nutrition tracking per meal (menu values) or per student? The inputs only say "nutrition tracking". Assumed: per meal.
