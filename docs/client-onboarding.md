# Client Onboarding Checklist (72-hour delivery)

## Day 0 — Sale & intake (the 30-minute interview)

- [ ] Package chosen, 50% deposit received (MoMo/OM reference noted)
- [ ] Business basics: name, location, hours, phone, languages (FR/EN/both)
- [ ] Package-specific intake:
  - **WhatsApp bot:** FAQ list — hours, prices, location, delivery, anything customers ask weekly
  - **Booking:** services, durations, prices, open days/hours, who gets the alerts
  - **Storefront:** product list with prices + photos; whose MoMo/OM merchant account receives the money
  - **AI assistant:** full business-profile interview (use `products/ai-chatbot/config/business-profile.example.md` as the questionnaire)
- [ ] **Start operator/Meta registrations immediately** — these are the long poles:
  - Meta Business verification for the WhatsApp number (bot, booking alerts, AI assistant)
  - MTN MoMo / Orange Money **merchant** onboarding (storefront only; can take days — sandbox-demo in the meantime)

## Day 1 — Build

- [ ] Provision client on the VPS (one directory per client, one `.env`, one systemd unit or PM2 process)
- [ ] Fill the product's config file from the intake
- [ ] Wire credentials, deploy, run through the product README's test step
- [ ] Send the owner a test link/number: "essayez de casser le bot"

## Day 2 — Validate & launch

- [ ] Owner walkthrough on WhatsApp (screen recording, 3–5 min, in their language)
- [ ] Fix their corrections (prices are always wrong the first time)
- [ ] Go live; collect remaining 50%
- [ ] Add the client to the monitoring list (uptime ping on `/health`) and to the monthly invoice run

## Handover pack (send as one WhatsApp message + email)

1. What was installed and the live link/number
2. How to request changes (one WhatsApp number, 24h response promise)
3. What the monthly fee covers (copy the row from `docs/pricing.md`)
4. Invoice for the balance

## Red flags — walk away politely

- Wants to negotiate the package price down >20% → will also fight every invoice
- "Build it first, I'll pay when I see it works" → no deposit, no build
- Needs features outside all four packages → refer out; custom dev is a different business
