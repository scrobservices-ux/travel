# Shepherd

Congregation coordination for a body of elders — scheduling, records, territories and
task tracking, with three interfaces over one set of data: **publisher**, **elders** and
**administration**.

Runs two ways, and the app is the same either way:

- **Shared** — run the bundled server on one computer in the congregation. Everyone signs
  in with their own account from their own phone or laptop, over one database that stays
  on that machine. No cloud, no accounts anywhere else, no npm install.
- **Local** — open `index.html` straight from disk. Everything stays in that one browser.
  Good for trying it out or for one person keeping the schedule on their own laptop.

No build step and no dependencies in either mode.

> Shepherd is an independent tool. It is not affiliated with, authorised by, or endorsed
> by Watch Tower Bible and Tract Society, jw.org, or any legal entity used by Jehovah's
> Witnesses. See **Where meeting programs come from** below.

---

## Run it for the whole congregation

On one computer that stays on — a laptop at the hall, a spare desktop, a Raspberry Pi.
It needs Node.js 18 or newer and nothing else.

```bash
cd shepherd
node server/server.js --port 8080
```

It prints the address to share:

```
Shepherd server 1.0
  data       /…/shepherd/server/data
  database   not set up yet
  logins     none — open the app to set up the first administrator
  listening  http://localhost:8080
  on the LAN http://192.168.1.20:8080
```

1. Open that LAN address in a browser. The **first person to open it sets up the
   administrator account** — name, email, password, congregation name, and whether to
   start empty or load the demo data to look around first.
2. Add the publishers (Publishers → Add publisher), or restore a backup you already have.
3. Give people logins: **Administration → Logins & sharing → Create login**. A one-time
   password is generated to read out; they choose their own the first time they sign in.
4. Everyone opens the same address on their phone and signs in. Elders see the Elders
   Desk, publishers see their own workspace — the same three interfaces, now over shared
   records.

Changes appear on everyone else's screen within a few seconds. Records sync one at a time,
so two elders working on different things at once never overwrite each other, and each
browser keeps a cached copy: if the network or the server goes down, the app keeps working
and queues what you change until it can send it.

**Where the data lives.** One JSON file in `server/data/`. Back it up by copying that
folder, or from Administration → Backup & restore. Password hashes are in a separate file
(PBKDF2-SHA256) and are never part of the synced document.

**Over the internet.** Plain HTTP is fine on a hall or home network. If the server is
reachable from outside it, put it behind a reverse proxy with TLS, or pass a certificate
directly:

```bash
node server/server.js --port 8443 --cert fullchain.pem --key privkey.pem
```

Other options: `--host` (default `0.0.0.0`), `--data <dir>` (default `server/data`).

### Run it for yourself only

```bash
open shepherd/index.html          # or double-click it
```

It opens on a demo congregation (Riverside, 36 publishers, plus Northgate for the
multi-congregation view). Administration → Backup & restore → **Clear everything** gives
you an empty book. In this mode switching person *is* the sign-in: the **⇥ icon at the
bottom of the left rail** picks who you are, and the workspace rail above it switches
between the three interfaces that person's roles allow. Take a backup and restore it on
the server later if you decide to share it.

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

In shared mode the **server enforces the same table**, so hiding a page is not the only
thing standing between a publisher and the congregation's records — a request to change
something their roles do not cover is refused. Publishers get four deliberate
self-service exceptions: their own contact details and away dates, their own field
service report, confirming or declining an assignment they are on, and handing back a
territory checked out to them.

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

## How sharing works

Every record — a person, a week, a territory, a report — is synced on its own, keyed by
collection and id.

- A change in the browser is turned into a per-record change, queued, and pushed within
  about half a second.
- Each client polls for what it has not seen yet (every five seconds, paused when the tab
  is hidden) and applies it.
- Because the unit is a record, two elders editing different things at the same time both
  land. Two people editing *the same* week at the same moment is last-write-wins on that
  week — rare in practice, and the audit log shows who wrote what.
- The queue is kept in the browser, so edits made with no network survive a reload and go
  up when the server is reachable again.
- The server writes to disk before it tells the client a change was accepted.

The header chip shows which mode you are in and whether everything is saved; click it for
the last sync, anything still waiting, and sign-out.

---

## SaaS shape

Multi-congregation and multi-tenant from the data model up: every record carries a
`congId`, the header switches congregation, the server refuses cross-congregation writes,
and Administration shows publisher counts and plan limits per congregation. Three plans
(single congregation / standard / circuit) are defined in `js/schema.js` with their limits
enforced in the UI. There is no payment processing — self-hosted, so the subscription page
changes limits and features rather than charging a card. An audit log records every change
made through the app, and in shared mode each change also records which account made it.

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
  js/store.js           persistence, selectors, audit, per-record change tracking
  js/sync.js            local vs shared mode, login, push/pull, offline queue
  js/auth.js            roles → capabilities → workspaces
  js/ui.js              component kit (tables, modals, pickers, lozenges, flags)
  js/program.js         program skeletons, parsers, import/export
  js/scheduler.js       eligibility, ranking, auto-fill, rota, conflicts
  js/app.js             navigation, hash router, sign-in screens, quick find
  js/views/*.js         one file per area
  server/server.js      HTTP server, API, static files  (no dependencies)
  server/db.js          the shared JSON database and its change log
  server/auth.js        passwords (PBKDF2-SHA256) and sessions
  server/permit.js      server-side authorisation, from the same role table
  server/data/          the congregation's database — not in git
  test/                 headless checks
```

## Test it

```bash
node --check js/*.js js/views/*.js server/*.js   # syntax
node test/server.js                              # server: setup, login, sync, permissions

npm i playwright                                 # for the browser suites
node test/smoke.js       # every view in all three workspaces + engine checks
node test/interact.js    # clicks the real UI: assign, auto-fill, import, drag, submit
node test/shared.js      # two browsers on one server, including going offline
```

All four exit non-zero on failure. `test/server.js` needs nothing but Node and covers
first-run setup, wrong passwords, publisher self-service limits (a publisher may confirm
their own part but not assign themselves one), and that no password material reaches the
synced document. `test/shared.js` runs two real browsers against a live server: an elder
assigns a part, the publisher sees it without reloading and confirms it, the elder sees
the confirmation come back, the server is killed mid-session to check the app keeps
working and queues the change, then restarted to watch the queue drain. Screenshots land
in `/tmp`.
