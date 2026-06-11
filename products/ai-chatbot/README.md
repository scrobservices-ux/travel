# AI Assistant on WhatsApp (Claude-powered)

A bilingual customer-service agent that answers like a knowledgeable employee — in French, English, or the natural mix Cameroonian customers actually write in. Grounded strictly in a per-client **business profile** file; anything outside it triggers a human handoff.

**Sells as:** 400,000 FCFA setup + 75,000 FCFA/month (the retainer covers API usage).
**Per-client work:** write `config/business-profile.md` with the owner (30–60 min interview). No code changes.

## How it works

- WhatsApp message arrives (Meta Cloud API webhook) → sent to Claude (`claude-opus-4-8`) with the business profile in a cached system prompt and the customer's recent conversation history.
- The system prompt forbids inventing prices/policies. When the model can't answer from the profile, it replies politely and emits a `[HANDOFF]` marker → the bot alerts the owner with the last few exchanges and **goes silent on that conversation for 2 hours** so the human can take over.
- API errors and safety refusals degrade to the same handoff path — the customer never sees a broken bot.

## Client setup

1. `.env` from `.env.example`: Anthropic API key + the client's Meta WhatsApp credentials (same setup steps as `products/whatsapp-bot`).
2. `config/business-profile.md` from the example: identity, prices, policies, tone. This file **is** the product — the better the interview with the owner, the better the bot.
3. `npm install && npm start`, expose `/webhook` over HTTPS, register it in Meta's webhook config (`messages` subscription).

## Cost model (why the 75k retainer works)

- System prompt is sent with `cache_control` — for profiles above the model's minimum cacheable size, repeat traffic reads it at ~10% of input price.
- History is capped at 20 turns per customer; replies are capped at 1,024 tokens.
- A busy SMB doing ~1,500 customer messages/month stays in the low tens of dollars of API usage — comfortably inside the retainer.

## Operational notes

- Conversation history and handoff state are in memory; a restart clears them (a customer simply gets a fresh conversation). Add Redis only if a client demonstrably needs continuity across deploys.
- Upgrade paths to sell later: order-taking with tool use (connect to the `momo-storefront` API), booking via the `booking` API, voice-note transcription.
