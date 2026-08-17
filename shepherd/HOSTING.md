# Putting Shepherd on the internet

Three ways, easiest first. All of them keep the congregation's data on hardware you
control — there is no Shepherd cloud to sign up for.

Whichever you pick, the rule is the same: **on the open internet, serve it over HTTPS.**
Sign-in passwords and congregation records travel over that connection. Plain `http://`
is fine on a Kingdom Hall or home network and nowhere else.

---

## 1. A tunnel from a computer at the hall — no domain, no fixed IP, no port forwarding

Best if the machine running Shepherd sits behind a normal home or hall router. The tunnel
makes an outbound connection, so nothing needs opening on the router.

**Cloudflare Tunnel** (free, needs a domain on Cloudflare):

```bash
# on the machine running Shepherd
node server/server.js --port 8080 --host 127.0.0.1 --trust-proxy

# in another terminal
cloudflared tunnel --url http://127.0.0.1:8080
```

That prints a public `https://…` address straight away. For a permanent address, create a
named tunnel and map it to a hostname such as `shepherd.yourdomain.org`:

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

## 3. Directly on a server you already run

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

## What Shepherd does to be safe on the internet

| | |
|---|---|
| Passwords | PBKDF2-SHA256, 210 000 iterations, per-user salt, in a file that is never part of the synced data |
| Sessions | random 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie, `Secure` whenever the connection is HTTPS, 30-day expiry |
| Sign-in | throttled per address and per email — 8 failures locks that pair out for 15 minutes |
| Authorisation | enforced on the server from the role table, not just hidden in the interface; cross-congregation writes refused |
| Headers | `Content-Security-Policy` (no third-party anything is loaded, so it is strict), `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, and HSTS over HTTPS |
| Uploads | request bodies capped; the `server/` directory is never served |
| Data | one JSON file plus password and session files, all on your disk |

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
