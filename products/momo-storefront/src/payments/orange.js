// Orange Money — Web Payment API (Cameroon).
// Docs: https://developer.orange.com/apis/om-webpay
// Flow: create a web payment session → redirect the customer to payment_url →
// Orange calls notif_url and/or we poll transactionstatus with the pay_token.

const {
  ORANGE_BASE_URL = 'https://api.orange.com',
  ORANGE_CLIENT_ID,
  ORANGE_CLIENT_SECRET,
  ORANGE_MERCHANT_KEY,
  BASE_URL,
} = process.env;

export const enabled = Boolean(ORANGE_CLIENT_ID && ORANGE_CLIENT_SECRET && ORANGE_MERCHANT_KEY);

let token = null;
let tokenExpiry = 0;

async function getToken() {
  if (token && Date.now() < tokenExpiry - 60_000) return token;
  const res = await fetch(`${ORANGE_BASE_URL}/oauth/v3/token`, {
    method: 'POST',
    headers: {
      Authorization:
        'Basic ' + Buffer.from(`${ORANGE_CLIENT_ID}:${ORANGE_CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Orange token failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  token = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  return token;
}

// Creates a payment session. Returns {paymentUrl, payToken} — redirect the
// customer to paymentUrl, keep payToken to poll status.
export async function createPayment({ amount, orderId }) {
  const res = await fetch(`${ORANGE_BASE_URL}/orange-money-webpay/cm/v1/webpayment`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      merchant_key: ORANGE_MERCHANT_KEY,
      currency: 'XAF',
      order_id: String(orderId),
      amount,
      return_url: `${BASE_URL}/?paid=${orderId}`,
      cancel_url: `${BASE_URL}/?cancelled=${orderId}`,
      notif_url: `${BASE_URL}/api/orange/notify`,
      lang: 'fr',
      reference: String(orderId),
    }),
  });
  if (!res.ok) throw new Error(`Orange webpayment failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { paymentUrl: data.payment_url, payToken: data.pay_token };
}

// → 'INITIATED' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED'
export async function getStatus({ orderId, amount, payToken }) {
  const res = await fetch(`${ORANGE_BASE_URL}/orange-money-webpay/cm/v1/transactionstatus`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ order_id: String(orderId), amount, pay_token: payToken }),
  });
  if (!res.ok) throw new Error(`Orange status failed: ${res.status} ${await res.text()}`);
  return (await res.json()).status;
}
