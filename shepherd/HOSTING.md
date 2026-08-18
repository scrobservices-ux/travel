# Putting Shepherd on the internet

Four ways, easiest first. All of them keep the congregation's data on hardware you
control — there is no Shepherd cloud to sign up for.

Whichever you pick, the rule is the same: **on the open internet, serve it over HTTPS.**
Sign-in passwords and congregation records travel over that connection. Plain `http://`
is fine on a Kingdom Hall or home network and nowhere else.

---

## 1. A tunnel from a computer at the hall — no domain, no fixed IP, no port forwarding

Best if the machine running Shepherd sits behind a normal home or hall router. The tunnel
makes an outbound connection, so nothing needs opening on the router.

**Cloudflare Tunnel** (free; no domain and no account needed to start):

```bash
# on the machine running Shepherd
node server/server.js --port 8080 --host 127.0.0.1 --trust-proxy

# in another terminal
cloudflared tunnel --url http://127.0.0.1:8080
```

That prints a public `https://…trycloudflare.com` address straight away, with no account and
no domain — good for trying it and for a first evening. **It changes every time the tunnel
restarts**, so before inviting the congregation, move to a permanent address: that needs a
free Cloudflare account and a domain on it, and gives a hostname such as
`shepherd.yourdomain.org` that never changes:

```bash
cloudflared tunnel login
cloudflared tunnel create shepherd
cloudflared tunnel route dns shepherd shepherd.yourdomain.org
cloudflared tunnel run --url http://127.0.0.1:8080 shepherd
```

**Tailscale** (free, no domain needed) keeps it off the public internet entirely — only
devices you have added to your network can reach it, which for a congregation is often
exactly right:

```bash
tailscale serve --bg 8080          # reachable by your devices
# or, to publish it publicly on a *.ts.net address:
tailscale funnel --bg 8080
```

Both give you HTTPS with no certificate work. Pass `--trust-proxy` so Shepherd knows the
connection reaching the visitor was secure.

---

## 2. A small server with a domain — Docker, certificate handled for you

Any £4/month VPS is more than enough for a congregation.

```bash
# on the server
git clone <your copy of this repo> && cd shepherd/deploy
printf 'DOMAIN=shepherd.example.org\nEMAIL=you@example.org\n' > .env
docker compose up -d
```

Point the domain's A record at the server first. Caddy fetches and renews the TLS
certificate automatically. `deploy/docker-compose.yml` runs Shepherd as a non-root user
with the database in a named volume.

Back it up:

```bash
docker compose exec -T shepherd tar -c server/data | gzip > shepherd-$(date +%F).tar.gz
```

---

## 3. Shared cPanel hosting you already pay for — Namecheap, Hostinger, most of them

If the congregation (or one of the brothers) already has a hosting account with
cPanel, Shepherd will very likely run on it with nothing new to buy and nothing left
switched on at home. Look in cPanel for **Setup Node.js App** under Software. If it is
there, this route works; if it is not — or if the plan is a managed-WordPress one such
as Namecheap's EasyWP — it does not, and route 1 or 2 is yours.

**1. Put the files on the host.** cPanel → File Manager → upload a zip of the
`shepherd` folder into your home directory and extract it, so you have
`/home/<user>/shepherd/server/server.js`. (Or clone it if the plan gives you SSH.)

**2. Point a subdomain at it.** cPanel → Domains → Create A New Domain →
`shepherd.yourdomain.org`. Let it make the document root it suggests; the Node app will
take the address over. Then cPanel → SSL/TLS Status and make sure the certificate covers
the new subdomain — on most hosts AutoSSL does it within minutes.

**3. Set the app up.** cPanel → Setup Node.js App → Create Application:

| Box | What to put |
|---|---|
| Node.js version | 18 or newer |
| Application mode | Production |
| Application root | `shepherd` |
| Application URL | the subdomain you just made |
| Application startup file | `server/server.js` |

Then, still on that page, add two environment variables:

```
TRUST_PROXY = 1
HOST        = 127.0.0.1
```

`TRUST_PROXY` tells Shepherd the connection reaching the publisher was HTTPS, so
sign-in cookies are marked secure and invitation links say `https://`. Leave `PORT`
alone — cPanel sets it. Press **Run JS script → npm install** if it offers; there is
nothing to install, but it settles the app. Then **Restart**.

Open `https://shepherd.yourdomain.org` and you should get the set-up screen.

**4. Keep the reminders on time.** This is the one thing shared hosting does
differently: an idle app is put to sleep, and a sleeping app runs no timers, so
cleaning and visit reminders would wait until somebody next opened the page. In the
app go to **Administration → Email & notifications → How to keep them on time**, copy
the line it gives you, and add it in cPanel → Cron Jobs, **Once an hour**. It looks
like this:

```
0 * * * * curl -fsS "https://shepherd.yourdomain.org/api/reminders/cron?key=…" >/dev/null
```

That address is a key: anyone holding it can make the server send reminders that were
already due, and nothing else — it cannot read or change a single record. Delete
`server/data/cron-key` to retire it; a new one is made on the next start.

**5. Email.** Shared hosts commonly refuse to let you send through Gmail's servers.
Use a mailbox on the same domain instead — cPanel → Email Accounts → create
`congregation@yourdomain.org`, then in Shepherd's email settings use that host's
outgoing server (usually `mail.yourdomain.org`, port 465 with TLS) and that address.
Invitations then arrive from the congregation's own address, which is better anyway.
Press **Send a test message** before inviting anybody.

**6. Backups.** The whole congregation is `shepherd/server/data`. cPanel's own backup
covers it, but keep your own as well: **Administration → Backup & restore → Download**
once a month, kept off the server.

**What to watch on a shared plan.** Outbound HTTPS must be allowed for pop-up
reminders to reach Google's and Apple's notification services — normally fine,
occasionally firewalled; the emails still go either way. And the database is a file on
that host, so the account holder can read it: fine when that is the congregation's own
account, worth thinking about when it is a brother's business account.

---

## 4. Directly on a server you already run

```bash
sudo useradd --system --home /opt/shepherd --shell /usr/sbin/nologin shepherd
sudo cp -r shepherd /opt/ && sudo chown -R shepherd:shepherd /opt/shepherd
sudo cp /opt/shepherd/deploy/shepherd.service /etc/systemd/system/
sudo systemctl enable --now shepherd
```

The unit binds Shepherd to `127.0.0.1:8080` with `--trust-proxy`, so put Caddy or nginx in
front of it — `deploy/Caddyfile` and `deploy/nginx.conf` are ready to copy. With nginx,
get the certificate using `sudo certbot --nginx -d shepherd.example.org`.

Schedule the backup script:

```bash
sudo crontab -e
# 0 2 * * * /opt/shepherd/deploy/backup.sh /var/backups/shepherd
```

### Without a reverse proxy

Shepherd can serve HTTPS itself if you already hold a certificate:

```bash
node server/server.js --port 8443 --cert fullchain.pem --key privkey.pem
```

---

## Email, invitations and the calendar

Invitations and assignment notices go out through the congregation's own email account —
Shepherd has no mail service of its own and sends nothing to anyone else. Set it up on
**Administration → Email & notifications** once the server is reachable:

| | |
|---|---|
| Transport | `smtp` with STARTTLS or implicit TLS, or `file` (writes `.eml` files to `server/data/outbox` and sends nothing — the default, useful for watching it work first), or `off` |
| Gmail | host `smtp.gmail.com`, port 587, an **app password** — not the account password, and 2-step verification must be on |
| Address in links | leave **Web address** blank and Shepherd uses whatever address the request came in on. Behind a proxy that means you want `--trust-proxy` set, or invitation links will say `http://…` |
| Where the password lives | `server/data/mail.json`, mode 0600, never sent to a browser and never in a backup export |

Two things about hosting affect this:

- **Invitation links must work from outside.** A publisher opens the link on their phone,
  usually on mobile data. If Shepherd is only reachable on the hall wifi or a Tailscale
  network, the link only works on a device already on it. That is a perfectly good
  arrangement — just expect to be asked.
- **Calendar subscriptions are fetched by the phone, not by a person.** The address
  carries a random token and no cookie. It must be reachable from the internet for a phone
  to refresh it, so on a private network a downloaded `.ics` file is the better route.

Port 587 outbound is blocked by some hosts; 465 with **implicit TLS** usually works
instead. If a message fails, the outbox on the same page shows the error the mail server
gave, and it is retried up to five times.

### Pop-up reminders

Nothing to install and no account to open: Shepherd generates its own key pair on
first use (`server/data/push-keys.json`, mode 0600) and talks to each phone's
push service directly. Three things worth knowing before you promise them to the
congregation:

- **HTTPS, again.** Reminders ride on the service worker, so they need a secure
  address — every route below gives you one.
- **Outbound HTTPS must be allowed.** The server posts to `fcm.googleapis.com`,
  `updates.push.services.mozilla.com`, `web.push.apple.com` and the like. A
  firewall that blocks outbound 443 blocks reminders; the emails still go.
- **Never delete `push-keys.json`.** A new key pair silently orphans every phone
  already subscribed, and each would have to turn reminders on again.

Subscriptions live in `server/data/push-subs.json` (mode 0600) and are never part
of the synced document or a backup export, so a phone address cannot leak through
a restore. A phone that has been wiped answers `410` and is dropped automatically.

### Installing on phones

The app installs to a home screen and works offline, which needs **HTTPS** (or
`localhost`) — browsers will not register a service worker over plain `http`. Every
hosting route above gives you that. Nothing else has to be set up: the manifest, the
icons and the worker are served by Shepherd itself.

---

## What Shepherd does to be safe on the internet

| | |
|---|---|
| Passwords | PBKDF2-SHA256, 210 000 iterations, per-user salt, in a file that is never part of the synced data |
| Sessions | random 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie, `Secure` whenever the connection is HTTPS, 30-day expiry |
| Sign-in | throttled per address and per email — 8 failures locks that pair out for 15 minutes |
| Authorisation | enforced on the server from the role table, not just hidden in the interface; cross-congregation writes refused |
| Headers | `Content-Security-Policy` (no third-party anything is loaded, so it is strict), `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, and HSTS over HTTPS |
| Uploads | request bodies capped; the `server/` directory is never served |
| Data | one JSON file plus password, session, invitation and mail-settings files, all on your disk |
| Invitations | single-use token, 14 days, and it only ever sets that one person's password |
| Calendar feeds | 192-bit random token in the address, one person's own assignments only, replaceable from their own page |
| Reminders | sealed per device (RFC 8291) and signed per request (RFC 8292); the push service in the middle cannot read them |

`--trust-proxy` (or `TRUST_PROXY=1`) tells Shepherd to believe `X-Forwarded-Proto` and
`X-Forwarded-For` from the proxy in front of it. **Only set it when there really is one** —
otherwise a visitor could forge those headers.

### Worth doing once you are public

- Give the administrator account a long, unique password; it can reset everyone else's.
- Turn on whatever the platform offers in front — Cloudflare proxying, a firewall
  allowing only 80/443, automatic security updates.
- Keep the nightly backup off the machine as well (`rsync` or `rclone` to somewhere else).
- Consider whether the congregation wants the records reachable from anywhere at all.
  Option 1 with Tailscale keeps everything private to devices you have approved and is a
  perfectly good answer for a congregation.

---

## Moving data you have already entered

Nothing is lost by starting in your browser before hosting.

1. In the browser you have been using: **Administration → Backup & restore → Download a
   backup**. One `.json` file with everything.
2. Open the hosted address, complete the setup screen as the administrator.
3. **Administration → Backup & restore → Restore**, choose that file.

Everyone else then signs in and sees it. Uploaded files under **Files** travel in the
backup too, so keep an eye on its size if you store many large PDFs.
