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

Shared mode works on a hall network or over the internet — see [HOSTING.md](HOSTING.md)
for a tunnel from a computer at the hall, a small server with a domain, or Docker.

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

### Reaching it from anywhere

The LAN address only works inside the building. To reach it from home or from a phone on
mobile data, pick one of the routes in **[HOSTING.md](HOSTING.md)**:

| | What it takes | Good for |
|---|---|---|
| **Tunnel** (Cloudflare Tunnel or Tailscale) | one command; no domain, no port forwarding, HTTPS included | a laptop or Raspberry Pi at the hall behind a normal router |
| **Small server + Docker** | a £4/month VPS and a domain; `docker compose up -d` and the certificate is automatic | a congregation that wants it always on |
| **Existing server** | systemd unit and a Caddy or nginx snippet, both in `deploy/` | someone who already runs a server |

Over the internet, serve it over HTTPS — pass `--trust-proxy` when something else
terminates TLS in front. Sign-in is throttled per account, passwords are PBKDF2-SHA256 in
a file that never reaches a browser, and a strict Content-Security-Policy, HSTS and
anti-framing headers are sent on every response. Tailscale is worth a look if you would
rather the records were not on the public internet at all.

---

## Do I need to host it before I can start?

No. Enter everything in your browser today; move it to a server whenever you like.

1. Open `index.html`, clear the demo from **Administration → Backup & restore**, and
   import or type in your congregation's records.
2. When you are ready to share it, **download a backup** — one `.json` file with
   everything, uploaded files included.
3. Set the server up, sign in as the administrator, and **restore** that file.

Nothing is lost and nothing has to be re-typed.

---

## Bringing your existing files in

**Import files** (Elders Desk → Paperwork) takes a CSV or a straight copy-paste out of
Excel, Numbers or Google Sheets — select the cells, copy, paste. It reads the headings,
guesses which column is which, lets you correct it, and shows a preview of exactly what
will be created or updated before anything is written. Running the same file twice updates
rather than duplicates, because rows are matched by name.

- **Publishers** — names, group, type, appointment, contact details, baptism date.
  Service groups it has not seen are created for you.
- **Territories** — the register, including what is currently checked out and when it is due.
- **Field service reports** — historic months, so record cards and trends are complete from
  day one. `July 2026`, `2026-07` and `07/2026` are all understood.
- **Meeting attendance** — past counts.
- **A full backup** — Administration → Backup & restore, for moving between browsers or
  onto the server.

Meeting programs come in separately, on the meeting schedule — see **Where meeting
programs come from** below.

### Files such as PDFs

**Files** holds the things a congregation keeps that are not records: letters, forms,
maps, cleaning schedules. Drop them in, choose who may see each one — whole congregation,
elders and servants, or elders only — and they sync to everyone entitled to them. PDFs open
in the browser's own viewer, where they can be printed or saved again. Up to 8 MB a file;
they travel in the backup, so keep an eye on the total.

---

## Printing and PDFs

Everything printable lives in **Print & PDF** (Elders Desk → Paperwork). Pick a document,
press Print, and choose **Save as PDF** as the destination to get a PDF file instead of
paper — that works on every desktop browser, on iPhone and on Android, with no plugin and
nothing uploaded anywhere.

| Document | What it is |
|---|---|
| Meeting schedule | Both meetings, every part and who has it — one page per week, for the board |
| Assignment slips | A slip per assignment to hand out: part, date, setting, assistant and any note |
| Duty rota | Attendants, audio/video, microphones, platform and cleaning |
| Publisher list | Contact list by service group |
| Publisher record cards | A service-year card per publisher — months reported, studies, hours |
| Territory register | Every territory, who holds it, when it is due |
| Field service report | Congregation totals for a month, plus each publisher's line |
| Accounts report | The monthly report read to the congregation |
| Attendance record | Every meeting count for the service year with monthly averages |
| Elders' meeting agenda | What is on the agenda and who is caring for it |

Sheets are laid out at real paper size with proper page breaks, repeated table headings and
a choice of A4 or Letter. Individual pages still print directly too — the Print button on
the meeting schedule prints that week.

---

## The three interfaces

| Workspace | Who opens it | What it holds |
|---|---|---|
| **My Congregation** | every publisher | their assignments, the meeting programs, monthly report, their territories, announcements, their own contact details and away dates |
| **Elders Desk** | elders, ministerial servants, group overseers | congregation overview, meeting schedule, assignment board, duty rota, publisher records, field service reports, territories, shepherding, task board, attendance, accounts, announcements |
| **Administration** | account administrator | congregations, users & roles, program source, subscription, backup & restore, audit log |

Access is by **role**, not by workspace. Everyone is a publisher; adding a role —
elder, secretary, coordinator, accounts servant, territory servant, Life & Ministry
overseer and so on — turns on the matching pages.

---

## Who cares for what — and changing it

Each body of elders divides the work differently, so the arrangement is **theirs to set**,
not fixed in the software: **Administration → Roles & responsibilities** is a grid of
every capability against every role, saved on the congregation. Change it and both the
app and the server follow it from that moment; "Back to the default arrangement" undoes
everything.

A capability is granted three ways: **—** (not held), **own service group**, or **whole
congregation**. The middle one is how a group overseer normally works — he collects his
own group's reports and sees his own group's records, and nobody else's. It applies to
publisher records, keeping records, collecting reports and shepherding notes.

The default arrangement follows how the work is usually divided:

| Role | Holds by default |
|---|---|
| **Coordinator (COBE)** | everything the body handles, including arranging the circuit overseer's visit |
| **Secretary** | publisher records, collecting reports, attendance, announcements, files; sees the accounts but does not keep them |
| **Service overseer** | territories, collecting reports, sees publisher records |
| **Life & Ministry overseer** | prepares the meeting schedule and the duty rota |
| **Group overseer** | his own group's records, reports and shepherding notes |
| **Territory servant** | checking territories in and out |
| **Accounts servant** | keeps the congregation accounts |
| **Cleaning / maintenance servant** | the cleaning rota — whose turn it is, and calling a general cleaning |
| **Ministerial servant** | duty rota, attendance, files, sees the task board |
| **Elder** | shepherding, tasks, files, sees publisher records and the accounts |
| **Publisher** | their own report, their own details, the schedules and territory list |

Note what an elder does *not* get by default: preparing the meeting schedule or keeping
the publisher records, because in most congregations those belong to the Life & Ministry
overseer and the secretary. If your congregation does it differently — many small ones
share the work more widely — change it in the grid and it is so.

In shared mode the **server enforces the congregation's own arrangement**, so hiding a
page is not the only thing standing between a publisher and the records: a request to
change something their roles do not cover is refused, and a group-scoped grant is checked
against the record's service group. Only an account administrator can edit the arrangement
itself. Publishers keep four deliberate self-service exceptions: their own contact details
and away dates, their own field service report, confirming or declining an assignment they
are on, and handing back a territory checked out to them.

---

## What it does

**Meeting schedule** — the week's program with every part, its timing and its source
material. Each slot opens a picker that ranks eligible people by who has waited longest,
showing why anyone was ruled out (away, already on that meeting, not marked for the part).

**Auto-fill** — proposes a whole week, or balances a run of weeks in one pass so the
rotation stays level across all of them rather than each week starting the reckoning
again. What it takes into account:

- **Whose turn it is.** Candidates are ranked by how little they are carrying over a
  rolling six months — counting parts, assistant parts and duties together, and counting
  what is already booked ahead, not just the past. Someone who has never had an
  assignment comes to the top rather than being quietly skipped forever.
- **Not the same few every week.** Anyone already on that week goes to the back of the
  queue until everyone free has had a turn.
- **Scarcest first.** A part only four elders can take is filled before one any brother
  can take, or the scarce people are used up on the easy slots.
- **Away dates**, and each person's own availability — midweek, weekend, whether they are
  on the duty rota at all, and the most they have asked to be given in a month.
- **Demonstration partners**: the same sex as the student, and a member of the same
  household preferred where there is one. A mismatched pair entered by hand is flagged.
- **The chairman** gives his own opening and concluding comments, and nobody chairs both
  meetings in one week.

Nothing is applied until you have seen the proposal, including how many each person would
get.

**Or do it all by hand.** Every slot is a click: open it and pick whoever you want. The
list is *ordered* by whose turn it is, not restricted to it — tick **"choose anyone in the
congregation"** and everyone appears, including people not marked for that part, each
labelled so you know. The assignment is made either way; the app warns rather than
refuses, and offers to add the qualification to their record so it can propose them next
time. **Lock a week** and auto-fill leaves it alone. A congregation that would rather have
no suggestions at all can turn them off in its settings — the auto-fill buttons disappear
and the suggested order remains as a hint when you open a slot.

### It adapts to the size of the congregation

What is fair depends entirely on how many people there are. The size is taken from the
number of active publishers, and every limit follows from it — or the elders set it
themselves in **Administration → Congregations → How this congregation is scheduled**.

| | Most on one meeting | Most in one week | Fairness looks back | A pool is "thin" under |
|---|---|---|---|---|
| **Small** (under ~25) | 4 | 10 | 13 weeks | 2 people |
| **Medium** (~25–100) | 2 | 3 | 26 weeks | 4 people |
| **Large** (over ~100) | 1 | 1 | 39 weeks | 6 people |

In a small congregation the ceilings are effectively off, because the same brother
genuinely takes several parts a meeting — there is nobody else — and doubling up is not
reported as a clash. Fairness still decides the order. In a large one each person gets one
thing a week so the rotation reaches everybody. Tested at both ends: a twelve-publisher
congregation schedules eight weeks with everyone used and no gaps, and a 220-publisher
congregation plans twelve weeks in about half a second and reaches over 150 people.

When a slot genuinely cannot be filled the app says why in plain words — "only Daniel
Achebe is marked for it, and he is not free that night" — rather than leaving a silent
gap.

**Who is being used** — the report that answers "is anyone being left out, and is anyone
carrying too much". Every active publisher over three months, six months, the coming eight
weeks or the whole service year, with what they carry, when they were last used, what is
booked next, and any availability limits. It calls out three things the scheduler cannot
decide for itself:

- publishers who had **nothing at all** in the period;
- publishers **nobody has marked for anything**, whom the scheduler can therefore never
  reach;
- **where the rotation is thin** — a part or duty fewer than four people are marked for,
  which is nearly always the real reason one brother keeps coming round. Marking one or
  two more people is the single thing that spreads the work further.

**Assignment board** — every upcoming part and duty as a card, dragged
Unassigned → Proposed → Notified → Confirmed as you invite people and they accept.
Publishers confirm or decline from their own workspace.

**Duty rota** — attendants, welcome desk, audio/video, microphones, platform, **car park**,
**security watch**, literature counter, Zoom host and cleaning groups. "Manage duties" is
where a hall adds the arrangements it actually has and removes the ones it does not; each
one can require its own qualification. Filled across as many weeks as you like by the same
fairness rules as the meeting parts — including the weekly ceiling, so a brother with a
part on Thursday is not also given a microphone on Sunday while others are free.
Printable and CSV-exportable.

**Publishers** — the record card: status, publisher type, appointment, service group,
contact details, qualifications (which drive the scheduler), **availability** — midweek,
weekend, duty rota, and a monthly ceiling if they have asked for one — away dates, the
service-year field service record, every assignment they have had, and their shepherding
history. Publishers see their own availability on **My details** and add their own away
dates.

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

## Keeping the hall — the cleaning rota

Two arrangements, and most congregations run both. **Elders Desk → Cleaning rota**:

- **The group's turn.** Press *Fill the rota* and each service group is put in
  after the meeting your congregation cleans — every group in order, carrying on
  from whoever went last, so nobody is passed over and nobody keeps coming round.
  Swap two groups over by hand and the rotation carries on from the swap.
- **General cleaning.** Once a month, whichever week and day the congregation
  keeps — last Saturday at 9 by default. Everybody is invited, and everybody is
  reminded.

Whoever is on gets a reminder three days out — a pop-up on the phone and an email
saying which meeting it follows and any note left with it ("windows this time") —
and a second pop-up on the morning itself. The coordinator and the cleaning
servant are told for **every** turn, whichever group is on, because they are the
ones who get asked. Anyone who would rather not be messaged can turn it off on
their own page, and a publisher sees their own turns under **My Congregation →
Cleaning**.

A page of the rota prints for the notice board, and the turns land in each
publisher's calendar subscription along with their assignments.

---

## The circuit overseer's visit

**Elders Desk → Circuit overseer visit.** Put in the week he arrives, and the
whole preparation lays itself out **backwards from that day** — nineteen jobs by
default, each with a brother's name against it and the day it is wanted by:

| When | Some of what falls due |
|---|---|
| **8 weeks** | Confirm the dates; fix the time of the meeting with the body of elders |
| **6 weeks** | Send him whatever he has asked for in advance; accommodation and meals |
| **5 weeks** | The meeting schedule for the visit week; the field service arrangements |
| **4 weeks** | Publisher records and reports current; accounts and the last audit; territory records |
| **3 weeks** | Assign the meeting parts and tell everyone |
| **2 weeks** | A thorough cleaning; announce the arrangements; the list of calls to make with him |
| **1 week** | Sound, video and platform checked; confirm the last details; the files he will want |
| **The week** | The meeting with the body of elders |
| **Afterwards** | Pass on his recommendations; file the notes for next time |

Each job goes to whoever holds that responsibility — the secretary's to the
secretary, the accounts to the accounts servant — worked out from your own
congregation's arrangement, not a fixed list. Nothing is fixed: re-date anything,
hand it to somebody else, add your own, strike one out. If the dates move, every
job still to do moves with them; a job already done keeps the day it was done by.

Each brother sees **What is mine** at the top of the page and ticks his own off —
the server lets him tick his own and nothing else, so nobody can quietly re-date
another man's job or move the visit. He is reminded a week before each one is
wanted, and chased once a week while any is late. The coordinator sees how ready
the congregation is, who is carrying what, and whether one brother has been given
the lot. His own deadlines appear in his phone calendar, and the whole sheet
prints for the elders' meeting.

---

## Getting people in — invitations

Nobody has to be handed a password. In shared mode an administrator opens
**Administration → Users & roles**, presses **Invite**, and types the publisher's email
address:

1. The address is saved on their record, so the elders can see it in the usual place.
2. An email goes out with a link that is good for **14 days** and works once.
3. The publisher opens it, sees who invited them and which congregation it is for, and
   chooses their own password. Nobody else ever knows it.
4. They land straight in **My Congregation** — their assignments, the meeting programs,
   their report, their away dates. Nothing else.
5. Roles and qualifications are added afterwards, as the body decides: mark him for
   prayer, for the Bible reading, for a talk, put him on the attendant rota, make him a
   group overseer. The pages he can open follow from that at once, without a new
   invitation.

The users list shows where each person stands — *invited*, *accepted*, *expired* — and an
invitation can be sent again at any time. If email is not set up yet the link is shown on
screen instead, to pass on by hand or over WhatsApp; it works exactly the same.

Publishers still cannot promote themselves: roles are set by an administrator and the
server checks every write against the congregation's own arrangement.

---

## Notifications, calendar and the phone

**Email.** Set it up once on **Administration → Email & notifications** with whatever
account the congregation already has — a Gmail app password, the hall's own hosting, any
SMTP relay. Host, port, user, password, who it comes from; then **Send a test message**.
There is no third-party service in the middle, and the password never leaves the server.
Three kinds of message go out, and each person can switch any of them off on their own
**My details** page:

| Message | When |
|---|---|
| **You have been given something** | one message when a part or a duty is put against their name, however many landed at once |
| **The week ahead** | a short list, on the day and hour the administrator picks, and only to people who actually have something on |
| **Your report is due** | once, on the day it is due, and only if it is not already in |
| **Your group is cleaning** | three days before your group's turn, and before a general cleaning |
| **The circuit overseer's visit** | a week before each job of yours is wanted, and while any is late |

Nothing is sent to somebody about their own edit, nothing is sent about a date that has
already passed, and until an SMTP account is entered messages are written to
`server/data/outbox` as `.eml` files instead — so the whole thing can be watched working
before anything is sent to a real person.

**Pop-up reminders on the phone.** The same things arrive as a notification on
the lock screen, whether or not the app is open — that is Web Push, and Shepherd
implements it itself, so there is no third-party notification service to sign up
to and nothing to pay for. A publisher turns them on for himself under **My
details → Pop-up reminders**; nothing is ever asked for on its own, because a
browser only asks once. Two honest caveats, both said in the app: the reminder
travels **sealed** through the phone maker's own notification service (Google's,
Mozilla's, Apple's) — the same road every app on the phone uses, and it cannot
read what is inside — and an **iPhone only allows it once Shepherd is on the home
screen**, which is Apple's rule. Everything also arrives by email, so nobody is
left out. The coordinator can press *Tell them now* on the rota rather than wait
for the next hour to come round.

**Calendar.** On **My details → Add to my calendar** a publisher can either download a
`.ics` file of what they have on, or take a private subscription address. Subscribing is
the better one: their phone re-reads it and the entries change when the schedule changes.
It carries the meeting time, the hall address, who they are working with, and a reminder
the day before — and alongside the assignments, their group's cleaning turns and,
for an elder, the days his circuit overseer jobs are wanted by. When somebody
confirms an assignment the app offers the calendar there and then: that one entry,
or the subscription that keeps itself up to date. It asks once and then stops. The address is a long random token, works without signing in, and can be
replaced from the same page if it gets into the wrong hands — the old one stops working
immediately.

**On the phone.** Shepherd installs to the home screen and opens full screen, with no
address bar — Android and desktop Chrome offer an **Install** button on My details;
on an iPhone it is Safari's *Share ▸ Add to Home Screen*, spelt out on the same page. The
app, its styles and its icons are stored on the device, so it still opens in a hall with
no signal — the schedule is already cached and anything changed offline is queued and goes
up when the signal comes back. Records are never put in that cache, only the app itself.

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
  js/schema.js          roles, capabilities, the default arrangement, part types, plans
  js/seed.js            demo congregations
  js/store.js           persistence, selectors, audit, per-record change tracking
  js/sync.js            local vs shared mode, login, push/pull, offline queue
  js/auth.js            roles → capabilities → scope → workspaces
  js/ui.js              component kit (tables, modals, pickers, lozenges, flags)
  js/program.js         program skeletons, parsers, import/export
  js/scheduler.js       eligibility, ranking, auto-fill, rota, conflicts
  js/app.js             navigation, hash router, sign-in screens, quick find
  js/views/*.js         one file per area (including print, import and files)
  server/server.js      HTTP server, API, static files  (no dependencies)
  server/db.js          the shared JSON database and its change log
  server/auth.js        passwords (PBKDF2-SHA256) and sessions
  server/permit.js      server-side authorisation, from the congregation's own arrangement
  server/mail.js        SMTP client and outbox  (no dependencies)
  server/notify.js      invitations, calendar tokens, the messages themselves
  server/push.js        Web Push — VAPID signing and aes128gcm, written out in full
  js/cleaning.js        the cleaning rotation
  js/covisit.js         the circuit overseer visit checklist and its dates
  server/data/          the congregation's database, mail settings and outbox — not in git
  sw.js, manifest.webmanifest, icons/   what makes it installable on a phone
  deploy/               Dockerfile, compose, Caddy, nginx, systemd, backup script
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
node test/paperwork.js  # every print document, the importer, and file uploads
node test/roles.js      # the default arrangement, group scoping, server enforcement
node test/scheduling.js # fairness, availability, sizes, manual override
node test/notify.js     # invite → accept → assignment email → calendar feed → SMTP settings
node test/mobile.js     # the invitation in a real browser, installing, and working offline
node test/hall.js       # the cleaning rota, the visit preparation, and who may change what
node test/push.js       # the reminder crypto, opened as a phone would open it
```

All eleven exit non-zero on failure. `test/roles.js` needs nothing but Node for the first
half. `test/server.js` needs nothing but Node and covers
first-run setup, wrong passwords, publisher self-service limits (a publisher may confirm
their own part but not assign themselves one), and that no password material reaches the
synced document. `test/shared.js` runs two real browsers against a live server: an elder
assigns a part, the publisher sees it without reloading and confirms it, the elder sees
the confirmation come back, the server is killed mid-session to check the app keeps
working and queues the change, then restarted to watch the queue drain.
`test/paperwork.js` builds all ten print documents, imports messy real-world spreadsheet
columns (`Full Name` as `Surname, Firstname`, `12/04/1998` dates, a group that does not
exist yet), checks the rows that cannot be matched are reported rather than silently
dropped, and prints a real PDF. `test/roles.js` checks the default division of work, then
signs in as a group overseer against a live server to confirm he can record his own
group's reports but not another group's, cannot raise elders' tasks until the congregation
grants it, can the moment it does, and cannot rewrite the arrangement himself.
`test/notify.js` walks the whole invitation chain against a live server — invite, accept,
sign in again, the token refused a second time — then checks that an assignment sends one
message and only one, that confirming your own part emails nobody, that somebody who
turned assignment messages off is left alone, that a calendar feed serves on its token
alone and stops working when it is replaced, and that the SMTP password is never handed
back to a browser. `test/mobile.js` opens the invitation link in a real browser at phone
size, sets a password, checks the publisher lands in their own workspace with the part
they were given, then pulls the network out and reloads to prove the app still opens —
and that nothing from the congregation's records is sitting in the offline cache.
`test/hall.js` watches the rotation go round every group and carry on from a swap
made by hand, lays out a visit and moves its dates, checks an elder can tick off
his own job but cannot touch another brother's or re-date the visit, and then
sends the reminders and reads the outbox to see that everyone in the group on
duty was told — and that the man who asked not to be was not. `test/push.js`
plays the part of the phone: it makes the key pair a browser would make and opens
what the server sealed, checks another phone cannot, checks a meddled-with
message is refused, verifies the signature against the key the phone was given,
and catches the outgoing request on a stand-in push service to confirm nothing
readable is on the wire.
`test/scheduling.js` fills twelve weeks and checks that every slot is covered with no
clashes, that no active publisher is left out, that people marked for the same things
carry comparable amounts, that nothing lands on a week someone is away, that a brother
unavailable midweek gets only weekend parts, that a one-a-month limit holds, that
demonstration partners match, and that the car park and security watch reach the rota. It
then does the same at both extremes — twelve publishers and two hundred and twenty — and
checks the manual side: that the picker offers everyone when asked, marks who is not
qualified, makes the assignment anyway with a warning rather than a refusal, leaves a
locked week alone, and honours a congregation that has turned suggestions off.
Screenshots land in `/tmp`.
