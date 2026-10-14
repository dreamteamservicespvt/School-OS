# School OS UI prototype

A clickable design of the whole of School OS, with example data for Sunrise Public School. Design only: nothing is saved and no messages or payments are real.

## The two pages

- `school-os-prototype.html`: **the complete prototype.** Every page of every module in `docs/blueprint/modules`, every role, the Super Admin console from `07-super-admin.md`, Parent Link, the bus driver's app and the student login.
- `school-os-ui.html`: the round-1 design the owner approved, kept exactly as it was.

## How to look around

The dark bar at the top is only for the preview; it is not part of School OS.

- **Jump to a screen** opens any module, the sign-in pages, the Super Admin console or one of the other apps.
- **View as** signs you in as someone else. Each person sees only their own menu, home screen, quick actions, notifications and approvals, following `docs/blueprint/05-roles.md`:
  - the 10 ready roles: Principal, School Admin, Accountant, Teacher, Class Teacher, Receptionist / Front Office, Transport In-charge, Librarian, Hostel Warden, Store Keeper;
  - the role templates a school can switch on: Vice Principal, Academic Head, HR, Office Staff, Exam In-charge, Admission Counsellor, Counsellor, Gate Security, Student;
  - the other sides: a parent (Parent Link), a bus driver (Android app) and DREAM TEAM (Super Admin console).
- **Light / Dark** and **Computer / Phone** switch the look. The phone view is the real phone layout.
- The school colour and bigger text are in the profile menu, under **Colours and text size**.

Inside the app, each module has a row of tabs for its pages, using the page names from the blueprint. Pages with View access show a "View only" label and no add or change buttons; pages with Own access show "Only yours" and only that person's records.

## Source

React and Tailwind, built into one HTML file.

| File | What it holds |
|---|---|
| `src/main.jsx` | The app, page routing, the preview bar, the academic year and school switchers |
| `src/shell.jsx` | Menu, top bar, phone bar, search, notifications, profile menu |
| `src/config.js` | Every module and page name, every role and what it may open |
| `src/ui.jsx`, `src/kit.jsx` | The shared parts every screen is made from |
| `src/styles.css` | Colours (six school colours, light and dark) and text size |
| `src/dashboard.jsx`, `students.jsx`, `fees.jsx`, `attendance.jsx`, `parent.jsx`, `signin.jsx`, `other.jsx` | The round-1 screens |
| `src/mod-*.jsx` | One file per module, with its pages |
| `src/dashboards.jsx` | Home screens for each role, My profile, the Setup checklist |
| `src/superadmin.jsx` | The Super Admin console |
| `src/apps.jsx` | Driver app, Parent Link first open and consent, School Admin invite, school paused |
| `src/data.js`, `src/sample.js` | Example data |

To rebuild: run `sh build.sh`. It needs Node with esbuild, tailwindcss 3.4.17, @tailwindcss/container-queries 0.1.1 and lucide-react 0.441.0, and writes `dist/school-os-prototype.html`.
