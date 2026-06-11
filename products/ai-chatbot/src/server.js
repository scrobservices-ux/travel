import 'dotenv/config';
import express from 'express';
import { readFileSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';

const {
  WHATSAPP_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_VERIFY_TOKEN,
  OWNER_PHONE,
  BUSINESS_PROFILE = './config/business-profile.md',
  PORT = 3003,
} = process.env;

const anthropic = new Anthropic();
const businessProfile = readFileSync(BUSINESS_PROFILE, 'utf8');
const GRAPH_URL = `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

const SYSTEM_PROMPT = `Tu es l'assistant client officiel de cette entreprise sur WhatsApp. Tu représentes l'entreprise auprès de ses clients au Cameroun.

Règles :
- Réponds dans la langue du client (français ou anglais ; beaucoup de clients mélangent les deux — c'est normal, fais pareil naturellement).
- Réponses courtes et concrètes, format WhatsApp : 1 à 4 phrases, pas de listes à puces sauf pour des tarifs.
- Tu ne connais QUE les informations de la fiche business ci-dessous. Si on te demande quelque chose qui n'y figure pas (négociation de prix, réclamation, commande spéciale), réponds : "Je transmets votre demande, un membre de l'équipe vous répond très vite 🙏" et termine ta réponse par le marqueur [HANDOFF] sur une ligne seule.
- Ne promets jamais un prix, une remise ou un délai qui n'est pas dans la fiche.
- Pousse gentiment vers l'action : proposer de réserver, de passer commande, ou de venir en boutique.

=== FICHE BUSINESS ===
${businessProfile}`;

// Conversation history per customer phone number. In-memory: fine for a single
// SMB's volume; swap for Redis/SQLite if a client needs persistence across restarts.
const conversations = new Map();
const MAX_TURNS = 20; // user+assistant messages kept per customer
const handedOff = new Map();
const HANDOFF_TTL_MS = 2 * 60 * 60 * 1000;

const app = express();
app.use(express.json());

app.get('/webhook', (req, res) => {
  if (
    req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === WHATSAPP_VERIFY_TOKEN
  ) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
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
  const offSince = handedOff.get(from);
  if (offSince && Date.now() - offSince < HANDOFF_TTL_MS) {
    handedOff.set(from, Date.now());
    return; // a human owns this conversation right now
  }
  handedOff.delete(from);

  const history = conversations.get(from) || [];
  history.push({ role: 'user', content: text });

  let reply;
  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: history,
    });
    if (response.stop_reason === 'refusal') {
      reply = 'Je transmets votre demande, un membre de l\'équipe vous répond très vite 🙏\n[HANDOFF]';
    } else {
      reply = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
    }
  } catch (err) {
    console.error('claude error:', err);
    reply = 'Petit souci technique de notre côté — un membre de l\'équipe vous répond très vite 🙏\n[HANDOFF]';
  }

  const wantsHandoff = reply.includes('[HANDOFF]');
  const visible = reply.replace(/\[HANDOFF\]/g, '').trim();

  history.push({ role: 'assistant', content: visible });
  conversations.set(from, history.slice(-MAX_TURNS));

  if (visible) await sendText(from, visible);

  if (wantsHandoff) {
    handedOff.set(from, Date.now());
    const recent = history
      .slice(-6)
      .map((m) => `${m.role === 'user' ? '👤' : '🤖'} ${m.content}`)
      .join('\n');
    await sendText(
      OWNER_PHONE,
      `🔔 L'assistant IA passe la main pour le client ${from}.\nDerniers échanges :\n${recent}`
    );
  }
}

async function sendText(to, body) {
  const res = await fetch(GRAPH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  });
  if (!res.ok) {
    console.error('send failed:', res.status, await res.text());
  }
}

app.get('/health', (_req, res) =>
  res.json({ ok: true, conversations: conversations.size })
);

app.listen(PORT, () => {
  console.log(`AI chatbot listening on :${PORT}`);
});
