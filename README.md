# School OS

The complete software for running a school, by DREAM TEAM SERVICES.

> Don't make people learn the software. Make the software understand people.

The product is described in full in [docs/blueprint](docs/blueprint/README.md). It is built one
piece at a time, in the order in [06-build-order.md](docs/blueprint/06-build-order.md), and each
piece arrives as its own pull request.

## What is built so far

**Stage 1, piece 1: the foundation** (`08-platform-security.md` and `modules/00-global.md`)

- Sign in, sign out, sign out everywhere, signed-in devices and change password.
- New users set their own password from an invite link. Passwords are stored so nobody can read them.
- Five wrong passwords lock a login for 15 minutes, and the School Admin is told.
- Each school's data is walled off inside the database itself, with tests that try to break the walls.
- The ten ready roles and ten role templates from `05-roles.md`. The menu shows only what a role allows, and the server checks again.
- The top bar on every screen: Search, Approvals, Notifications, Messages, Profile, School switcher and Academic year.
- The phone layout: slide-out menu and the bottom bar with Home, Search, Approvals, Notifications and Me.
- An audit log that can never be changed or deleted.

Next: module 1, **Settings**.

## Running it on a computer

You need Node.js 22 and PostgreSQL 16.

```bash
cp .env.example .env          # then fill in every value
npm install
npm run db:setup              # once, as a PostgreSQL superuser: makes the database roles
npm run db:migrate            # builds the tables
npm run db:seed               # a demo school with a few users
npm run dev                   # open http://localhost:3000
```

Demo usernames: `principal` (two schools), `admin`, `accountant`, `teacher`, `librarian`, `viceprincipal` (sees, never changes).
Their password is `DEMO_PASSWORD` from your `.env`.

## Checks

```bash
npm run lint
npm run typecheck
npm test        # uses a separate school_os_test database
npm run build
```

The same checks run on every pull request.
