import 'dotenv/config';
import express from 'express';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';

const {
  PORT = 3001,
  DB_PATH = './bookings.db',
  BUSINESS_CONFIG = './config/business.json',
  WHATSAPP_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  OWNER_PHONE,
} = process.env;

const business = JSON.parse(readFileSync(BUSINESS_CONFIG, 'utf8'));

const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id TEXT NOT NULL,
    date TEXT NOT NULL,          -- YYYY-MM-DD
    time TEXT NOT NULL,          -- HH:MM
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(date, time)
  );
`);

const app = express();
app.use(express.json());
app.use(express.static(new URL('../public', import.meta.url).pathname));

app.get('/api/config', (_req, res) => {
  res.json({
    name: business.name,
    language: business.language,
    services: business.services,
  });
});

// Available slots for a given date
app.get('/api/slots', (req, res) => {
  const { date } = req.query;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }
  const day = new Date(`${date}T00:00:00`).getDay();
  if (!business.openDays.includes(day)) return res.json({ slots: [] });

  const taken = new Set(
    db.prepare(`SELECT time FROM bookings WHERE date = ? AND status = 'confirmed'`)
      .all(date)
      .map((r) => r.time)
  );
  const slots = [];
  for (let h = business.openHour; h < business.closeHour; h += business.slotMinutes / 60) {
    const time = `${String(Math.floor(h)).padStart(2, '0')}:${String((h % 1) * 60).padStart(2, '0')}`;
    if (!taken.has(time)) slots.push(time);
  }
  res.json({ slots });
});

app.post('/api/bookings', async (req, res) => {
  const { serviceId, date, time, name, phone } = req.body || {};
  const service = business.services.find((s) => s.id === serviceId);
  if (!service || !date || !time || !name || !phone) {
    return res.status(400).json({ error: 'missing or invalid fields' });
  }
  try {
    const info = db
      .prepare(
        `INSERT INTO bookings (service_id, date, time, customer_name, customer_phone)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(serviceId, date, time, name, phone.replace(/\D/g, ''));

    const fr = business.language !== 'en';
    const customerMsg = fr
      ? `✅ ${business.name} — votre réservation est confirmée :\n${service.label}\n📅 ${date} à ${time}\nÀ bientôt !`
      : `✅ ${business.name} — your booking is confirmed:\n${service.label}\n📅 ${date} at ${time}\nSee you soon!`;
    await notify(phone.replace(/\D/g, ''), customerMsg);
    await notify(
      OWNER_PHONE,
      `📅 Nouvelle réservation #${info.lastInsertRowid}\n${service.label} — ${date} ${time}\n${name} (${phone})`
    );

    res.status(201).json({ id: info.lastInsertRowid, status: 'confirmed' });
  } catch (err) {
    if (String(err).includes('UNIQUE')) {
      return res.status(409).json({ error: 'slot already taken' });
    }
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

// Owner's daily list (protect behind your reverse proxy or add auth before exposing)
app.get('/api/bookings', (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const rows = db
    .prepare(`SELECT * FROM bookings WHERE date = ? AND status = 'confirmed' ORDER BY time`)
    .all(date);
  res.json({ date, bookings: rows });
});

app.delete('/api/bookings/:id', (req, res) => {
  db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

async function notify(to, body) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !to) return;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
      }
    );
    if (!res.ok) console.error('whatsapp notify failed:', res.status, await res.text());
  } catch (err) {
    console.error('whatsapp notify error:', err);
  }
}

app.listen(PORT, () => {
  console.log(`Booking system for "${business.name}" on :${PORT}`);
});
