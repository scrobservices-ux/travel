# Shepherd

Congregation coordination for a body of elders — scheduling, records, territories and
task tracking, with three interfaces over one set of data: **publisher**, **elders** and
**administration**.

Zero-install: open `index.html` in a browser. No build step, no dependencies, no server.
Everything is stored in the browser (`localStorage`) with a one-file JSON backup.

> Shepherd is an independent tool. It is not affiliated with, authorised by, or endorsed
> by Watch Tower Bible and Tract Society, jw.org, or any legal entity used by Jehovah's
> Witnesses. See **Where meeting programs come from** below.

---

## Run it

```bash
open shepherd/index.html          # or double-click it
# or serve it:
cd shepherd && python3 -m http.server 8080   # then http://localhost:8080
```

It opens on a demo congregation (Riverside, 36 publishers, plus Northgate for the
multi-congregation view). Administration → Backup & restore → **Clear everything** gives
you an empty book to start a real congregation.

Switching person is the sign-in: the **⇥ icon at the bottom of the left rail** picks who
you are, and the workspace rail above it switches between the three interfaces that
person's roles allow.

---

## The three interfaces

| Workspace | Who opens it | What it holds |
|---|---|---|
| **My Congregation** | every publisher | their assignments, the meeting programs, monthly report, their territories, announcements, their own contact details and away dates |
| **Elders Desk** | elders, ministerial servants, group overseers | congregation overview, meeting schedule, assignment board, duty rota, publisher records, field service reports, territories, shepherding, task board, attendance, accounts, announcements |
| **Administration** | account administrator | congregations, users & roles, program source, subscription, backup & restore, audit log |

Access is by **role**, not by workspace. Everyone is a publisher; adding a role —
elder, secretary, coordinator, accounts servant, territory servant, Life & Ministry
overseer and so on — turns on the matching pages. The full capability → role matrix is in
`js/schema.js` and is rendered for reference on Administration → Users & roles.

---

## What it does

**Meeting schedule** — the week's program with every part, its timing and its source
material. Each slot opens a picker that ranks eligible people by who has waited longest,
showing why anyone was ruled out (away, already on that meeting, not marked for the part).

**Auto-fill** — proposes a whole week in one pass. It fills the scarcest pools first (a
part only four elders can take goes before one any brother can take), gives the chairman
his own opening and concluding comments, never puts the same person on two parts in one
meeting or in the chair at both meetings in one week, and skips anyone with away dates
over that meeting. Nothing is applied until you review the proposal.

**Assignment board** — every upcoming part and duty as a card, dragged
Unassigned → Proposed → Notified → Confirmed as you invite people and they accept.
Publishers confirm or decline from their own workspace.

**Duty rota** — attendants, audio/video, microphones, platform, Zoom host and cleaning
groups, generated round-robin across as many weeks as you like, skipping anyone already
on the platform that night. Printable and CSV-exportable.

**Publishers** — the record card: status, publisher type, appointment, service group,
contact details, qualifications (which drive the scheduler), away dates, the service-year
field service record, every assignment they have had, and their shepherding history.

**Field service reports** — publishers submit in about ten seconds; the secretary sees
what is outstanding, records reports handed in on paper, and gets the congregation summary
and the twelve-month trend. Publishers who have not reported for two months or more are
surfaced on the overview.

**Territories** — check out and check in with a due date, overdue detection, per-territory
history, and the publisher's own "hand it back" button.

**Shepherding** — visit records confidential to the body of elders, with follow-up dates
and per-group coverage so nobody is quietly missed.

**Elders' tasks** — a board plus a "next elders' meeting" agenda you can copy out.

**Attendance** and **accounts** — meeting counts with monthly averages, and receipts,
expenses and the monthly accounts report read to the congregation.

Everything with a table exports to CSV; schedules print (there is a print stylesheet that
drops the app chrome).

---

## Where meeting programs come from

The published meeting workbook and Watchtower study material are copyrighted, and the
publisher's terms of use do not permit a third-party service to scrape or redistribute
them. **Shepherd therefore never fetches that content on its own.** It gives four
legitimate routes instead:

1. **Standard structure** — every week is created with the normal part structure and
   timings, so a congregation can schedule people before the program is in hand. This is
   the default and needs no import at all.
2. **Paste** — an elder copies the week from material the congregation already has and
   pastes it in. The parser recognises week headings (`NOVEMBER 3-9`), section headings,
   numbered parts with `(5 min.)` timings, song numbers, the Bible reading, and the
   `Public Talk:` / `Watchtower Study:` lines. Assignments already made are carried over
   where the part still matches.
3. **File import** — JSON or CSV from whatever tool you already use:
   ```json
   [{ "week": "2026-11-03", "bibleReading": "Proverbs 30",
      "parts": [{ "section": "treasures", "no": 1, "title": "…", "minutes": 10 }] }]
   ```
   ```csv
   week,section,no,title,minutes,source
   2026-11-03,treasures,1,"Every Saying of God Is Refined",10,
   ```
4. **Configured feed** — an administrator can point Shepherd at a JSON endpoint their
   congregation is licensed to read (self-hosted, or a provider they have rights to).
   It is off until both the URL is set *and* the permission box is ticked, on
   Administration → Program source.

Try route 2 now: Meeting schedule → Import program → **Load a sample** → Parse → Import.

---

## SaaS shape

Multi-congregation and multi-tenant from the data model up: every record carries a
`congId`, the header switches congregation, and Administration shows publisher counts and
plan limits per congregation. Three plans (single congregation / standard / circuit) are
defined in `js/schema.js` with their limits enforced in the UI. This build has no payment
processing — it runs entirely in your browser — so the subscription page changes limits
and features rather than charging a card. An audit log records every change made through
the app.

---

## Layout

```
shepherd/
  index.html            script order matters (plain scripts, no modules)
  css/tokens.css        design tokens — light and dark are a token swap
  css/app.css           shell, components, print rules
  js/util.js            DOM, dates, CSV, icons
  js/schema.js          roles, permissions, part types, duties, statuses, plans
  js/seed.js            demo congregations
  js/store.js           persistence, selectors, audit
  js/auth.js            roles → capabilities → workspaces
  js/ui.js              component kit (tables, modals, pickers, lozenges, flags)
  js/program.js         program skeletons, parsers, import/export
  js/scheduler.js       eligibility, ranking, auto-fill, rota, conflicts
  js/app.js             navigation, hash router, quick find
  js/views/*.js         one file per area
  test/                 headless browser checks
```

## Test it

```bash
node --check js/*.js js/views/*.js        # syntax

npm i playwright                          # once, anywhere on the path
node test/smoke.js       # every view in all three workspaces + engine checks
node test/interact.js    # clicks the real UI: assign, auto-fill, import, drag, submit
```

Both exit non-zero on any console or page error. `test/smoke.js` also checks that a
publisher is blocked from elder-only pages and that data survives a reload;
`test/interact.js` drives assignment, auto-fill, program import, task drag-and-drop, rota
generation, territory check-out, report submission and a backup round trip. Screenshots
land in `/tmp`.
