# 12 Transport Management

*Can be switched off.* Build order: 17th (first of Stage 4). Needs students and Fee Management for stop-wise transport fees. It is **not in the first sellable version (decided, D3)**.

## 1. Purpose

School buses: routes, vehicles, students on each bus and live tracking.

Used by: the Transport in-charge (everything in this module, plus messages to a route's parents), drivers and conductors (the small native Android driver app: trips, stops, boarding, bus location; decided 9 October 2026), the Principal (live view, alerts, reports), and the Accountant (transport fees, fuel and repair costs).

## 2. Pages

### Live Tracking

*Live tracking is optional within the module: for schools tracking buses by GPS.*

**Purpose:** every running bus on a map, with next stop, arrival time and driver.

**What the person sees**

- One simple screen (no Modern and Classic views): a map with every vehicle, and trip cards beside it (below it on a phone).
- **Trip card:** route name, morning or evening trip (pickup or drop), vehicle number, driver, started time (or "Not started"), status (**Parked**, **Moving**, **Stopped**, **Offline**), speed, next stop and arrival time (ETA), last update time.
- Location updates at the interval set in Transport Settings (default about every 30 seconds). Locations are collected and shown only during an active trip, from Start trip to End trip; a bus with no running trip shows "Not on a trip" and no position (decided 9 October 2026). When the last update is older than 2 minutes the card shows "Last seen 10:42 AM" in grey and the bus icon fades (stale location, inferred: 2 minutes).
- Alerts strip: over-speed, route deviation, vehicle offline, emergency button pressed, breakdown reported.

**Actions**

- Tap a card or bus: follow that bus; see its stops with reached and next.
- **Route history playback:** pick a vehicle and date, play its path with times.
- Call the driver (phone link) (inferred).
- Message the parents of the route (opens Send Message with the route chosen).

**Form fields:** none (filters: route, vehicle, morning or evening).

### Routes & Stops

**Purpose:** routes with stops in order, pickup times and stop-wise transport fees.

**What the person sees**

- Routes list: route name, vehicle, driver, number of stops, students, seats used of capacity.
- One route: stops in order with morning pickup time and evening drop time, the stop's location on a map, students at each stop.
- Stops with their fees: one-way and two-way fee (fee variants) per stop, or one fee for the whole route.

**Actions**

- Add a route; add stops; drag to reorder stops; set times.
- Set stop location with "Use my current location" or by tapping the map (as for the campus area in Attendance).
- Set transport fees per stop or per route, with variants (one-way, two-way). The fee head "Transport" and its installments come from Fee Structure (inferred link).
- Copy a route for the evening trip in reverse order (inferred).
- Archive a route with no students.

**Form fields: Add stop**

| Field | Required | Default | Notes |
|---|---|---|---|
| Stop name | Yes | | |
| Route | Yes | The route open | |
| Order | Yes | Last | |
| Pickup time | Yes | 5 minutes after the previous stop (inferred) | |
| Drop time | No | | |
| Location | No (needed for ETA and geofence) | | Map or current location |
| Fee (two-way) | Yes | The route's fee | |
| Fee (one-way) | No | | Fee variant |

### Vehicles & Drivers

**Purpose:** buses, drivers and conductors, with licence, insurance and fitness expiry reminders, and hired-bus vendors.

**What the person sees**

- **Vehicles:** number, type (bus, van, car; inferred list), capacity, route, driver, status (Active, Under repair, Inactive), GPS device linked or not, papers status (valid, expiring, expired).
- **Drivers and conductors (attendants):** name, phone, licence number and expiry (drivers), staff or hired, driver app login (Active, Invited, Disabled), vehicle and route, status.
- **Vendors:** hired-bus companies with contact, company details and bank details.
- **Costs:** fuel and maintenance expenses per vehicle.
- **Papers:** insurance, fitness and pollution certificates per vehicle with expiry dates; maintenance schedule.

**Actions**

- Add or edit a vehicle; assign a route and a driver (and conductor).
- Add a driver or conductor. A driver on the school's staff is also a staff record (Staff & HR) and gets attendance and salary there (inferred link). A driver may also be hired (for example from a bus vendor) and not be staff. Either way the Driver record gets its own User Login for the driver app (decided 9 October 2026).
- Record a fuel fill or a repair (amount, date, odometer, bill photo); it goes to Finance as an expense (inferred link).
- Upload papers with expiry dates; reminders before expiry (automation A15).
- Set a maintenance schedule (every N km or N days, inferred) with reminders.
- Add vendors and link hired vehicles to them.

**Form fields: Add vehicle**

| Field | Required | Default | Notes |
|---|---|---|---|
| Vehicle number | Yes | | Unique; format check for Indian numbers (inferred) |
| Type | Yes | Bus | |
| Capacity (seats) | Yes | | |
| Owned or hired | Yes | Owned | Hired asks for the vendor |
| Route and driver | No | | |
| GPS device | No | | From the connected GPS provider |
| Insurance, fitness, pollution expiry | No (strongly suggested) | | Reminders need them |

**Form fields: Add driver**

| Field | Required | Default | Notes |
|---|---|---|---|
| Name and phone | Yes | | Duplicate check with staff |
| Licence number and expiry | Yes for drivers | | |
| Role | Yes | Driver | Driver or conductor / attendant |
| Staff or hired | Yes | Staff | Hired asks for the vendor (inferred) |
| Driver app login | Yes | Send invite to the phone | A User Login linked to this Driver record; role template Driver |

### Student Transport

**Purpose:** which student uses which route and stop, seat limits, bus passes and missing transport fees.

**What the person sees**

- List: student, class, route, stop, one-way or two-way, from date, fee added (yes or no).
- Route seat use: capacity, students assigned, free seats.
- **Fee coverage:** students using transport who do not have a transport fee on their fees, and students with a transport fee but no stop (inferred: the reverse check).

**Actions**

- **Assign a student to a route and stop** (single or in bulk by class). Runs automation A12: the stop's transport fee is added to the student's fees from the start date, and the seat count updates.
- Change stop or route from a date (fee changes from that date; inferred) or stop transport (fee stops from that date). Changes can need approval (transport changes are in the Approvals list).
- **Bus pass:** print a bus pass (from the ID card designer in Settings, Document Designs) with route, stop and photo.
- Fix fee coverage: "Add transport fee" for each listed student.

**Form fields: Assign transport**

| Field | Required | Default | Notes |
|---|---|---|---|
| Student(s) | Yes | | |
| Route | Yes | | Shows free seats |
| Stop | Yes | | |
| Type | Yes | Two-way | One-way or two-way |
| From date | Yes | Today | Fee starts from this installment |

### Trips

**Purpose:** morning and evening trips, the driver app, stops reached and students boarded.

**What the person sees**

- **Trip schedule:** each route's morning and evening trips with vehicle, driver and start time, by day.
- **Today's trips:** status (**Scheduled**, **Started**, **Completed**, **Cancelled**), stops reached, students boarded and dropped.
- **Trip history:** past trips with start, end, stops reached and times.
- **Driver app** (a small native Android app for drivers and conductors, installed from the Play Store; decided 9 October 2026): today's trips; **Start trip**; the stop list in order with **Reached** buttons (or reached automatically by geofence); the student list at each stop with **Boarded** and **Not boarded** (pickup) or **Dropped** (drop); **End trip**; a large red **Emergency** button; **Report breakdown**. The app sends the bus location in the background, even with the screen off or another app open, only while a trip is running; End trip stops it. The installable web app is not used for driver location, because phones stop web pages from sending location in the background.

**Actions**

- Set the trip schedule (morning and evening per route; days of the week).
- Assign a different vehicle or driver for one day (inferred).
- Start and complete trips (driver app or by the in-charge).
- Mark stops reached; confirm student boarding and drop.
- **Emergency (panic) button:** alerts the Transport in-charge and the Principal at once, with the bus location; offers a ready emergency message to the route's parents (sent only after a person confirms).
- **Breakdown reporting:** reason, location; offers to message the route's parents and to assign another vehicle.

**Form fields: Trip schedule**

| Field | Required | Default | Notes |
|---|---|---|---|
| Route | Yes | | |
| Trip | Yes | Morning pickup | Morning pickup or evening drop |
| Vehicle and driver | Yes | The route's | |
| Start time | Yes | First stop time minus 10 minutes (inferred) | |
| Days | Yes | School working days | |

### Transport Reports

**Purpose:** trips, timings, usage and fuel and repair costs. See section 7.

### Transport Settings

**Purpose:** speed, route and offline alerts, bus messages to parents, and the GPS device connection. See section 6.

## 3. All features

40 features are mapped to this module: 0 Core and 40 Optional. Tick each one when it is built and tested.

### Live Tracking (11)

- [ ] Live map of all vehicles (Optional: schools tracking buses by GPS)
- [ ] Trip cards per vehicle (Optional: schools tracking buses by GPS)
- [ ] Vehicle status: parked, moving, stopped, offline (Optional: schools tracking buses by GPS)
- [ ] Speed, vehicle number and driver details on the map (Optional: schools tracking buses by GPS)
- [ ] ETA and next stop (Optional: schools tracking buses by GPS)
- [ ] Location update interval set by the school, default about every 30 seconds (Optional: schools tracking buses by GPS) (decided 9 October 2026)
- [ ] Locations collected and shown only during an active trip (Optional: schools tracking buses by GPS) (decided 9 October 2026)
- [ ] Last-update time, with stale locations marked (Optional: schools tracking buses by GPS)
- [ ] Bad or out-of-order GPS points rejected (Optional: schools tracking buses by GPS)
- [ ] Route history playback (Optional: schools tracking buses by GPS)
- [ ] Modern / Classic tracking view toggle (Optional: schools tracking buses by GPS) · one simple view replaces the two views

### Routes & Stops (3)

- [ ] Routes with ordered stops, arrival times and pickup points (Optional: schools running buses)
- [ ] Stop-wise and route-wise transport fees (Optional: schools running buses)
- [ ] Transport fee variants (e.g. one-way, two-way) (Optional: schools running buses)

### Vehicles & Drivers (9)

- [ ] Add / edit vehicles: number, type, capacity, status (Optional: schools running buses)
- [ ] Assign a route and driver to a vehicle (Optional: schools running buses)
- [ ] Fuel and maintenance expenses per vehicle (Optional: schools running buses) · costs in Transport Reports
- [ ] Drivers with licence number and licence expiry alerts (Optional: schools running buses)
- [ ] Conductors / attendants (Optional: schools running buses)
- [ ] Hired drivers who are not staff, each with their own driver app login (Optional: schools running buses) (decided 9 October 2026)
- [ ] Transport vendors (Optional: schools using hired buses)
- [ ] Vehicle insurance, fitness and pollution certificates with expiry alerts (Optional: schools running buses)
- [ ] Vehicle maintenance schedule (Optional: schools running buses)

### Student Transport (5)

- [ ] Assign students to a route and stop (Optional: schools running buses)
- [ ] Seat capacity rules for vehicles and routes (Optional: schools running buses)
- [ ] Transport plan linked to the student's fee (Optional: schools running buses) · automatic, see 'Student given a bus stop'
- [ ] Check that every transport student has a transport fee (Optional: schools running buses)
- [ ] Bus pass (Optional: schools running buses)

### Trips (7)

- [ ] Native Android driver app: start / end trip, mark stops, send location in the background (Optional: schools running buses) (decided 9 October 2026)
- [ ] Trip schedule: morning / evening trips per route (Optional: schools running buses)
- [ ] Start and complete trips, with trip history (Optional: schools running buses)
- [ ] Track stops reached on a trip (Optional: schools running buses)
- [ ] Student boarding / drop confirmation (Optional: schools running buses)
- [ ] Emergency (panic) button in the bus / driver app (Optional: schools running buses)
- [ ] Breakdown reporting (Optional: schools running buses)

### Transport Reports (1)

- [ ] Transport reports (Optional: schools running buses)

### Transport Settings (4)

- [ ] Geofences around school and stops (Optional: schools tracking buses by GPS)
- [ ] Alerts for over-speed, route deviation and vehicle offline (Optional: schools tracking buses by GPS)
- [ ] Pickup, drop and "bus arriving" messages to parents (Optional: schools running buses) · automatic messages
- [ ] GPS tracking provider (Optional: schools tracking buses by GPS)

## 4. Connections

**Receives**

| From | What |
|---|---|
| 03 Student Management | Students, classes, photos; new admissions with a chosen stop (02, A2) |
| 06 Fee Management | Transport fee head and installments; fee status for coverage |
| 09 Staff & HR | Drivers and conductors who are on the staff |
| 20 Settings | Driver app logins (a User Login can belong to a Driver record, so hired drivers log in too) |
| 18 Events & Calendar | Holidays (no trips that day, inferred) |
| 20 Settings | GPS tracking provider connection; ID card designer (bus pass) |
| GPS devices or the Android driver app | Location points during an active trip only, validated before use |

**Sends**

| To | What |
|---|---|
| 06 Fee Management | Transport fee rows when a stop is given, changed or stopped (A12) |
| 11 Communication | Pickup, drop and "bus arriving" messages to parents; emergency and delay messages to a route |
| 07 Finance | Fuel and repair costs as expenses (inferred) |
| 01 Dashboard | Vehicles, routes, drivers; live fleet status and transport alerts |
| 03 Student Management | Transport tab on the profile |
| Top bar Approvals | Transport changes (when the school requires approval) |
| Notifications | Expiry reminders (A15), alerts, emergency |

**Automations:** owns **A12 Student given a bus stop** and the transport part of **A15** (driver licences, bus papers).

## 5. Rules and mistake-proofing

| Rule | How it is prevented | What the person is told | How they recover |
|---|---|---|---|
| Bus over capacity | Assignment blocked when the route's vehicle is full (or allowed with permission, inferred) | "Route 3 bus has 40 of 40 seats used" | Pick another route, or a bigger vehicle |
| Student using a bus without a transport fee | Fee added automatically on assignment; fee coverage list catches the rest | "5 students on transport have no transport fee" | Add fee from the list |
| Transport fee charged twice | One transport fee row per student per period; changing stop replaces it from the date | Not needed | Not needed |
| Bad or out-of-order GPS points | Rejected before use (impossible jumps, old timestamps) | Not shown to users; counted in the device log (inferred) | Not needed |
| Stale location taken as live | Last update time on every card; stale marked | "Last seen 10:42 AM" | Check the device or call the driver |
| Driver with expired licence on a trip | Reminder before expiry (A15); expired licence shown in red on the trip and the Dashboard (inferred) | "Licence of Ramesh expired on 01-10-2026" | Upload the renewed licence or change driver |
| Starting the wrong trip | Driver app shows only today's trips for that driver | Not needed | End the trip, start the right one |
| Driver's location tracked off duty | Location is collected only between Start trip and End trip; the app sends nothing otherwise | Driver app shows "Sharing location: trip running" during a trip (inferred) | Not needed |
| Trip left running after the last stop | A trip still running a set time after its last stop alerts the Transport in-charge (inferred: 30 minutes) | "Route 3 evening trip still running" | The in-charge ends the trip |
| Driver app stopped by the phone | The native Android app keeps sending in the background; if points stop, the card goes stale, then offline | "Last seen 10:42 AM" | Call the driver |
| Emergency message sent by mistake | The panic button alerts staff only; the parent message needs a person to confirm | "Send emergency message to 38 parents of Route 3?" | Do not confirm |
| Duplicate stop messages | One "arriving" message per student per trip (inferred) | Not needed | Not needed |
| Vehicle number duplicated | Unique check | "KA01AB1234 already added" | Open the existing vehicle |

## 6. Settings

The **Transport Settings** page holds:

- **Geofences** around the school and each stop (radius, default 100 m, inferred), used for "reached" and "arriving" messages.
- **Alerts:** over-speed limit (km/h), route deviation distance, offline after N minutes, and who is alerted.
- **Bus messages to parents:** pickup, drop and "bus arriving" (how many minutes before, inferred) on or off, with templates. Sent through Communication.
- **GPS tracking provider:** the connection to the GPS device company (stored in Settings, Modules On/Off integrations); map of vehicles to device IDs.
- **Location update interval:** how often the driver app or GPS device sends the bus location during a trip (default about every 30 seconds; decided 9 October 2026). Shorter intervals use more of the driver's phone battery and data (inferred note).
- **Driver app options:** whether boarding must be marked per student (inferred).
- **Transport change approvals** (shown here, stored in Settings, Forms & Approvals).
- **Live tracking on or off** (optional).

## 7. Reports

- Trips: completed, late starts, missed stops, by route and date.
- Timings: planned against actual arrival at each stop (on-time record).
- Usage: students per route and stop; seats used.
- Fuel and repair costs per vehicle and month; cost per student (inferred).
- Transport fee coverage and collection by route.
- Papers and licences expiring.
- Alerts history (over-speed, deviation, offline, emergency, breakdown).

All follow P8 and appear in Reports & Analytics.

## 8. Records used

| Record | Creates | Reads | Updates |
|---|---|---|---|
| Route | Yes | Yes | Yes |
| Stop | Yes | Yes | Yes |
| Vehicle | Yes | Yes | Yes |
| Driver | Yes (staff or hired) | Yes | Yes |
| User Login | Yes (one per driver, for the driver app; decided 9 October 2026) | Yes | Yes (disable when the driver leaves) |
| Trip | Yes | Yes | Yes (start, stops, end) |
| Transport Assignment | Yes | Yes | Yes (change, stop) |
| Student, Staff | | Yes | |
| Student Fee Due, Fee Head, Installment | Yes (transport fee, A12) | Yes | Yes (stop or change) |
| Expense | Yes (fuel and repairs, inferred) | | |
| Message, Template | Yes | Yes | |
| Approval, Notification | Yes | Yes | |
| Audit Log Entry | Yes | | |

Other records (inferred): **Stop Fee** (variant: one-way, two-way), **Conductor** (or Driver with a role), **Transport Vendor**, **Vehicle Document** (insurance, fitness, pollution), **Maintenance Schedule** and **Maintenance Log**, **Fuel Log**, **GPS Point**, **Trip Stop Event**, **Boarding Event**, **Transport Alert**, **Bus Pass**.

## 9. Done when

1. Assigning a student to a stop adds that stop's transport fee to the student's fees from the start date, and the route's free seats drop by one.
2. Assigning a student to a full bus is blocked with a message naming the route and seats.
3. The fee coverage list shows every transport student without a transport fee.
4. A driver starts a trip on the Android driver app; the bus appears on Live Tracking within a minute and updates at the set interval (default about every 30 seconds), even with the phone screen off. After End trip no more locations are collected or shown.
5. When the device stops sending, the card shows the last update time and the bus is marked stale, then offline.
6. Parents at the next stop get one "bus arriving" message per trip, when switched on.
7. Pressing the emergency button alerts the Transport in-charge and the Principal with the location; no parent message goes until a person confirms.
8. A driver licence 30 days from expiry gives a reminder.
9. Route history playback shows the path of a past trip with times.
10. A hired driver who is not on the staff signs in to the driver app with his own login and sees only his trips.

## 10. Open questions

- D3 (decided): Transport is not in the first sellable version; it is built first in Stage 4.
- D11 (decided 9 October 2026): Transport comes with a small native Android driver app for reliable background location, so a driver's phone is enough as the tracker for schools without GPS devices. The installable web app is not used for driver location.
- Which GPS device companies must be supported first? The inputs mention a GPS provider as well as the driver app.
- Should a mid-month stop change charge the full month at the old or new rate? Assumed: new rate from the next installment.
- Should students mark boarding by scanning their ID card (QR or RFID) in the bus? Not in the inputs.
