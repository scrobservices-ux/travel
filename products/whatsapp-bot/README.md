# WhatsApp Business Bot

Menu-driven auto-reply bot on the **official Meta WhatsApp Cloud API**. Answers FAQs (hours, prices, location), and hands off to a human on request — the bot then stays silent on that conversation for 2 hours so the owner can reply normally.

**Sells as:** 150,000 FCFA setup + 25,000 FCFA/month.
**Per-client work:** edit one JSON file. No code changes.

## Client setup (once per client)

1. Create a Meta Business + app at [developers.facebook.com](https://developers.facebook.com), add the **WhatsApp** product, and register the client's business phone number.
2. Copy `.env.example` → `.env`, fill in the token, phone number ID, and a verify token.
3. Copy `config/business.example.json` → `config/business.json` and fill in the client's name, menu, prices, and location.
4. `npm install && npm start`, expose `/webhook` over HTTPS (the host's domain, or `cloudflared`/`ngrok` during testing), and register that URL + verify token in Meta's webhook config, subscribing to `messages`.
5. Send "bonjour" to the number to test.

## How it behaves

- A greeting ("bonjour", "hello", "menu"…) → greeting + numbered menu.
- A menu number → that item's reply.
- Anything else → fallback message + menu.
- Menu item with `"handoff": true` → confirms to the customer, alerts `OWNER_PHONE`, and mutes the bot for that customer for 2 hours.

## Notes

- Handoff state is in memory; a restart clears it. Fine for SMB volume — the worst case is the bot replying once during a human conversation.
- Languages: set `"language"` in the business config to `fr` or `en`. All strings carry both.
- Upsell path: replace this bot's logic with `products/ai-chatbot` for clients who outgrow the menu.
