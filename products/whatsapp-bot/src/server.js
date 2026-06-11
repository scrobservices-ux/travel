import 'dotenv/config';
import express from 'express';
import { readFileSync } from 'fs';

const {
  WHATSAPP_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_VERIFY_TOKEN,
  OWNER_PHONE,
  BUSINESS_CONFIG = './config/business.json',
  PORT = 3000,
} = process.env;

const business = JSON.parse(readFileSync(BUSINESS_CONFIG, 'utf8'));
const GRAPH_URL = `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

// Numbers currently handed off to a human: the bot stays silent for them
// until the conversation goes quiet for HANDOFF_TTL_MS.
const handedOff = new Map();
const HANDOFF_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const app = express();
app.use(express.json());

// Meta webhook verification handshake
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  // Always 200 fast — Meta retries otherwise
  res.sendStatus(200);
  try {
    const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message || message.type !== 'text') return;
    await handleMessage(message.from, message.text.body.trim());
  } catch (err) {
    console.error('webhook error:', err);
  }
});

async function handleMessage(from, text) {
  const lang = business.language || 'fr';

  const offSince = handedOff.get(from);
  if (offSince && Date.now() - offSince < HANDOFF_TTL_MS) {
    handedOff.set(from, Date.now()); // keep the window open while they talk
    return;
  }
  handedOff.delete(from);

  const item = business.menu.find((m) => m.key === text);
  if (item) {
    await sendText(from, item.reply[lang]);
    if (item.handoff) {
      handedOff.set(from, Date.now());
      await sendText(
        OWNER_PHONE,
        `🔔 Client ${from} demande à parler à quelqu'un. Répondez-lui directement sur WhatsApp.`
      );
    }
    return;
  }

  const isGreeting = /^(bonjour|bonsoir|salut|hello|hi|menu|bjr)\b/i.test(text);
  const header = isGreeting
    ? business.greeting[lang].replace('{name}', business.name)
    : business.fallback[lang];
  await sendText(from, `${header}\n\n${menuText(lang)}`);
}

function menuText(lang) {
  return business.menu.map((m) => `${m.key}. ${m.label[lang]}`).join('\n');
}

async function sendText(to, body) {
  const res = await fetch(GRAPH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  });
  if (!res.ok) {
    console.error('send failed:', res.status, await res.text());
  }
}

app.get('/health', (_req, res) => res.json({ ok: true, business: business.name }));

app.listen(PORT, () => {
  console.log(`WhatsApp bot for "${business.name}" listening on :${PORT}`);
});
