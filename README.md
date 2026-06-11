# Sahel Digital — Done-For-You Automation for African SMBs

A productized automation agency targeting Cameroonian (and broader Central/West African) small businesses. One repo contains everything needed to sell, deliver, and operate the agency:

| Directory | What it is |
|---|---|
| [`site/`](site/) | The agency's marketing site — bilingual FR/EN, mobile-first, single static file, deployable anywhere (GitHub Pages, Netlify, Cloudflare Pages) |
| [`products/whatsapp-bot/`](products/whatsapp-bot/) | WhatsApp business automation template (Meta Cloud API) — menu bot, auto-replies, human handoff |
| [`products/booking/`](products/booking/) | Booking/appointment system — web booking page + WhatsApp confirmations (salons, clinics, barbers, tour operators) |
| [`products/momo-storefront/`](products/momo-storefront/) | Mobile-money storefront — product catalog + checkout via MTN Mobile Money and Orange Money |
| [`products/ai-chatbot/`](products/ai-chatbot/) | Claude-powered bilingual customer-service chatbot, delivered over WhatsApp |
| [`docs/`](docs/) | Pricing sheet (FCFA), client onboarding checklist, delivery playbook |

## The business model

**Productized service, not custom dev.** Every client gets one of the four templates above, configured (not rebuilt) for their business. Setup fee + monthly retainer for hosting, support, and changes. Delivery target: **48–72 hours per client**, because the product already exists — onboarding is filling in a config file.

Why this works in Cameroon:

- **WhatsApp is the storefront.** Most SMBs already sell through WhatsApp; they don't need a website, they need their WhatsApp to work while they sleep.
- **Mobile money is the payment rail.** MTN MoMo + Orange Money cover the vast majority of digital payments. Card checkout is irrelevant for most local customers.
- **Nobody local is selling this productized.** Custom dev shops quote millions of FCFA and months. A fixed-price, fixed-scope, 72-hour package is a different category.

See [`docs/pricing.md`](docs/pricing.md) for the packages and [`docs/client-onboarding.md`](docs/client-onboarding.md) for the per-client delivery checklist.

## Deploying a client

Each product is a standalone Node.js app:

```bash
cd products/<product>
cp .env.example .env   # fill in the client's credentials
npm install
npm start
```

All four run comfortably on a single small VPS (or a free-tier PaaS) per client. The `.env.example` in each product documents every credential the client must provide and where to get it.

## Stack choices (deliberate)

- **Node.js, no frameworks beyond Express** — cheap to host, easy to hand off, runs on anything.
- **SQLite for persistence** — zero-ops, one file to back up, more than enough for SMB volume.
- **WhatsApp Cloud API (official)** — no number-banning risk that comes with unofficial libraries.
- **Claude API for the AI chatbot** — handles French/English code-switching and Cameroonian context well; prompt caching keeps per-message cost low.
