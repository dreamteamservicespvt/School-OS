# 14 Inventory Management

*Can be switched off.* Build order: 19th (Stage 4). Needs Finance Management for purchases and bills.

## 1. Purpose

School stock and assets: what is bought, stored, issued and repaired.

Used by: the store keeper or inventory manager (items, stock, issues, purchases, assets), heads of department (purchase requests and maintenance requests, inferred), the Accountant (purchase invoices and payments), and the Principal (approves purchases, disposals and transfers).

## 2. Pages

### Items & Stock

**Purpose:** every item with stock in hand, stock in and out, and low-stock alerts.

**What the person sees**

- Items list: item code (SKU), name, category, unit, stock in hand (by store location), reorder level, status (**OK**, **Low**, **Out of stock**).
- Low-stock items at the top, in red.
- One item: stock by location, and every stock movement (in, out, transfer, damaged, lost, expired, audit adjustment) with date, quantity, by whom, reference.
- **Lab stock (optional):** lab equipment and chemicals, with expiry dates for chemicals.
- **Book sets:** a set of items sold or issued together, for example "Class 5 book set" with its textbooks and notebooks, or a uniform set (as in the old software). Each set shows its items and quantities, the set price, and how many full sets the stock in hand can make.

**Actions**

- Add an item; set opening stock per location.
- **Import items** with their codes and opening stock per location, for example when moving in from old software (P10; workflow 15 "Switching to School OS"; decided 9 October 2026).
- **Make a book set:** pick the items and quantities, set the price (default the total of the item prices, inferred), and choose the classes it is for.
- **Stock in** (outside a purchase order, for example donations) and **stock out** (consumption).
- **Transfer** stock between store locations.
- Record **damaged, lost or expired** stock with a reason.
- **Stock audit:** count each item in a location; the screen shows the difference from the system (variance); approving the audit posts adjustments.
- Low-stock alert when stock reaches the reorder level (automation A15), with a "Raise purchase request" button.

**Form fields: Add item**

| Field | Required | Default | Notes |
|---|---|---|---|
| Item code (SKU) | Yes | Next number in the format (inferred) | Unique in the school; can be printed as a barcode (inferred) |
| Item name | Yes | | Duplicate check |
| Category | Yes | | From Inventory Settings |
| Unit | Yes | Piece (inferred) | Piece, box, packet, kg, litre, set |
| Reorder level | No | 0 (no alert) | |
| Opening stock and location | No | 0, main store | |
| Price per unit | No | | For stock value (inferred) |
| Expiry tracking | No | Off | For chemicals and perishables (inferred) |

**Form fields: Book set**

| Field | Required | Default | Notes |
|---|---|---|---|
| Set name | Yes | | For example "Class 5 book set 2026-27" |
| Items and quantities | Yes | | At least 2 items |
| Classes | No | | Offered first when issuing to a student of these classes |
| Set price | Yes | Total of the item prices (inferred) | Charged to the student's fees when issued |

### Issue Stock

**Purpose:** give items to staff, departments or classes, and books and uniforms to students.

**What the person sees**

- Issues list: date, item, quantity, issued to (staff, department, class or student), issued by, returnable or not, returned.

**Actions**

- **Issue** to a staff member, department or class.
- **Issue to students at the store counter** (books and uniforms): pick the student, items and sizes; the charge goes to the student's fees in Fee Management (as in the old software's store counter).
- **Issue a book set** to a student in one step: stock of every item in the set goes down, and the set price goes to the student's fees. Items missing from stock are listed before issuing; the set can be issued without them only if the person chooses (inferred).
- Record a return of returnable items (inferred).

**Form fields: Issue**

| Field | Required | Default | Notes |
|---|---|---|---|
| Issue to | Yes | | Staff, department, class or student |
| Items and quantities | Yes | | Shows stock in hand; cannot exceed it |
| From location | Yes | Main store | |
| Charge to student's fees | Yes for students | On, at the item price | Off for free issues |
| Note | No | | |

### Purchases & Vendors

**Purpose:** purchase requests, purchase orders, goods received, bills and the vendor list.

**What the person sees**

- Tabs: **Requests**, **Purchase orders**, **Goods received**, **Bills**, **Vendors**.
- Each list shows number, date, vendor, items, amount, status. Purchase flow: request (**Waiting**, **Approved**, **Rejected**) → order (**Sent**, **Part received**, **Received**, **Closed**) → goods received → bill (**Unpaid**, **Part paid**, **Paid**) (inferred: status names).
- **Group view (optional):** central purchasing for a school group.

**Actions**

- **Purchase request:** items, quantities, reason; goes to Approvals by the school's limits.
- **Purchase order:** from an approved request; choose vendor and prices; send the PO by email or print (design in Document Designs, inferred).
- **Goods received:** against a purchase order, record the quantities that arrived (part deliveries allowed); stock goes up in the chosen location.
- **Purchase invoice and payment:** record the vendor's bill against the order; pay it (mode, reference). The bill and payment go to Finance (Expenses and Day Book).
- **Vendors:** name, contact, phone, email, GST number (inferred), bank details, items supplied. Adding a vendor with the same GSTIN or the same phone number as an existing vendor shows that vendor first (duplicate check).

**Form fields: Purchase request**

| Field | Required | Default | Notes |
|---|---|---|---|
| Items and quantities | Yes | Low-stock items when raised from an alert | |
| Needed by | No | | |
| Reason | Yes | | |
| Department | No | The requester's | |
| Estimated amount | No | From the last purchase price (inferred) | Decides the approval step |

### Assets

**Purpose:** furniture, computers and equipment with asset tag, location, warranty and repairs.

**What the person sees**

- Asset register: asset tag, name, type (furniture, IT, lab, sports, vehicles and others), location (room, department) or person, purchase date, cost, warranty and AMC end dates, condition, status (**In use**, **In repair**, **Disposed**).
- Warranty and AMC ending soon.

**Actions**

- Add an asset (from a goods receipt or by hand); print asset tags (barcode or QR).
- **Import assets** with tag, location, purchase date and cost from a spreadsheet, for example when moving in from old software (P10; workflow 15 "Switching to School OS"; decided 9 October 2026).
- **Assign** to a room, department or person; **transfer** to another (history kept).
- **Maintenance and repair log:** date, problem, vendor, cost, status.
- Warranty and AMC alerts before the end date (automation A15).
- **Depreciation:** a yearly value worked out by the method in Inventory Settings.
- **Dispose** with a reason and approval (sold, scrapped, donated; sale amount goes to Finance as income, inferred).
- **Asset audit (physical check):** scan tags room by room; missing and misplaced assets listed.
- **Link stock items to assets** (for example a computer and its spare parts).

**Form fields: Add asset**

| Field | Required | Default | Notes |
|---|---|---|---|
| Asset name | Yes | | |
| Type | Yes | | |
| Asset tag | Yes | Next number in the format (inferred) | Unique |
| Location or person | Yes | | |
| Purchase date and cost | No | | From the bill when created from a goods receipt |
| Warranty or AMC end date | No | | Needed for alerts |
| Vendor | No | | |

### Rooms, Labs & Maintenance

**Purpose:** rooms, labs and grounds, lab checks and maintenance requests.

**What the person sees**

- **Facility register:** rooms, labs, halls and grounds with capacity and assets in each.
- **Maintenance requests:** request, place, priority, technician, status (**Open**, **In progress**, **Done**), completion date, cost.
- **Labs (optional, schools with science labs):** experiments list per class, lab safety checks (checklist with date and result), lab equipment maintenance.

**Actions**

- Add rooms and facilities. (Rooms used by the Time Table room view are the same records, inferred.)
- **Raise a maintenance request** (any staff member, from a phone with a photo, inferred); assign a technician; set priority; close with cost (cost goes to Finance as an expense, inferred).
- Record lab safety checks and equipment maintenance; list experiments per class.

**Form fields: Maintenance request**

| Field | Required | Default | Notes |
|---|---|---|---|
| Place | Yes | | Room or facility |
| Problem | Yes | | |
| Photo | No | | |
| Priority | Yes | Normal | |
| Asset | No | | If a specific asset |

### Inventory Reports

**Purpose:** stock, purchase and asset reports. See section 7.

### Inventory Settings

**Purpose:** item categories, store locations, reorder levels and approval limits. See section 6.

## 3. All features

36 features are mapped to this module: 0 Core and 36 Optional. Tick each one when it is built and tested.

### Items & Stock (10)

- [ ] Item master: name, unit, category, reorder level (Optional: schools tracking stock)
- [ ] Item code (SKU), unique in the school (Optional: schools tracking stock)
- [ ] Import items with opening stock, and assets, from old software (Optional: schools tracking stock) (decided 9 October 2026)
- [ ] Opening stock (Optional: schools tracking stock)
- [ ] Stock in and stock out (Optional: schools tracking stock)
- [ ] Transfer stock between locations (Optional: schools tracking stock)
- [ ] Damaged, lost and expired stock (Optional: schools tracking stock)
- [ ] Low-stock alerts at reorder level (Optional: schools tracking stock)
- [ ] Stock audit with variance (Optional: schools tracking stock)
- [ ] Lab equipment and chemicals stock (Optional: schools with science labs)

### Issue Stock (2)

- [ ] Issue stock to a department, class or staff member (Optional: schools tracking stock)
- [ ] Book sets: items sold or issued together, for example a class's book set (Optional: schools selling books and uniforms)

### Purchases & Vendors (7)

- [ ] Purchase request with approval (Optional: schools tracking stock)
- [ ] Vendors / suppliers (Optional: schools tracking stock)
- [ ] Vendor duplicate check: same GSTIN or phone (Optional: schools tracking stock)
- [ ] Purchase order (Optional: schools tracking stock)
- [ ] Goods receipt against a purchase order (Optional: schools tracking stock)
- [ ] Purchase invoice and payment (Optional: schools tracking stock)
- [ ] Central purchasing for the group (Optional: school groups) · group view

### Assets (9)

- [ ] Asset register (furniture, IT, lab, sports, vehicles, etc.) with asset tag (Optional: schools tracking assets)
- [ ] Assign an asset to a room, department or person (Optional: schools tracking assets)
- [ ] Transfer an asset (Optional: schools tracking assets)
- [ ] Asset maintenance and repair log (Optional: schools tracking assets)
- [ ] Warranty and AMC dates with alerts (Optional: schools tracking assets)
- [ ] Asset depreciation (Optional: schools tracking assets)
- [ ] Dispose of an asset with approval (Optional: schools tracking assets)
- [ ] Asset audit (physical check) (Optional: schools tracking assets)
- [ ] Link stock items to assets (Optional: schools tracking assets)

### Rooms, Labs & Maintenance (5)

- [ ] Facility register: rooms, labs, halls, grounds (Optional: larger campuses)
- [ ] Maintenance requests with technician, priority, completion and cost (Optional: larger campuses)
- [ ] Experiments list (Optional: schools with science labs)
- [ ] Lab safety checks (Optional: schools with science labs)
- [ ] Lab equipment maintenance (Optional: schools with science labs)

### Inventory Reports (1)

- [ ] Stock and asset reports (Optional: schools tracking stock)

### Inventory Settings (2)

- [ ] Item categories (Optional: schools tracking stock)
- [ ] Store locations (Optional: schools tracking stock)

## 4. Connections

**Receives**

| From | What |
|---|---|
| 07 Finance | Expense heads, vendor list (shared), approval limits |
| 03 Student Management | Students for store-counter issues |
| 09 Staff & HR | Staff and departments for issues and assignments; exit clearance requests |
| 20 Settings | Approval rules, document designs (purchase order, asset tags) |

**Sends**

| To | What |
|---|---|
| 07 Finance | Purchase invoices and payments (Expenses, Day Book); maintenance costs; disposal income (inferred) |
| 06 Fee Management | Charges for books and uniforms issued to students |
| 09 Staff & HR | Assets and items held, for exit clearance |
| 03 Student Management | Items issued, for leaving clearance (inferred) |
| 01 Dashboard | Operations panel: low stock, assets, maintenance |
| Top bar Approvals | Purchase requests and orders, transfers, disposals, stock audit adjustments |
| Notifications | Low stock, warranty and AMC ending (A15) |

**Automations:** owns the low-stock and warranty part of **A15 Something about to expire or run out**.

## 5. Rules and mistake-proofing

| Rule | How it is prevented | What the person is told | How they recover |
|---|---|---|---|
| Issuing more than in stock | Blocked | "Only 12 in the main store" | Transfer from another store, or issue fewer |
| Stock going negative | No movement may take stock below zero | Same as above | Record the missing stock in |
| Purchase without approval | Orders only from approved requests (above the limit) | "Request waiting for approval" | Wait |
| Receiving more than ordered | Warning; extra needs a reason (inferred) | "Ordered 50, receiving 60" | Correct, or accept with reason |
| Duplicate vendor bill | Same vendor and bill number warning (shared with Finance) | "Bill already recorded" | Open existing |
| Stock audit changes stock silently | Variances post only after approval | "12 differences waiting for approval" | Approver reviews |
| Asset disposed by mistake | Disposal needs approval; disposed assets stay in the register | "Dispose of Projector AT-0042? Needs approval." | Reject the request |
| Asset tag reused | Unique check | "Tag AT-0042 belongs to Projector, Room 12" | Use the next tag |
| Item code reused | Unique check | "Code ST-0107 belongs to A4 notebook, 200 pages" | Use the next code shown |
| Same vendor added twice | Same GSTIN or same phone as an existing vendor is caught | "A vendor with this GSTIN already exists: Sri Sai Stationers" | Open the existing vendor |
| Book set issued with items missing | Missing items listed before issuing | "2 of 9 items are out of stock" | Issue the rest and the missing items later, or wait |
| Bad rows in an item or asset import | Import preview and error report (P10) | "120 rows ready, 3 with problems" | Fix the 3 rows, or undo the import |
| Expired chemicals used | Expired stock flagged; cannot be issued (inferred) | "Batch expired on 01-09-2026" | Record as expired |

## 6. Settings

The **Inventory Settings** page holds:

- **Item categories** (stationery, cleaning, lab, sports, uniforms, books and the school's own; inferred defaults).
- **Store locations** (main store, lab store, sports room and others).
- **Reorder levels:** default per category, changeable per item (inferred: default per category).
- **Approval limits** for purchase requests, orders, transfers and disposals (shown here, stored in Settings, Forms & Approvals).
- **Units** list (inferred).
- **Asset types**, **asset tag format**, and **depreciation method and rates** (inferred).
- **Warranty and AMC reminder days** (inferred, default 30).
- **Purchase order number format** (inferred).
- **Item code format** (inferred, for example ST-0001).
- **Book sets** on or off, and whether a set can be issued with items missing (inferred).

## 7. Reports

- Stock in hand by item, category and location, with value.
- Stock movements (in, out, transfers, losses) by period.
- Low stock and reorder list.
- Issues by department, class, staff and student; book sets issued by class.
- Purchases by vendor, item and month; pending orders; unpaid bills.
- Asset register, asset value after depreciation, assets by location, warranty and AMC due.
- Maintenance requests and costs.
- Stock audit and asset audit variances.

All follow P8 and appear in Reports & Analytics.

## 8. Records used

| Record | Creates | Reads | Updates |
|---|---|---|---|
| Item | Yes | Yes | Yes |
| Stock Movement | Yes | Yes | No (corrections are new movements) |
| Asset | Yes | Yes | Yes (assign, transfer, repair, dispose) |
| Expense | Yes (bills and maintenance costs, inferred) | | |
| Student Fee Due | Yes (store-counter charges) | | |
| Student, Staff | | Yes | |
| Approval, Notification | Yes | Yes | |
| Audit Log Entry | Yes | | |

Other records (inferred): **Item Category**, **Store Location**, **Book Set** with its items, **Stock Issue**, **Stock Audit** with counts, **Vendor** (shared with Finance), **Purchase Request**, **Purchase Order**, **Goods Receipt**, **Purchase Invoice** and **Vendor Payment**, **Asset Assignment**, **Asset Maintenance Log**, **Asset Disposal**, **Asset Audit**, **Facility** (room, lab, hall, ground), **Maintenance Request**, **Lab Experiment**, **Lab Safety Check**.

## 9. Done when

1. Issuing 20 notebooks when 12 are in stock is blocked with the stock shown.
2. When an item falls to its reorder level, the store keeper gets a low-stock alert with a "Raise purchase request" button.
3. A purchase request above the limit waits in Approvals; once approved it becomes a purchase order; receiving the goods increases stock.
4. Recording the vendor's bill and paying it shows the payment in the Finance Day Book.
5. Issuing a uniform to a student at the counter adds the charge to the student's fees.
6. A stock audit with differences changes stock only after approval.
7. An asset 30 days from warranty end gives a reminder; disposing of an asset needs approval and the asset stays in the register as Disposed.
8. A maintenance request raised from a phone with a photo reaches the technician and, when closed, records its cost.
9. Adding an item with a code already in use is blocked; adding a vendor with an existing GSTIN or phone shows the existing vendor.
10. Issuing the "Class 5 book set" to a student lowers the stock of every item in it and adds the set price to the student's fees.
11. Importing 200 items with opening stock and 80 assets from a spreadsheet shows a preview, imports the good rows, and can be undone.

## 10. Open questions

- Should vendors be one shared list with Finance (Expenses) and Transport vendors? Assumed: one shared Vendor list.
- Which depreciation method should be the default (straight line or written-down value)? Not in the inputs.
- Should items issued to students be returnable (for example library-style textbooks)? Assumed: optional per issue.
