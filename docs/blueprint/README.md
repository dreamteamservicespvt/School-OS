# School OS Blueprint

Prepared for DREAM TEAM SERVICES.

## What this is

School OS is the complete software for running a school: admissions, students, attendance, fees, exams, staff, salary and everything else, in one place. This blueprint shows how it works **as one system**: the 20 modules, how information moves between them, the real work of a school year and a school day, the records the software keeps, who sees what, and the order in which it is built.

It has three uses:

1. **To understand it yourself.** Diagrams and short explanations, in school words.
2. **To show anyone else.** Developers, partners, staff or a school owner can read the same pages.
3. **To hand to an AI coding agent (Claude Code) to build from.** See the last section.

The blueprint is drawn from the agreed plan (`school-os-plan.md`), the feature map appendix, the full feature list, and notes on the old software. It invents no new features. If the blueprint and the plan ever disagree, the plan wins and the blueprint should be fixed. Any visual page made from these files should match them.

## The rules behind every screen

1. Don't make people learn the software. Make the software understand people.
2. Enter information once, and everything connected updates automatically.
3. Prevent mistakes, explain them, and let people recover.
4. People approve important or irreversible actions. AI never invents facts. It uses only the school's real data, shows its ideas as suggestions, and acts only after a person says yes.
5. Familiar school words only, the same word for the same thing everywhere.

## What is in this folder

| File | What it answers | Who it is most for |
|---|---|---|
| `README.md` | What this is, how to read it, and how to give it to Claude Code. | Everyone |
| `01-system-map.md` | How the 20 modules and the top bar fit together, and what information moves between them. One map, 89 numbered arrows, each explained in one sentence. | Everyone |
| `02-workflows.md` | 15 pieces of real school work from start to finish: who does what, what the software does by itself, what could go wrong, and which records change. Each has a diagram with one lane per person. | Owner, school staff, builders |
| `03-school-year-and-day.md` | Which modules are busy through an Indian school year and through one school day. | Owner, school staff |
| `04-data-model.md` | Every record the software keeps (Student, Payment, Marks and so on), its key fields, how records link, and the rules that must always hold. | Builders and Claude Code |
| `05-roles.md` | Which role sees which module: Full, View, Own or none, for the 10 ready roles and the role templates. | Owner, builders |
| `06-build-order.md` | The 4 build stages, what each module needs first, what a school can do after each stage, and which stage is the first version a school can buy. | Owner, builders |
| `07-super-admin.md` | DREAM TEAM SERVICES' own console: adding schools and their first School Admin, plans and billing, support access, team and activity log. *Decided 9 October 2026.* | Owner |
| `08-platform-security.md` | The work under every screen: each school's data kept apart, passwords, encryption, backups, uptime, speed, connections, offline rules, children's data law and rules for the builder. | Owner, builders and Claude Code |
| `modules/` | One detailed spec per module, plus `00-global.md` for the rules every screen shares. Written separately, in the same names. | Builders and Claude Code |

## Read it in 5 minutes

1. **Minute 1.** Open `01-system-map.md`. Look at the map, then read "The six layers" and "What to notice".
2. **Minute 2.** Open `03-school-year-and-day.md` and read the school day table. It shows which module is busy at each hour.
3. **Minutes 3 and 4.** Open `02-workflows.md` and read workflow 2 (fee collection at the counter) and workflow 5 (daily attendance). Watch the steps marked **Automatic**: one entry updates the receipt, the balance, the Day Book, the Dashboard and the parent's message.
4. **Minute 5.** Open `06-build-order.md` and read "What a school can do after each stage". Stage 2 is the first version a school can buy, with report cards and Parent Link.

Later, when you need it: `05-roles.md` for who sees what, and `04-data-model.md` for the builders.

## Decisions made

The owner accepted these on 9 October 2026. The blueprint is written for these answers.

| Question | Decided |
|---|---|
| Which online payment gateway should be connected first: Razorpay, PhonePe or Easebuzz? | **Razorpay.** It is already active in the demo school and most Indian schools know it. Cash and UPI at the counter work from the first day. |
| Should staff be allowed to delete a fee payment? | **No.** A wrong payment is cancelled with a reason and stays on record, so receipts, balances and the Day Book always match. |
| Should Transport, with live bus tracking, be in the first version a school can buy? | **No.** The first version reaches schools sooner without it. Transport is the first module built after the rest. |

The owner asked Claude to decide these on 9 October 2026, after the gap review (`../reviews/blueprint-gaps.html`; full wording in `../reviews/decisions-2026-10-09.md`):

| Question | Decided |
|---|---|
| Do parents get an app or login? | **Not yet. Parents get a Parent Link in the first version you can sell.** One secure link per parent, sent on WhatsApp or SMS, with no password. It shows fees due with a Pay button, receipts, attendance, notices, the datesheet, report cards and consent forms. A full parent app is planned straight after Stage 4. |
| Should report cards be in the first version a school can buy? | **Yes.** Examination & Results moves into Stage 2. |
| Where do backups, data separation and security live? | **In School OS itself** (`08-platform-security.md`), built in Stage 1. The Super Admin console (`07-super-admin.md`) has only DREAM TEAM's own screens. |
| How does a school move in from its old software? | **Workflow 15, "Switching to School OS",** with imports for old dues, past receipts, opening cash and bank balances, enquiries, items and assets. A school can start any day of the year. |
| Indian rules | **Parent consent** for children's data (DPDP Act 2023) on the admission form or Parent Link, with a one-time code. **SMS DLT** IDs stored and required. **GST** on taxable fee heads with tax invoices. A **financial year** (April to March) separate from the school year. |
| PF, ESI and TDS on salaries | **PF and ESI are worked out** in the first version of Salary. **TDS is typed in** as a monthly amount. Professional Tax by state is optional. |
| Groups of schools | **A Group record is added now,** and one login can work in several schools. Group screens come later. |
| Phone apps | **Staff use the installable web app.** Transport comes with a **small Android driver app.** A native parent app comes with the full parent app. |
| When do salary and expenses reach the Day Book? | **When they are marked paid,** because that is when money leaves. |
| Is the Super Admin console part of the plan? | **Yes.** DREAM TEAM's own console for adding schools, their first admin login, plans and billing, and support access only with the school's Allow. See `07-super-admin.md`. |

## Not included

- **Safety & Health:** health records, medical room, vaccinations, safety incidents and the nurse role.
- **Full parent app or parent login:** planned for after Stage 4, not specified here. Parents use **Parent Link** (no password) and WhatsApp, SMS and email until then.
- **School Website:** website pages, news and an online admission form on the website.
- The "Share the App" link is removed from the menu.

## The names used everywhere

**The 20 modules, in menu order:** Dashboard, Admission Management, Student Management, Academic Management, Attendance Management, Fee Management, Finance Management, Examination & Results, Staff & HR Management, Salary Management, Communication, Transport Management *(optional)*, Library Management *(optional)*, Inventory Management *(optional)*, Hostel Management *(optional)*, Front Office, Homework & Learning, Events & Calendar, Reports & Analytics, Settings.

**The top bar, on every screen:** Search, Approvals, Notifications, Messages, Profile, School switcher, Academic year.

**The records:** listed with their fields in `04-data-model.md`. Every file uses those names.

## How to give this to Claude Code

Claude Code is an AI coding agent. It reads the files in a code repository and writes the software from them. This section uses a few technical words; each is explained where it first appears.

### 1. Put the folder in the code repository

A **repository** is the folder where the software's code is kept, usually on GitHub. Copy this whole `blueprint` folder into the repository as `docs/blueprint/`. Keep `modules/` inside it, so the module specs sit at `docs/blueprint/modules/`.

```text
your-repository/
  CLAUDE.md
  docs/
    blueprint/
      README.md
      01-system-map.md
      02-workflows.md
      03-school-year-and-day.md
      04-data-model.md
      05-roles.md
      06-build-order.md
      08-platform-security.md
      modules/
        00-global.md
        01-dashboard.md
        ... one file per module, numbered in menu order
    source/
      school-os-plan.md
      feature-map-appendix.md
```

Putting the plan and the feature map appendix in `docs/source/` is optional. It lets the agent check the plan's own wording.

The files are **Markdown** (`.md`): plain text with simple formatting such as headings and tables. The diagrams are written in **Mermaid**, a way of writing diagrams as text. GitHub and many viewers draw them as pictures, and Claude Code reads the text directly.

### 2. Add a short CLAUDE.md

**CLAUDE.md** is a file at the top of the repository that Claude Code reads at the start of every session. Put these lines in it:

```text
# School OS
The product blueprint is in docs/blueprint/. Read docs/blueprint/README.md before any work.
Build one module at a time, in the order in docs/blueprint/06-build-order.md.
Module names, page names and record names must match the blueprint exactly.
Never build anything listed under "Not included" in docs/blueprint/README.md.
Follow the "Decisions made" in docs/blueprint/README.md: Razorpay first, fee payments are never deleted, no Transport in version 1, report cards and Parent Link in version 1.
Follow docs/blueprint/08-platform-security.md for every module, and its "Rules for the builder":
never put a password, key or secret in the code; keep every school's existing data working
after each database change; let new features be switched on school by school; test that
one school can never see another school's data.
```

The Super Admin console (`07-super-admin.md`) is built in the same repository as School OS, with its own sign-in page, after Stage 2 and before the first school is sold.

### 3. Paste this as the first instruction

```text
Read docs/blueprint/README.md first. Then read, in full:
- docs/blueprint/01-system-map.md (how the modules connect),
- docs/blueprint/04-data-model.md (the records, their links and the key rules),
- docs/blueprint/modules/00-global.md (what every screen shares),
- docs/blueprint/08-platform-security.md (data kept apart, logins, backups, speed),
- the module spec in docs/blueprint/modules/ for the module we are building.
Also skim 02-workflows.md, 05-roles.md and 06-build-order.md.

We build School OS one module at a time, in the order in 06-build-order.md.
We start with Stage 1: the foundation in 08-platform-security.md and what 00-global.md
says every screen shares, then module 1: Settings.

If the repository has no code yet, first propose in plain words which technology you
will use and how the project will be laid out, and wait for my yes.

Before you write any code for a module:
1. Tell me in plain words what this module does, which records from 04-data-model.md
   it creates or changes, and which numbered arrows in 01-system-map.md touch it.
2. List anything unclear and anything marked "(inferred)". Ask me about each one.
3. Give me a short plan for this module only, and wait for my yes.

While building:
- Use the module, page and record names exactly as written in the blueprint.
- Follow every key rule in 04-data-model.md. For example: payments and receipts are never
  edited or deleted, past academic years are read-only, and every change to money, marks
  or attendance goes into the audit log.
- Follow the roles in 05-roles.md, and check permissions in the software for every action,
  not only by hiding buttons.
- Important or irreversible actions ask a person first. AI features only suggest,
  use only the school's real data, and never invent facts.
- Do not build anything listed under "Not included".
- Write tests for the key rules, for every automatic step this module owns, for the
  permissions in 05-roles.md, and that no school can see another school's data.

When the module is done, show me in plain words what a school can now do, list what is
left open, and stop. Do not start the next module until I say so.
```

**Tests** are small checks the agent writes so the computer can prove, every time the code changes, that the rules still hold. For example: "a payment can never be deleted".

### 4. For each next module

When you are happy with a module, paste this, changing the number and name:

```text
Now build module 2, Academic Management. Read its spec in docs/blueprint/modules/,
and re-read the parts of 01-system-map.md, 02-workflows.md, 04-data-model.md and
05-roles.md that mention it. Same rules as before: explain, ask, plan, wait for my yes,
then build, test, and stop when it is done.
```

### 5. What to check after each module

- Does it use the same names as the blueprint?
- Do the automatic steps in `02-workflows.md` for this module happen by themselves?
- Do the arrows in `01-system-map.md` that start or end at this module work with the modules already built?
- Does each role in `05-roles.md` see only what it should?
