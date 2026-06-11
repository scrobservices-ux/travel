import 'dotenv/config';
import express from 'express';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import * as mtn from './payments/mtn.js';
import * as orange from './payments/orange.js';

const {
  PORT = 3002,
  DB_PATH = './orders.db',
  CATALOG = './config/catalog.json',
  OWNER_PHONE,
  WHATSAPP_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
} = process.env;

const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));

const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    items TEXT NOT NULL,            -- JSON [{id, qty}]
    total INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    provider TEXT NOT NULL,         -- 'mtn' | 'orange'
    provider_ref TEXT,              -- MoMo referenceId / Orange pay_token
    status TEXT NOT NULL DEFAULT 'pending',  -- pending | paid | failed
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const app = express();
app.use(express.json());
app.use(express.static(new URL('../public', import.meta.url).pathname));

app.get('/api/catalog', (_req, res) => {
  res.json({
    name: catalog.name,
    currencyLabel: catalog.currencyLabel,
    products: catalog.products,
    providers: { mtn: mtn.enabled, orange: orange.enabled },
  });
});

// Create an order and start payment.
// MTN: pushes a payment prompt to the customer's phone, client then polls status.
// Orange: returns a paymentUrl to redirect the customer to.
app.post('/api/orders', async (req, res) => {
  const { items, name, phone, provider } = req.body || {};
  if (!Array.isArray(items) || !items.length || !name || !phone || !provider) {
    return res.status(400).json({ error: 'missing fields' });
  }
  let total = 0;
  for (const it of items) {
    const p = catalog.products.find((x) => x.id === it.id);
    if (!p || !Number.isInteger(it.qty) || it.qty < 1) {
      return res.status(400).json({ error: 'invalid item' });
    }
    total += p.price * it.qty;
  }

  const msisdn = phone.replace(/\D/g, '');
  const info = db
    .prepare(
      `INSERT INTO orders (items, total, customer_name, customer_phone, provider)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(JSON.stringify(items), total, name, msisdn, provider);
  const orderId = info.lastInsertRowid;

  try {
    if (provider === 'mtn') {
      if (!mtn.enabled) return res.status(503).json({ error: 'MTN MoMo not configured' });
      const ref = await mtn.requestToPay({
        amount: total,
        phone: msisdn,
        orderId,
        note: `Commande #${orderId} — ${catalog.name}`,
      });
      db.prepare(`UPDATE orders SET provider_ref = ? WHERE id = ?`).run(ref, orderId);
      return res.status(201).json({ orderId, provider: 'mtn', next: 'poll' });
    }
    if (provider === 'orange') {
      if (!orange.enabled) return res.status(503).json({ error: 'Orange Money not configured' });
      const { paymentUrl, payToken } = await orange.createPayment({ amount: total, orderId });
      db.prepare(`UPDATE orders SET provider_ref = ? WHERE id = ?`).run(payToken, orderId);
      return res.status(201).json({ orderId, provider: 'orange', next: 'redirect', paymentUrl });
    }
    res.status(400).json({ error: 'unknown provider' });
  } catch (err) {
    console.error('payment init failed:', err);
    db.prepare(`UPDATE orders SET status = 'failed' WHERE id = ?`).run(orderId);
    res.status(502).json({ error: 'payment initiation failed' });
  }
});

// Poll payment status (the storefront page calls this every few seconds).
app.get('/api/orders/:id/status', async (req, res) => {
  const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(req.params.id);
  if (!order) return res.status(404).json({ error: 'not found' });
  if (order.status !== 'pending' || !order.provider_ref) {
    return res.json({ status: order.status });
  }
  try {
    let providerStatus;
    if (order.provider === 'mtn') {
      providerStatus = await mtn.getStatus(order.provider_ref);
    } else {
      providerStatus = await orange.getStatus({
        orderId: order.id,
        amount: order.total,
        payToken: order.provider_ref,
      });
    }
    if (providerStatus === 'SUCCESSFUL' || providerStatus === 'SUCCESS') {
      await markPaid(order);
      return res.json({ status: 'paid' });
    }
    if (['FAILED', 'EXPIRED'].includes(providerStatus)) {
      db.prepare(`UPDATE orders SET status = 'failed' WHERE id = ?`).run(order.id);
      return res.json({ status: 'failed' });
    }
    res.json({ status: 'pending' });
  } catch (err) {
    console.error('status check failed:', err);
    res.json({ status: 'pending' });
  }
});

// Orange server-to-server notification (notif_url). Status is re-verified by
// polling, so this just logs; payment truth comes from transactionstatus.
app.post('/api/orange/notify', (req, res) => {
  console.log('orange notify:', JSON.stringify(req.body));
  res.sendStatus(200);
});

async function markPaid(order) {
  db.prepare(`UPDATE orders SET status = 'paid' WHERE id = ?`).run(order.id);
  const items = JSON.parse(order.items)
    .map((it) => {
      const p = catalog.products.find((x) => x.id === it.id);
      return `${it.qty}× ${p ? p.label : it.id}`;
    })
    .join(', ');
  await notify(
    OWNER_PHONE,
    `💰 Commande payée #${order.id}\n${items}\nTotal : ${order.total.toLocaleString('fr-FR')} ${catalog.currencyLabel}\nClient : ${order.customer_name} (${order.customer_phone})`
  );
}

async function notify(to, body) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !to) return;
  try {
    await fetch(`https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
    });
  } catch (err) {
    console.error('whatsapp notify error:', err);
  }
}

app.listen(PORT, () => {
  console.log(
    `Storefront "${catalog.name}" on :${PORT} (MTN: ${mtn.enabled ? 'on' : 'off'}, Orange: ${orange.enabled ? 'on' : 'off'})`
  );
});
