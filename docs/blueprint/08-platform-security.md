# 08. Platform & security: what no screen shows

School OS Blueprint. Prepared for DREAM TEAM SERVICES. Added 9 October 2026 (decision D6).

## What this is

Every school trusts School OS with children's details, parents' phone numbers and money. This page lists the work underneath the screens that keeps that safe, fast and always available. Nobody in a school opens a page called "Platform". They just notice that nothing is ever lost, nothing leaks, and the software is there at 8 AM when attendance starts.

These items used to sit in the "Not included" list, because they were grouped with the Super Admin console. They are now part of School OS itself and are **built in Stage 1, together with Settings and `modules/00-global.md`**. Some parts arrive with the module that first needs them; the table in section 13 says which.

The Super Admin console (`07-super-admin.md`) keeps only DREAM TEAM SERVICES' own screens: school accounts, plans, billing, support and the views of system health. It reads what this page builds; it does not build it.

Anything marked **(decided 9 October 2026)** is a decision from this review. Anything marked **(inferred)** is a sensible default the owner may change.

## 1. Each school's data stays its own

- Every record belongs to one School (and, where it applies, one Campus). Every request is checked on the server against the person's School Access before any data is read or written.
- A person sees another school's data only if their login has School Access to that school (`04-data-model.md`, Group and School Access). Group views show only the schools the person can access.
- Search, exports, reports, AI answers, files and background jobs all carry the school, so none of them can mix two schools' data.
- **Isolation tests** run on every change of the code: a user of school A tries to read, change, search, export and download school B's records, and every attempt must fail.
- Data is stored in India (inferred: a cloud region in India), which also keeps the school within Indian data rules.

## 2. Logins and passwords

- Passwords are **hashed** (stored so that nobody, including DREAM TEAM, can read them back). They are never stored encrypted, never shown and never sent by message.
- New users set their own password from an invite link. DREAM TEAM never types or knows a school user's password.
- Two-step login (a one-time code to the phone) for School Admin, Principal and Accountant (`00-global.md` §5). If that phone is lost, another School Admin or the Principal resets two-step login; the reset is logged (`modules/20-settings.md`).
- Too many wrong passwords slow the login down, then lock it for 15 minutes (inferred), and the user and School Admins are told.
- Disabling a user or changing their roles signs them out everywhere at once.
- Parent Link (`modules/11-communication.md`) has no password. Its secret link is stored hashed, works only for that guardian's own children, and needs a one-time code to the guardian's registered mobile the first time it opens on a new phone.

## 3. Encryption and secrets

- All traffic is encrypted (HTTPS only).
- All stored data and files are encrypted on disk.
- Highly sensitive fields (Aadhaar number, bank account number, payment gateway keys, messaging provider keys) are encrypted again on their own, and shown masked (last 4 characters) to everyone except those allowed to see them.
- Keys and passwords for outside services are kept in a secret store, never in the code and never in a file a developer can read by mistake.

## 4. Backups and restore

| What | Promise |
|---|---|
| How often | Continuous backup of the database, plus a full copy every night. Files (photos, documents, bills) backed up every night. (decided 9 October 2026) |
| Most data that can be lost | 15 minutes, in the worst failure (inferred). |
| Time to bring the system back | Within 4 hours after a major failure (inferred). |
| How far back | Any moment in the last 7 days; nightly copies kept for 30 days; monthly copies kept for 1 year (inferred). |
| Where | A second, separate place in India, so one data centre failing loses nothing (inferred). |
| Proven | A restore is tested every month on a copy, and the result is recorded (inferred). |
| One school's mistake | DREAM TEAM can bring back one school's data as it was at a chosen moment, without touching other schools. The school asks through Support. |

The school sees "Last backup: today, 2:00 AM" in Settings, Data Backup & Security, and can still download all its own data at any time.

## 5. Staying up

- **Target:** available 99.5% of every month (inferred), and never down for planned work between 6 AM and 8 PM, Monday to Saturday.
- Planned work is announced to School Admins 2 days ahead (inferred).
- **When an outside service is down,** the school can keep working:
  - WhatsApp or SMS provider down: messages wait in a queue and go out when it is back, or by another channel if the school allows. The sender sees "Waiting to send" with the reason, never a false "Sent".
  - Payment gateway down: online payments show "Online payment is not working right now. Please try later or pay at the school." Counter payments in cash, UPI and cheque carry on.
  - A payment confirmed by the gateway while School OS was busy is matched later from the gateway's own record, never lost and never posted twice.
- A banner tells every user when something is not working and when it is fixed.

## 6. Speed

| What | Target (inferred) |
|---|---|
| Opening any page on a normal phone connection | Under 2 seconds |
| Saving a form (fee payment, attendance) | Under 1 second |
| Lists of 5,000 rows | Under 2 seconds (`00-global.md` P1) |
| Absence messages after attendance is saved | Sent within 5 minutes |
| Busiest time | 8 AM to 10 AM, when every teacher takes attendance at once. The system is tested for this peak. |
| Size at launch | Ready for 200 schools and 2 lakh students without slowing down, and able to grow beyond that. |

Heavy work (large reports, exports, imports, batch printing, bulk messages) runs in the background and sends a notification when ready (`00-global.md` P8).

## 7. Connections to other systems

- **Inside School OS,** every screen talks to the server through one internal API. Each version of the API is numbered, so a phone with an older app still works after an update.
- **Payment gateways** (Razorpay first): the gateway's confirmation is checked for its signature before anything is posted. The same confirmation arriving twice posts once. A payment is posted only after the gateway confirms it (`modules/00-global.md` A8).
- **Attendance devices** (biometric and face devices): each device has its own key. Each punch carries a unique number, so a punch sent twice is counted once. Built with Attendance Management.
- **Bus GPS:** locations come from the Android driver app (decision D11) or a fixed GPS device, only during an active trip. Built with Transport Management.
- **Webhooks to other software** (optional): the school can send chosen events to its own systems. Each one is signed, retried if it fails, and logged.
- **API keys for schools** (optional, later): a school connecting its own software gets a key limited to chosen data. Not in the first version.
- **Limits against abuse:** each user, device and key has a fair limit on requests per minute, so one bad script cannot slow down every school.

## 8. Files

- Photos, documents and bills are stored privately. A file opens only through a link that expires (default 15 minutes, inferred) and only for someone allowed to see it.
- Uploads are checked for viruses and limited in size (default 10 MB per file, inferred).
- Photos are made smaller automatically for phones.

## 9. Background work

- Every automatic job (the 15 automations in `00-global.md` §8, reminders, imports, reports, messages) is safe to run twice: running again never creates a second receipt, message or charge.
- A job that fails is tried again 3 times (inferred). If it still fails, DREAM TEAM is alerted, and if a school person started it, they are told in plain words what failed and what to do.
- Nothing fails silently.

## 10. Working offline

For schools that switch on offline mode (`00-global.md` §6.7):

- **What the phone keeps:** a teacher's phone keeps today's Time Table and the class lists of their sections, so Take Attendance opens without internet.
- **What can be saved offline:** attendance, transport trip events and marks entry. The screen says "Saved on this phone, will send when online".
- **Two people, one register:** if two teachers mark the same section for the same day offline, the first one to reach the server is saved. The second becomes an attendance correction request in Approvals, showing both versions.
- **Lock time:** the attendance lock (for example 11:00 AM) is judged by when the mark was taken on the phone, as long as it reaches the server the same day. Later than that, it becomes a correction request.
- **Wrong phone clock:** the phone's time is checked against the server when it reconnects. A big difference is flagged, and the server's time is used.

## 11. Watching for problems

- Every error is recorded with what the person was doing, without names, phone numbers or other personal details in the record.
- DREAM TEAM is alerted when errors rise, pages slow down, messages stop going out or jobs fail. The Super Admin console shows these views.
- Logs are kept for 90 days (inferred).

## 12. Children's data and the law

India's Digital Personal Data Protection Act 2023 sets the rules here (decided 9 October 2026, D8a).

- **Consent:** a guardian agrees to the use of the child's data on the admission form or through Parent Link, confirmed by a one-time code to the guardian's mobile. Each agreement keeps the exact version of the consent text. Consent can be withdrawn. Photo consent is separate (`modules/20-settings.md`, Data Backup & Security).
- **Only what is needed:** forms ask only for data the school uses. Aadhaar is optional and restricted.
- **No tracking or advertising** on children's data, ever.
- **Keeping data:** default periods the school can change (inferred):

| Record | Kept for |
|---|---|
| Student records, results and certificates | As long as the school uses School OS (needed for TCs and old certificates) |
| Fee, salary and finance records | 8 years (Indian accounting rules) |
| Audit log | 8 years |
| Enquiries that did not join | 2 years |
| Visitor photos and gate entries | 1 year |
| Message history | 3 years |

- Records past their period are listed for the School Admin's approval before they are removed (`modules/20-settings.md`).
- **If data ever leaks,** DREAM TEAM tells the school at once and helps it inform the Data Protection Board and the families, as the law requires.

## 13. When each part is built

| Part | Built with |
|---|---|
| Sections 1, 2, 3, 6, 9, 11, 12 and the internal API | Stage 1, with Settings and `00-global.md` |
| Backups and restore (section 4), staying up (section 5) | Stage 1, before the first school's real data goes in |
| Files (section 8) | Stage 1 (student photos and documents) |
| Payment gateway checks | Fee Management (Stage 2) |
| Offline rules (section 10) | Attendance Management (Stage 2); marks with Examination & Results |
| Attendance device connection | Attendance Management (Stage 2) |
| Bus GPS and the Android driver app | Transport Management (Stage 4) |
| Webhooks and school API keys | Later, when a school asks |

## 14. Rules for the builder (Claude Code)

Add these to the instructions in `README.md` for every module:

1. Never put a password, key or secret in the code. Use the secret store.
2. Every change to the database keeps all existing schools' data working. Changes are tested on a copy of real-sized data before they go live.
3. New features can be switched on school by school, so a change can be tried with one school first.
4. Write tests for: the key rules, every automation, the permission table in `05-roles.md`, and school data isolation (section 1).
5. Before the first school goes live: a security check of the whole product and a load test of the 8 AM attendance peak.
6. Screens meet the WCAG 2.1 AA accessibility standard (keyboard use, contrast, screen readers).

## 15. How we know it works for schools

These are the targets the product is judged by (inferred):

| Measure | Target |
|---|---|
| A new accountant collects a fee and prints a receipt | Under 1 minute, with no training |
| A teacher takes attendance for a class of 40 | Under 1 minute on a phone |
| A new school goes live (profile, classes, students, fees) | Within 1 week, using the Switching to School OS workflow (`02-workflows.md`, workflow 15) |
| Calls to support per school per month after the first month | Fewer than 2 |
| Parents opening Parent Link at least once a month | More than half |

## 16. Done when

1. A user of school A cannot see, search, export or download anything from school B, proven by the isolation tests.
2. A user's password cannot be read by anyone, including DREAM TEAM.
3. A restore of last night's backup onto a test copy succeeds and is recorded.
4. A Razorpay confirmation sent twice posts one payment and one receipt.
5. With the WhatsApp provider switched off, a fee reminder shows "Waiting to send" and goes out when it is back.
6. Two teachers marking the same section offline produce one saved register and one correction request.
7. 500 teachers saving attendance in the same 10 minutes all succeed within the speed targets.
8. A file link copied and opened after it expires shows "This link has expired".
