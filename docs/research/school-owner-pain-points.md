# School software pain points: what owners, staff and parents complain about

Research date: 23 October 2026. Scope: Indian K-12 private schools first (AP/Telangana where found), global evidence second.
Method: about 40 web searches and page fetches across review sites, news, legal commentary and vendor material.

## Read this first: how far to trust this report

- **Evidence labels** (after each quote):
  - **[V]** = verbatim, read on the source page itself.
  - **[S]** = wording as it appeared in a search-engine snippet of that page. The page itself could not be opened (Capterra, G2, Software Advice and TrustRadius return HTTP 403 to automated fetches). Treat as close paraphrase.
  - **[Vendor]** = a vendor's own marketing or blog. Useful for naming a problem, weak as proof of how common it is.
  - **[News] / [Legal]** = news report or law-firm / government commentary.
- **Reddit could not be searched or fetched** (the research tool blocks reddit.com). Google Play review pages also did not render. So the "teacher/parent voice" comes from news interviews, App Store aggregators, review sites and surveys instead. A human pass over r/Teachers, r/k12sysadmin, r/india and Play Store 1-star reviews of Indian parent apps (Teachmint, Entab CampusCare, MyClassboard, Fedena) would strengthen sections 3 and 6.
- **Indian ERP review sites are thin and mostly positive** (for example MyClassboard: 2 Capterra reviews; Fedena: 13-19 per site; Teachmint/MyClassCampus: ~110 on SoftwareFinder, mostly 5-star). Complaints there are mild and must not be read as "few problems"; small schools rarely post reviews.
- **"Ranked by how often they appear"** below means: how many independent sources in this research raised the theme (the "Sources" count is a real count of distinct sources cited in this file), weighted by how directly they come from real users. It is not a statistical survey.
- No statistic in this file is invented. Where a number is from a vendor, a small sample or a secondary report, it says so.

---

## 1. Ranked themes

| Rank | Theme | Sources cited | Who suffers most |
|---|---|---|---|
| 1 | Teacher data-entry burden, too many apps, too many logins | 9 | Teachers, principals |
| 2 | Fees: failed/duplicate payments, missing receipts, reconciliation, arrears | 10 | Parents, accountants, owners |
| 3 | Security, privacy and data loss (incl. DPDP Act) | 9 | Everyone; owners carry the liability |
| 4 | Mobile app quality: login/OTP loops, crashes, old Android | 6 | Parents |
| 5 | Performance and outages at peak times (marks entry, attendance hour) | 6 | Teachers, admins |
| 6 | Usability: too many screens, training needed, confusing UI changes | 7 | Teachers, admins |
| 7 | Communication overload and fragmentation (WhatsApp at all hours, many apps) | 7 | Teachers, parents |
| 8 | Report cards / exams: format rigidity, rollover, manual Excel merging | 5 | Teachers, exam coordinators |
| 9 | Data migration and year-end rollover | 4 | Admins |
| 10 | Support quality and vendor lock-in | 5 | Owners, admins |
| 11 | Pricing and hidden costs (SMS, modules, AMC, price changes) | 4 | Owners |
| 12 | Customisation limits | 4 | Owners, principals |
| 13 | Attendance capture accuracy (devices, wrong "absent") | 3 | Teachers, parents |
| 14 | Connectivity / offline | 4 (overlaps rank 1 and 5) | Teachers, rural parents |
| 15 | Regional language and low literacy | 3 (weak evidence) | Parents |
| 16 | Staff resistance / adoption | 3 | Owners |
| 17 | Multi-branch | 0 direct sources found | Chain owners (evidence gap) |

---

## 2. Themes in detail

### 2.1 Teacher data-entry burden: too many apps, too many logins (Rank 1)

**Problem:** Teachers re-enter the same data into several apps and portals, losing teaching time; one error means days of explaining.
**Who suffers:** teachers first, then principals who chase them.

Evidence:
- AP teacher, Anantapur: *"Some days I stay back for an hour just to update everything"*, wishing for *"one single app that could handle all kinds of data"* instead of *"switching between five different ones."* Chandigarh teacher: *"too many apps, too many passwords."* Bhopal teacher: *"Once I uploaded attendance under the wrong date and had to explain myself for a week."* [V, News] [Careers360, 4 Dec 2025](https://news.careers360.com/school-teacher-data-entry-burden-udiseplus-midday-meal-diksha-attendance-nishtha-ullas-portal-apps-login-monitoring-education)
- AP Education Minister Nara Lokesh told the Legislative Council that teachers would be relieved of carrying the load of several apps (date not given in the report). [S, News] [ap7am](https://www.ap7am.com/en/96875/teachers-will-no-longer-bear-the-burden-of-apps-minister-nara-lokesh)
- Maharashtra teacher groups pushed back against roughly 40 government apps and asked for one unified portal. [S, News] [Navbharat Live](https://navbharatlive.com/maharashtra/nagpur/teachers-overloaded-40-government-apps-demand-unified-digital-portal-1452682.html)
- Note: most Indian evidence is about **government** school apps. Private-school teachers in AP/Telangana also fill those state portals (UDISE+ etc.), so a private ERP that adds a *sixth* app makes this worse unless it saves time.

**What good software must do:**
- A teacher marks attendance for a 40-student class in **under 60 seconds** on a phone, with "all present" as the default and taps only for exceptions.
- Every fact is typed **once**: attendance, marks and student details entered once flow to report cards, parent messages and exports (for example a UDISE+-ready export) with no re-typing.
- A teacher can **correct a wrong date or entry themselves** within a set window, with the change recorded in the audit log, instead of filing a request.
- One login per person across all their roles (a teacher who is also a parent sees both in one account).

### 2.2 Fees: failed payments, missing receipts, reconciliation, arrears (Rank 2)

**Problem:** Money leaves the parent's bank but the school shows "unpaid"; parents pay twice; accountants cannot match gateway settlements to receipts; owners cannot see who owes what.
**Who suffers:** parents (stress, double payment), accountants (manual matching), owners (cash flow).

Evidence:
- National Consumer Helpline case: a school registration payment showed a **failure receipt** from the institution while the money was debited; the parent paid again; the bank later said the first payment had succeeded. [S, Gov] [consumerhelpline.gov.in](https://consumerhelpline.gov.in/public/successstorydetails/145)
- A Hyderabad report described a system *"not displaying the fee paid after confirmation."* [S, News] [Deccan Chronicle](https://deccanchronicle.com/nation/current-affairs/021118/hyderabad-software-glitch-halts-inter-fee.html)
- Institutions routinely tell parents *"do not pay for second time"* and allow 2-3 working days for status to update, i.e. the problem is normal enough to need a written rule. [S] [IIT Guwahati guidelines](https://online.iitg.ac.in/epay/seatbook/downloads/guidelines_for_student.pdf)
- Gujarat Chamber of Commerce objected to a school forcing one gateway that *"charges additional charges"* to parents, saying parents have the right to choose the payment mode. [S] [Gujarat Chamber letter](https://www.gujaratchamber.org/assets/printmedia/1665655425.pdf)
- Kashmir: most private schools still rely on cash; parents report card payments refused. [S, News] [Greater Kashmir](https://greaterkashmir.com/kashmir/most-private-schools-in-kashmir-rely-on-cash-payments)
- Reconciliation failure modes listed by a fee-software vendor: gateway confirmation vs **net** bank settlement mismatch, duplicate entries from retries, *"payment reflected in gateway but not in ERP"*, refunds paid before the ledger is reversed. [Vendor] [Synthesys](https://synthesys.co.in/fee-management-problems-in-colleges/)
- Arrears are an owner-level survival issue: an ISFC / Gray Matters Capital survey (May 2020, 1,678 school owners and principals) found **87.5%** of budget private school respondents reported fee-collection challenges. [S, News] [Education World](https://educationworld.in/over-87-budget-private-schools-facing-challenges-of-fees-collection-survey/). KAMS (Karnataka, 250 schools) reported about **Rs 31.6 crore** arrears for 2019-20. [S, News] [The News Minute](https://thenewsminute.com/karnataka/survey-250-karnataka-schools-shows-over-rs-31-crore-fee-arrears-last-year-152587). Both are pandemic-era figures; in 2026 Indore schools' bigger gap is unpaid **RTE reimbursements** from the state. [S, News] [Free Press Journal](https://www.freepressjournal.in/indore/indores-private-schools-feel-the-pinch-as-rte-reimbursements-remain-stuck)
- Review sites: a Teachmint/MyClassCampus customer of 3+ years: *"there is room for improvement in the fees management aspect."* [V] [SoftwareFinder](https://softwarefinder.com/lms/teachmint/reviews). Fedena: *"there has to be some work on the fee when it is carried to the next semester/year."* [S] [TrustRadius](https://trustradius.com/products/fedena/reviews). Edunext reviewer wanted *"a more streamlined fee and finance module."* [S] [SoftwareSuggest](https://www.softwaresuggest.com/compare/edunext-vs-horizon-school-erp)
- Fee hikes cause parent protests (Delhi 2025, a student reportedly barred from an exam over unpaid hikes). [S, News] [Deccan Herald](https://www.deccanherald.com/india/delhi/parents-protest-outside-directorate-of-education-over-alleged-school-fee-hike-in-delhi-demand-rollback-3496450). Telangana drafted a fee-regulation bill (2025) with district fee committees and fines; status unconfirmed. [S, News] [The News Minute](https://www.thenewsminute.com/telangana/telangana-citizens-group-seeks-school-fee-regulation-bill-in-upcoming-assembly-session). AP's 2021 fee caps were struck down by the High Court. [S, Legal] [LiveLaw](https://www.livelaw.in/amp/news-updates/andhra-pradesh-high-court-strikes-down-govt-orders-fixing-fees-for-private-unaided-schools-based-on-geographical-location-188511)

**What good software must do:**
- A parent pays a term fee by UPI on a 3G Android phone in **under 60 seconds** and gets a receipt (PDF link) on WhatsApp/SMS within **1 minute**.
- If the gateway confirms payment but the browser closes, the payment still posts automatically (server-side webhook), and the parent sees "Paid" without calling the school.
- A second payment for an already-paid due is **blocked or flagged**; any genuine double payment shows up on a "refund needed" list.
- The accountant gets a daily report matching gateway **settlements (net of charges)** to receipts, listing every unmatched item.
- Cash, cheque, UPI-to-school-account and online payments all produce the same numbered receipt; a payment is never deleted, only reversed with a reason (School OS rule).
- Fee structure, concessions and late fees are visible to the parent **before** paying; any convenience charge is shown up front or absorbed by the school.
- The owner sees "collected today / this month / outstanding by class" on one screen, and can send dues reminders to all defaulters in one action.
- Fee balances carry over to the next year correctly at rollover.

### 2.3 Security, privacy and data loss, incl. DPDP Act (Rank 3)

**Problem:** School platforms hold children's identity, address, health and fee data; vendors have leaked it at scale, and Indian law now puts the duty on the school.
**Who suffers:** children and parents (exposure), owners (legal liability and trust).

Evidence:
- **Appscook (India/Sri Lanka, Nov 2023):** an open cloud bucket with *"almost a million files with minors' data"*, including birth certificates, fee receipts, report cards, photos and home addresses, from apps used by 600+ schools; the bucket *"was left open to anyone without requiring authentication."* [V, News] [Security Affairs / Cybernews](https://securityaffairs.com/154743/security/app-used-by-hundreds-of-schools-leaking-childrens-data.html)
- **PowerSchool (Dec 2024):** attacker used stolen credentials on the vendor's **support portal** and a maintenance tool to pull district databases; one district said *"they got all historical student and teacher data."* [S, News] [TechCrunch](https://techcrunch.com/2025/01/15/powerschool-data-breach-victims-say-hackers-stole-all-historical-student-and-teacher-data/). Memphis-Shelby County Schools sued. [S, News] [Cybersecurity Dive](https://www.cybersecuritydive.com/news/tennessees-largest-school-district-sues-powerschool-over-data-breach/748317/). The 62.4M-student figure is the attacker's claim, not confirmed by PowerSchool.
- **Blackbaud (2020 ransomware):** the FTC faulted it for keeping data it did not need and for misleading breach notices; US states settled for $49.5M. [S, News] [The Register](https://www.theregister.com/2024/02/02/ftc_blackbaud_settlement/)
- **Andhra Pradesh:** an AP college-education website exposed Aadhaar numbers of 64,000+ students (2018). [S, News] [MediaNama](https://www.medianama.com/2018/08/223-apcce-students-aadhaar-exposed/)
- **DPDP Act 2023 + Rules 2025:** Rules notified 13/14 Nov 2025; Rule 10 (verifiable parental consent for under-18s) and most duties apply 18 months later, i.e. **about 13 May 2027**. [Legal] [Bar & Bench](https://www.barandbench.com/view-point/meity-notifies-final-digital-personal-data-protection-rules-2025), [Takshashila](https://takshashila.org.in/content/blogs/20251114-meity-notifies-dpdp-rules-2025.html). Commentators report exemptions for educational institutions for some processing, but **B2B ed-tech vendors acting as processors are in a different position**; the exact scope is uncertain and needs a lawyer's reading of the Gazette text. [Legal] [S.S. Rana](https://ssrana.in/articles/schools-coaching-centres-platforms-processing-childrens-data-are-you-compliant/)

**What good software must do:**
- One school can **never** read another school's data (database-level isolation, proven by an automated test; School OS already has this rule).
- Vendor/support staff cannot browse a school's data without a time-limited, logged access the school can see (the PowerSchool route was a support tool).
- Every view/export of student lists, fee data or documents is in an audit log the owner can read.
- Uploaded documents (birth certificates, photos) are private files served only via short-lived signed links; no public bucket.
- The school can record parent consent per purpose, show a privacy notice in the parent's language, and **export or erase** a child's data on a valid request (archival for fee records where law requires retention).
- Data no longer needed (e.g. old applicants not admitted) can be purged on a schedule.
- Breach-response basics exist: the vendor can tell a school within hours which records an incident touched.

### 2.4 Mobile app quality: login loops, OTP, crashes, old phones (Rank 4)

**Problem:** Parents cannot get in (OTP never arrives, wrong number on file, login loops), or the app crashes or needs a newer Android.
**Who suffers:** parents, then the front office who field the calls.

Evidence:
- Infinite Campus "Campus Parent" (US): 1.9/5 on an aggregator; *"there is no data to display, please contact your district"*, *"I still can not log into CampusParent after all of that"*, *"Crashes almost every single time I open it"*, *"all I get is a white screen."* [V] [JustUseApp](https://justuseapp.com/en/app/1384542785/campus-parent/reviews)
- An Indian parent-app vendor's help desk documents a manual workaround for OTP failures (staff look up and share the code) and a **10 OTP/day cap**. [S, Vendor KB] [LeadSchool KB](https://cs-kb.leadschool.in/migration/en/knowledge/not-receiving-otp-parent-app)
- A DPS school's ERP parent app supports **only Android 10+**, and login works only on the school-registered number. [S] [DPS Navi Mumbai circular](https://dpsnavimumbai.edu.in/assets/uploads/Notice/Circular_Mobilise.pdf)
- Teachmint: parents with two children received messages in the calendar module instead of as notifications (2021). [S] [Capterra UK](https://www.capterra.co.uk/software/163105/teachmint). A MyClassCampus reviewer: students said *"the app crashed during the test they were taking and time ran out."* [V] [SoftwareFinder](https://softwarefinder.com/lms/teachmint/reviews)
- Entab CampusCare iOS: 3.3/5 from 19 ratings (small sample). [S] [App Store](https://apps.apple.com/in/app/campuscare/id1034721587)

**What good software must do:**
- The parent experience works in a **mobile browser on Android 8+** with no install required (a link from WhatsApp opens the child's page); an install is optional.
- Sign-in by OTP to the registered number, with WhatsApp as a second channel; if the number is wrong, the school can fix it and re-send in one step.
- One parent login shows **all siblings**, switching child in one tap.
- Pages load in under **3 seconds on a throttled 3G profile**; the main page weighs under ~500 KB.
- No dead ends: "no data to display" is replaced by a plain explanation and the school's contact.

### 2.5 Performance and outages at peak times (Rank 5)

**Problem:** Systems slow or fail exactly when everyone uses them: morning attendance, marks-entry deadlines, fee due dates.
**Who suffers:** teachers, exam coordinators, accountants.

Evidence:
- Punjab teachers (Apr 2026): *"the server often becomes overloaded, preventing attendance from being marked on time"*; *"teachers who have already marked attendance are later shown as absent due to system errors."* [V, News] [The Tribune](https://www.tribuneindia.com/news/jalandhar/teachers-cry-foul-over-mstar-app-seek-relief-from-attendance-burden/)
- Karnataka teacher: *"If the server hangs, we end up repeating the same entries."* [V] [Careers360](https://news.careers360.com/school-teacher-data-entry-burden-udiseplus-midday-meal-diksha-attendance-nishtha-ullas-portal-apps-login-monitoring-education)
- US/Canada: a gradebook down ~5 hours on grade day [S] ([Silver Chips](https://silverchips.mbhs.edu/content/glitch-in-electronic-grade-book-crashes-system-on-grade-day-24739)); Palo Alto crash erased over a month of grades, teachers re-entered them [S] ([eSchool News](https://www.eschoolnews.com/2009/05/13/palo-alto-computer-system-crashes-erasing-data/?print)); a Canadian union said teachers spent up to 80 hours fighting slow software [S] ([CFJC](https://cfjctoday.com/2015/12/10/new-software-still-causing-delays-for-teachers/)); Ohio teachers set alarms for 3 a.m. to get onto the system off-peak [S] ([CTU](https://ctu.oh.aft.org/quolke-corners/quolkes-corner-111809)). These are older but show the pattern.
- Classe365 reviewer: the platform *"can be slow to navigate."* [S] [Capterra](https://www.capterra.com/p/135075/Classe365/reviews/)

**What good software must do:**
- A save is never lost: if the network drops mid-entry, the teacher's marks/attendance are kept on the device and sent when the connection returns, with a clear "saved / waiting to send" state.
- Saving the same attendance twice does not create duplicates (idempotent saves).
- Load-tested: 100% of a school's teachers saving attendance in the same 10 minutes, and all parents opening a result link at once, without errors.
- Daily automatic backups with a tested restore; an owner-visible status note when something is down.

### 2.6 Usability, training and confusing changes (Rank 6)

**Problem:** Too many screens and steps; staff need repeated training; UI changes without notice.
**Who suffers:** teachers and admins, especially less tech-confident staff.

Evidence:
- PowerSchool SIS: *"Often too difficult to navigate and must jump too many screens to get the information you need."* (Nov 2022) [S] [Capterra](https://capterra.com/p/154883/PowerSchool-Student-Information-System/reviews/)
- PowerSchool Performance Matters: *"This is clunky. It is not user-friendly or intuitive. I am pretty good with tech, but I still have to rewatch tutorials every time I use the program because there are so many steps."* [S] [G2](https://www.g2.com/products/powerschool-performance-matters/reviews_and_filters)
- Older PowerSchool: attendance in one product, grades in another, so *"you must keep flipping between the two."* [S] [Capterra UK](https://www.capterra.co.uk/software/16487/power-school). TrustRadius: training *"takes more training than we'd like with new staff."* [S] [TrustRadius](https://trustradius.com/products/powerschool-unified-classroom/reviews)
- Teachmint/MyClassCampus: *"The constant change in interface aesthetics can be confusing at times"* and *"the updates also often lack adequate user information."* [V] [SoftwareFinder](https://softwarefinder.com/lms/teachmint/reviews)
- Toddle: navigation where two screens *"look nearly identical"*, which can lead to mistakes. [S] [Capterra CA](https://www.capterra.ca/software/1029768/toddle). Fedena (2018): interface *"non-intuitive and hard to navigate."* [S] [Software Advice](https://www.softwareadvice.com/k-12/fedena-profile/reviews/)

**What good software must do:**
- The top 5 tasks per role (teacher: attendance, homework, marks; accountant: collect fee, print receipt; parent: see dues, pay, see marks) are each reachable in **2 taps** from the home screen.
- A new teacher completes attendance and marks entry **without training**, guided by the screen alone (test with one real teacher).
- Changes to screens come with a short in-app "what changed" note.
- Every list has search; every action has a clear undo or correction path.

### 2.7 Communication overload and fragmentation (Rank 7)

**Problem:** Parents juggle many apps and group chats; teachers get messages at all hours on personal WhatsApp; important notices get lost.
**Who suffers:** teachers (no boundaries), parents (missed information).

Evidence:
- Teacher: *"It's 9 AM on a Saturday morning. A parent is asking about a lost binder and wonders how her kid is doing."* [V] [WeAreTeachers, 2020](https://www.weareteachers.com/too-many-parent-apps/)
- India (Ahmedabad): teachers added to WhatsApp groups where they *"might receive a message at any time of day or night."* (administrative, not parent, messages) [S, News] [The Wire](https://thewire.in/education/non-teaching-duties-government-school-teachers-india)
- Australia (McCrindle survey, Oct 2026): 26% of parents struggle with too many apps/platforms; 78% report some school-communication problem. [S] [McCrindle](https://mccrindle.com.au/media-releases/parents-demand-better-school-communication/)
- US/Canada (vendor-linked Edsby study, small sample): families asked to use 10-15 apps; 85% of parents rated satisfaction with multiple school apps 5/10 or lower. [S, Vendor] [Edsby](https://www.edsby.com/new-research-report-unveils-educational-app-overload-in-k-12-schools/pressreleases/)
- Malaysia (6-teacher qualitative study): parent WhatsApp groups extended working hours and invaded privacy. [S] (cited via search, Thai journal)
- No Indian national survey on parent-to-teacher WhatsApp volume was found (evidence gap).

**What good software must do:**
- One place for all school-to-parent messages (notices, homework, fees, results), delivered by **WhatsApp template first, SMS fallback**, with a delivery/read status per parent.
- Teachers can message parents **without sharing their personal number**; replies can be limited to school hours (quiet hours setting).
- The principal can see which parents did **not** receive or read an urgent notice and resend or call.
- A parent with two children gets one combined message, not two.

### 2.8 Report cards and exams (Rank 8)

**Problem:** Report-card formats don't match the board/school's format; combining term marks and co-scholastic grades is manual; mistakes are found after printing.
**Who suffers:** class teachers and exam coordinators at term end.

Evidence:
- Toddle: configuration placed constraints on Grade 10 report cards the school had designed. [S] [Capterra India](https://www.capterra.in/software/1029768/toddle)
- Edunext reviewers listed "examination management" as a gap. [S] [SoftwareSuggest](https://www.softwaresuggest.com/compare/edunext-vs-horizon-school-erp)
- CBSE schools keep periodic/term marks in separate registers and merge them in Excel; formats differ between classes; co-scholastic grades come from several teachers. [Vendor] [OpenEduCat](https://openeducat.org/gradebook/k12/india-cbse/marksheet/)
- An educator said report cards took ~40 hours before they built their own comment tool. [S] (podcast, Ignite Your Teaching)
- BC district: slow new system forced interim report cards to be done by hand. [S, News] [Tri-City News](https://tricitynews.com/local-news/student-data-system-on-track-but-slow-3019866)

**What good software must do:**
- Report card layout is configurable per school and class group (CBSE and state-board formats out of the box), previewed before publishing.
- Marks entry shows the teacher's progress ("28 of 40 entered") and blocks out-of-range values.
- The coordinator sees which subjects/teachers are still pending, and can lock marks before publishing.
- After publishing, a correction creates a new version with an audit trail, and parents see the corrected card.
- Report cards reach parents as a link on WhatsApp the same day they are published.

### 2.9 Data migration and year-end rollover (Rank 9)

**Problem:** Moving from Excel or another ERP is slow and error-prone; promoting classes at year end breaks fees, sections or history.
**Who suffers:** admins, accountants.

Evidence:
- PowerSchool tech director: *"the process for migrating user data is obtuse, and the year-to-year rollover is not as seamless as it should be."* [S] [Capterra](https://capterra.com/p/154883/PowerSchool-Student-Information-System/reviews/). Another reviewer: when students move between schools in the same district their data is lost. [S] (Capterra regional page)
- BC district: clerical staff manually re-entered home contact details because old and new systems structured data differently. [S, News] [Tri-City News](https://tricitynews.com/local-news/student-data-system-on-track-but-slow-3019866)
- AdminPlus (2016): *"After 15 years, we're shelving Rediker"*, citing unstable integrations and extra charges for customisation. [S] [Capterra](https://capterra.com/p/10010511/Administrator-s-Plus/reviews/)

**What good software must do:**
- An admin can import students, parents and opening fee balances from a spreadsheet, see row-by-row errors **before** anything is saved, and fix and re-import.
- Year-end promotion runs as a preview first (who moves where, who is held back, dues carried forward) and can be checked before confirming.
- Past years remain readable after rollover (old report cards, receipts).

### 2.10 Support quality and vendor lock-in (Rank 10)

**Problem:** Small issues need tickets and wait; support is slow in busy seasons; leaving a vendor is hard.
**Who suffers:** admins and owners.

Evidence:
- MyClassCampus: *"we have to lodge a support ticket just to be able to get their attention for the smallest possible issue"*; *"Their customer feedback rate is a bit slow."* [V] [SoftwareFinder](https://softwarefinder.com/lms/teachmint/reviews)
- Classe365 (2025): customer service *"is not good and response time in critical seasons of our school are horrible."* [S] [Capterra](https://www.capterra.com/p/135075/Classe365/reviews/)
- PowerSchool: a reviewer called customer service *"pointless."* [S] [Capterra](https://capterra.com/p/175664/PowerSchool/reviews/)
- Teachmint reviewer noted the company lacks a Kerala office (local presence matters). [S] (Capterra)
- Lock-in: no Indian evidence found of vendors refusing exports; a competitor's guide says CSV/Excel export is the normal path. [Vendor] [OpenEduCat](https://openeducat.org/glossary/what-is-fedena-alternative/). Treat as a buyer's fear rather than a documented pattern.

**What good software must do:**
- The owner can export **all** their school's data (students, fees, receipts, marks, attendance) to CSV/Excel themselves, any time, with no vendor involvement.
- In-app help in plain words for each screen; a WhatsApp support line in local language with a response target in the peak weeks (admissions, fee due dates, exams).
- Admins can fix common things themselves (reset a parent's login, correct a phone number, reopen marks entry) without a ticket.

### 2.11 Pricing and hidden costs (Rank 11)

**Problem:** The quoted price grows: per-SMS charges, paid modules, annual maintenance, price changes after signing.
**Who suffers:** owners.

Evidence:
- Classe365: a reviewer agreed a price, then was charged more because the vendor *"didn't realize the amount of content."* [S] [Capterra](https://www.capterra.com/p/135075/Classe365/reviews/)
- A vendor's own checklist of hidden lines: data migration, branded vs shared parent app, biometric/GPS hardware and maintenance, SMS cost and who pays, training; perpetual licences with 18-25% annual maintenance; parent notifications *"quickly become the biggest recurring bill."* [Vendor] [eSchoolApp](https://nu.eschoolapp.in/blogs/school-erp-pricing-india/)
- Listed packages bundle 1 to 10,000 WhatsApp/SMS per year at Rs 5,000-30,000 for small schools (listing prices). [S] [Techjockey](https://www.techjockey.com/detail/school-erp)

**What good software must do:**
- One published price per student or per school, with message costs shown live (messages sent this month, cost so far) before any bill.
- Owner gets a warning before a message blast that will cost more than a set amount.
- No module is switched on silently; the owner sees what is on and what it costs.

### 2.12 Customisation limits (Rank 12)

Evidence: Teachmint/MyClassCampus: *"Customization has certain limitations at the moment"*; *"Customization is necessary but it can be time-consuming during the development process."* [V] [SoftwareFinder](https://softwarefinder.com/lms/teachmint/reviews). Classe365: limited customisation, *"some features are lacking especially in the forms section."* [S] [Capterra](https://www.capterra.com/p/135075/Classe365/reviews/). Toddle: interface leaves little room for branding. [S] [Capterra CA](https://www.capterra.ca/software/1029768/toddle)

**What good software must do:** fee heads, concession types, report-card layout, receipt header (school name, logo, address, registration number), admission form fields and class/section names are settings, not vendor work.

### 2.13 Attendance capture accuracy (Rank 13)

Evidence: Punjab teachers shown absent after marking (see 2.5). Vendor material: fingerprint readers fail on small children's developing fingerprints; *"a well-designed system never lets a single biometric failure mark a student absent."* [Vendor] [OpenEduCat](https://openeducat.org/solutions/attendance-management-system/). DPDP commentary treats biometrics as sensitive data. No Indian news report of wrong "absent" SMS to parents was found (evidence gap).

**What good software must do:** device punches and manual marks merge into one record; a missing punch is "not recorded", never "absent", until a teacher confirms; absence alerts go to parents only after the teacher confirms or after a set cut-off, and a wrong alert can be withdrawn with an apology message.

### 2.14 Connectivity and offline (Rank 14)

Evidence: *"Sometimes I even use my own mobile data because the school Wi-Fi doesn't work"* (UP teacher); *"Problems arise only when everything is expected immediately or when internet connectivity fails"* (Chandigarh). [V] [Careers360](https://news.careers360.com/school-teacher-data-entry-burden-udiseplus-midday-meal-diksha-attendance-nishtha-ullas-portal-apps-login-monitoring-education). MP guest teachers protested being required to use their own phones for e-attendance. [S, News] [Free Press Journal](https://www.freepressjournal.in/amp/bhopal/bhopal-guest-teachers-protest-mandatory-e-attendance). Punjab: poor rural connectivity *"further worsens the situation."* [V] [The Tribune](https://www.tribuneindia.com/news/jalandhar/teachers-cry-foul-over-mstar-app-seek-relief-from-attendance-burden/)

**What good software must do:** attendance and marks entry work offline and sync later; screens are light enough for 2G/3G; nothing requires a laptop.

### 2.15 Regional language and low literacy (Rank 15, weak evidence)

Evidence: ASER 2024 reports about 90% of 14-16-year-olds have a smartphone at home, but only 36.2% of boys and 26.9% of girls own one, so the parent's phone is often shared. [S] [Careers360 on ASER 2024](https://news.careers360.com/aser-report-says-over-56-percent-children-14-16-age-group-use-smartphone-for-educational-purpose). Himachal's state e-Samwad (text-based teacher-to-parent messages) was built because busy parents lacked time for meetings; its pilot reached 53% of parents. [S] [Brookings](https://www.brookings.edu/essay/case-study-e-samwad/). No source documented a Telugu-language school notice tool with verified outcomes (evidence gap).

**What good software must do:** parent-facing screens and message templates in Telugu, Hindi and English (parent's choice stored per parent); amounts and dates in local-friendly formats; key notices short enough to read on a lock-screen preview; optional voice note for low-literacy parents.

### 2.16 Staff resistance and adoption (Rank 16)

Evidence: an IIM Bangalore study of an Indian institution's ERP recorded staff who could not attend training, **resistance to double data entry** and reluctance to share knowledge. [S] [IIMB](https://research.iimb.ac.in/presentations/456). PowerSchool Mobile parents note the app *"works well only when teachers keep grades updated."* [S] [AppFollow](https://apps.appfollow.io/ios/powerschool-mobile/973741088?country=us). Indian teachers' main resistance is extra work (see 2.1).

**What good software must do:** the owner sees adoption per teacher (attendance marked today? marks entered?) without shaming; the old paper/Excel task is actually removed once the screen exists, so it is never double entry.

### 2.17 Multi-branch (Rank 17, evidence gap)

No user complaint about multi-branch use was found in this research. The need is inferred, not evidenced: chain owners want consolidated fee and attendance totals across branches while each branch keeps its own data. Verify with real chain owners before building.

---

## 3. Checklist: problem to verifiable check

P0 = must hold before selling to a school. P1 = needed in the first year. P2 = differentiator / later.

| # | Pri | Problem | Verifiable check |
|---|---|---|---|
| 1 | P0 | One school sees another's data | Automated test: a user of School A gets nothing from any School B record, page or export |
| 2 | P0 | Paid but shown unpaid | Simulate a gateway success with the browser closed: payment posts via webhook and shows "Paid" within 1 minute |
| 3 | P0 | Double payment | Paying an already-paid due is blocked; a forced duplicate appears on a "refund needed" list |
| 4 | P0 | No receipt | Every successful payment (online, cash, cheque) produces a numbered receipt and a WhatsApp/SMS link within 1 minute |
| 5 | P0 | Fee payment on a weak phone | On Android 8+ with 3G throttling, a parent goes from WhatsApp link to paid receipt in under 60 seconds |
| 6 | P0 | Payments deleted or edited silently | No delete path exists; reversals need a reason and appear in the audit log |
| 7 | P0 | Gateway vs bank mismatch | Daily settlement report matches gateway settlements (net of charges) to receipts and lists every unmatched line |
| 8 | P0 | Leaked documents | Uploaded files are not reachable without login; links expire; a public-URL scan of storage finds nothing |
| 9 | P0 | Vendor staff browsing school data | Support access is time-limited, requires the school's grant, and is logged where the owner can see it |
| 10 | P0 | Lost entries when network drops | Kill the network mid-save: attendance/marks are kept and sent on reconnect; no duplicates on retry |
| 11 | P0 | Slow attendance | A teacher marks a 40-student class in under 60 seconds (timed with a real teacher) |
| 12 | P0 | Parent cannot log in | OTP sign-in to the registered number works; admin can correct the number and resend in one step |
| 13 | P0 | Sibling confusion | One parent login shows all children; messages for siblings are combined |
| 14 | P0 | Data export / lock-in | Owner exports all students, fees, receipts, marks and attendance to CSV in one action |
| 15 | P0 | Backups | Daily backup exists and a restore has been tested in the last 90 days |
| 16 | P0 | Children's data law (DPDP) | Parent consent per purpose can be recorded and shown; a child's data can be exported or archived on request; privacy notice exists in English and Telugu (legal review before May 2027) |
| 17 | P1 | Peak-hour slowdowns | Load test: all teachers save attendance within 10 minutes and all parents open results within 10 minutes, with no errors and p95 under 2 s |
| 18 | P1 | Fee arrears invisible | Owner dashboard shows collected today / month / outstanding by class; one action sends reminders to all defaulters |
| 19 | P1 | Hidden charges to parents | Total payable, including any convenience charge, is shown before the parent pays |
| 20 | P1 | Concessions and late fees disputes | Each concession/late fee shows who approved it and when; parent sees the breakdown on the receipt |
| 21 | P1 | Fee carry-over at year end | Rollover preview lists dues carried forward per student; totals before and after match |
| 22 | P1 | Year-end promotion errors | Promotion runs as a preview; admin confirms; past years' records stay readable |
| 23 | P1 | Import from Excel | Import shows row-level errors before saving; nothing is written until all errors are fixed or skipped |
| 24 | P1 | Too many screens | Top 5 tasks per role reachable in 2 taps from home (checked per role) |
| 25 | P1 | Training needed | A new teacher completes attendance + marks entry unaided in a usability test |
| 26 | P1 | Report card format mismatch | CBSE and AP/TS state-board layouts available; preview before publish; school logo and fields configurable |
| 27 | P1 | Marks-entry deadline chaos | Coordinator sees pending subjects/teachers ("28 of 40 entered") and can lock marks |
| 28 | P1 | Corrections after publishing | A corrected report card creates a new version, logged, and parents see the latest |
| 29 | P1 | Missed notices | Each notice shows delivered/read counts per parent; unread list can be re-sent or called |
| 30 | P1 | Teacher personal number exposed | Teacher-parent messaging works without revealing the teacher's number; quiet hours setting exists |
| 31 | P1 | WhatsApp fails | SMS fallback is sent automatically when a WhatsApp template fails; failure reason is shown |
| 32 | P1 | Wrong "absent" alert | A missing device punch never triggers an absent alert until a teacher confirms or a set cut-off passes; a wrong alert can be withdrawn |
| 33 | P1 | Small fixes need tickets | Admin can reset a parent login, fix a phone number and reopen marks entry without contacting the vendor |
| 34 | P1 | Message costs surprise | Owner sees messages sent and cost this month; warning before a costly blast |
| 35 | P1 | Audit trail | Every change to fees, marks and attendance records who, what, when (owner-readable) |
| 36 | P1 | Customisation needs vendor work | Fee heads, concession types, receipt header, admission form fields and class names are settings |
| 37 | P1 | Regional language | Parent screens and message templates available in Telugu, Hindi, English; parent's choice saved |
| 38 | P1 | Old phones | Parent pages work in Chrome on Android 8+ without installing an app; main page under ~500 KB |
| 39 | P1 | Confusing UI changes | Each release that changes a screen shows a short "what changed" note in-app |
| 40 | P2 | Government re-entry (UDISE+ etc.) | Export of student data in the fields UDISE+ needs, without re-typing |
| 41 | P2 | Offline marks/attendance | Attendance and marks entry usable fully offline for a day, synced later |
| 42 | P2 | Low-literacy parents | Optional voice note attached to key notices |
| 43 | P2 | Adoption invisible | Owner sees per-teacher completion (attendance today, marks entered) |
| 44 | P2 | Old applicant data kept forever | Scheduled purge or archive of non-admitted applicants after a set period |
| 45 | P2 | Breach response | Vendor can list which schools/records an incident touched within hours (runbook exists and was rehearsed) |
| 46 | P2 | Multi-branch (unverified need) | A chain owner sees combined fee and attendance totals across branches; branch data stays separate |
| 47 | P2 | Support in peak weeks | WhatsApp support in Telugu/English with a published response target during admissions, fee dues and exams |

---

## 4. Gaps and next research steps

1. Read 1-star Google Play reviews (sorted by newest) for Teachmint, Entab CampusCare, MyClassboard, Fedena and any AP/Telangana-specific school apps; tag them against this checklist.
2. Search Reddit manually (r/Teachers, r/k12sysadmin, r/india, r/hyderabad, r/Indian_Academia) for SIS and school-app complaints.
3. Interview 5 AP/Telangana school owners and 5 accountants: confirm the fee and reconciliation items, multi-branch need and price sensitivity.
4. Get a lawyer's reading of the DPDP Rules 2025 Gazette text on the educational-institution exemption and on whether a school ERP vendor is a "Data Processor" (deadline about 13 May 2027).
5. Check the current status of Telangana's fee-regulation bill and any AP fee-display or receipt rules, because they could add mandatory fields to receipts and fee structures.
