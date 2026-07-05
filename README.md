# Cafe Alf Fresco — Compliance Tracker (prototype)

A staff task-tracking site for daily/weekly/monthly UK food-standards compliance:
cleanliness, food hygiene, cash management, stock control, new products, and more.
Built as a **local, no-build static site** (plain HTML/CSS/JS) so it can be reviewed
right away and later hosted on GitHub Pages.

## Running it

No installation needed. Two options:

1. **Just open it**: double-click `index.html`. Works in Chrome, Edge and Firefox.
2. **Local server (optional, avoids any browser file:// quirks)**:
   ```
   cd this-folder
   python3 -m http.server 8080
   ```
   then visit `http://localhost:8080`.

Demo logins (select name, enter PIN):

| Name | Role | PIN |
|---|---|---|
| Jason Ashwell | Admin | 1234 |
| Morgan (Manager) | Manager | 1111 |
| Sam (Supervisor) | Supervisor | 2222 |
| Alex (Staff, 19) | Staff | 3333 |
| Jamie (Staff, 17) | Staff | 4444 |

Admin → Settings → **Reset to demo data** restores the original seed data at any time.

## What's included

- **My Tasks**: hourly/daily/weekly/monthly/opening/closing task lists, filtered to what
  each person is actually allowed to do (see eligibility below), with a "Mark done" / "Skip"
  action that timestamps and attributes the completion. Filterable by team.
- **Dashboard**: today's / this week's compliance %, overdue tasks, compliance by category
  (staff see a simplified personal view).
- **Admin → Users**: add/edit staff, set **age**, **skills/training**, and **team**
  (Manager / Supervisor / Kitchen Staff / Front of House Staff), activate/deactivate.
- **Admin → Tasks**: add/edit tasks, set category, **team**, **expected duration**,
  recurrence (hourly/daily/weekly/monthly/opening/closing), required skills, minimum
  age, mandatory flag. Filterable by team.
- **Admin → Skills**: define the skills/training your business tracks (e.g. Food Hygiene
  Level 2, Cash Handling, COSHH) — used to gate who can do what.
- **Admin → Reports**: date-ranged compliance %, by-category and by-staff breakdowns,
  **expected vs. actual task timing** (flags tasks consistently running over), CSV export
  for inspection evidence.
- **Admin → Audit Log**: every login, completion, skip and admin change, with who/when.
- **Admin → Settings**: café name and opening/closing/kitchen-cutoff times.

Seed data includes ~20 realistic tasks across hourly food-safety checks, opening/closing
routines, daily cash/stock procedures, weekly deep cleans and safety checks, and monthly
pest control/self-audit/pricing reviews — edit or delete any of these to match your
actual procedures.

## Recurrence types

Six frequency types are available when adding/editing a task: **Hourly** (every hour in
a time range), **Daily** (once a day at a fixed clock time), **Weekly** (specific
weekday(s)), **Monthly** (a day of month, or "last"), and **Opening routine** /
**Closing routine** — these last two are due a set number of minutes before/after
whatever the café's opening or closing time is currently set to in Settings, so if
opening hours change, those tasks' due times move with them automatically instead of
needing to be edited one by one.

## Task timing

Every task has an **expected duration** (set by an admin, shown to staff on My Tasks so
they know roughly how long something should take). When a staff member marks a task
done, they can log how many minutes it actually took. Admin → Reports → "Task timing"
shows expected vs. average actual duration per task and flags anything consistently
running more than 20% over — useful for spotting tasks that are under-resourced or
under-timed. Logging actual time is optional (left blank if not entered); skipped tasks
don't ask for a time.

## Teams

Tasks and users can each be tagged with a **team** — Manager, Supervisor, Kitchen Staff,
or Front of House Staff — purely to organise and filter the task list (e.g. "show me
just the kitchen team's tasks"). This is separate from **Role**, which controls security
permissions (see below); team is just "who normally does this job," and doesn't restrict
who can actually complete a task — age and skill requirements remain the real gate.

## Age & skills eligibility

Every task can require a **minimum age** and any number of **skills** (your training/
certifications). A staff member only sees a task on "My Tasks" if they meet both. A
Manager/Supervisor/Admin can complete a task **on behalf of** someone else, but the
assignee list is still filtered to people who meet the task's requirements — so, for
example, a 17-year-old won't be logged against a cash-handling task, and someone without
"Food Hygiene Level 2" won't be logged against a hot-hold temperature check. If nobody
currently active meets a task's requirements, the app blocks logging it at all rather
than falling back to whoever is signed in.

## Security model

| Role | Manage users | Manage tasks/skills | View all reports | Complete tasks | Complete on behalf of others |
|---|---|---|---|---|---|
| **Admin** | Yes (incl. other Admins) | Yes | Yes + audit log | Yes | Yes |
| **Manager** | Yes (not Admin accounts) | Yes | Yes + audit log | Yes | Yes |
| **Supervisor** | No | No (view only) | Yes | Yes | Yes |
| **Staff** | No | No | Own history only | Own eligible tasks only | No |

This is enforced by every screen checking the logged-in user's role before rendering
admin actions, and by the eligibility rule above.

**Important — read before relying on this for real compliance evidence.** This is a
client-side prototype: all data lives in the browser's `localStorage`, and login is a
simple PIN check with no server. That means:

- Data doesn't sync between devices — each device/browser has its own separate copy.
- A technically capable person could edit the browser's stored data directly (devtools),
  bypassing the role checks above.
- Anyone with physical access to a logged-in device can act as that user until they log out.

That's an acceptable trade-off for quickly validating the design and workflow with your
team, but **before this is used to run the real café and produce evidence for a food
hygiene inspection, it should move to a real backend** — see below.

## Planned: Deputy rota integration

You use Deputy for rotas and payroll. Deputy has a REST API (a "Roster" resource,
queryable by date/employee/location) that can tell this tracker who is working when,
but pulling it in live isn't a good fit for the site as it exists today: calling
Deputy's API requires an access token, and a token can't be safely stored in
browser-side code that anyone could inspect via dev tools — it needs a small
backend sitting in between to hold the credential and talk to Deputy on the site's
behalf.

**Decision: build this once the Supabase backend migration happens (see below), not before.**
At that point, the plan is:

1. A small server-side job authenticates to Deputy's API (OAuth 2.0) and pulls the
   roster for each day/employee, writing it into Supabase.
2. **Today's rota panel** — a simple view (dashboard or a dedicated screen) showing
   who is working and when, pulled from that synced data.
3. **My Tasks filtered by shift** — instead of showing a task to everyone who is
   generally eligible (right age + skills), only show/assign it to staff who are
   *also* rostered on at that time. This also opens the door to a future coverage-gap
   warning (e.g. "no one rostered for the 1pm hot-hold check has Food Hygiene Level 2"),
   which wasn't asked for now but fits naturally on top of this once shift data exists.

No Deputy work is needed before then — this section is just so the plan isn't lost.

## Path to production hosting

GitHub Pages only serves static files, so it can't run a database or enforce login/
permissions on its own. Two good next steps, in order of effort:

1. **Supabase (recommended)** — free hosted Postgres database with built-in
   authentication and **Row Level Security**, which lets you enforce the same
   role rules above at the database level (not just in the browser). The existing
   `js/storage.js` module is the only file that would need rewriting to call
   Supabase instead of `localStorage` — the rest of the UI stays the same. The
   static frontend keeps living on GitHub Pages.
2. **Custom backend** (Node/Express + Postgres/SQLite) — full control, but needs
   separate hosting (Render, Railway, Fly.io, etc.) since GitHub can't run a server,
   even short-term.

## File structure

```
index.html
css/styles.css
js/storage.js       data layer (localStorage) + seed data
js/scheduler.js      recurrence engine (hourly/daily/weekly/monthly + eligibility)
js/auth.js           login/session + role permissions
js/util.js           DOM helpers, modal, CSV export, toasts
js/views-staff.js    login, dashboard, My Tasks
js/views-admin.js    Users, Tasks, Skills, Reports, Audit Log, Settings
js/app.js            navigation + router (loads last)
```
