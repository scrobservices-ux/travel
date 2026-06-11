// MTN Mobile Money — Collections API (requestToPay).
// Docs: https://momodeveloper.mtn.com/api-documentation
// Sandbox uses currency EUR and target env "sandbox"; production Cameroon uses
// XAF and "mtncameroon". Both are driven entirely by env vars.
import { randomUUID } from 'crypto';

const {
  MOMO_BASE_URL,
  MOMO_SUBSCRIPTION_KEY,
  MOMO_API_USER,
  MOMO_API_KEY,
  MOMO_TARGET_ENV = 'sandbox',
  MOMO_CURRENCY = 'EUR',
} = process.env;

export const enabled = Boolean(MOMO_SUBSCRIPTION_KEY && MOMO_API_USER && MOMO_API_KEY);

let token = null;
let tokenExpiry = 0;

async function getToken() {
  if (token && Date.now() < tokenExpiry - 60_000) return token;
  const res = await fetch(`${MOMO_BASE_URL}/collection/token/`, {
    method: 'POST',
    headers: {
      Authorization:
        'Basic ' + Buffer.from(`${MOMO_API_USER}:${MOMO_API_KEY}`).toString('base64'),
      'Ocp-Apim-Subscription-Key': MOMO_SUBSCRIPTION_KEY,
    },
  });
  if (!res.ok) throw new Error(`MoMo token failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  token = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  return token;
}

// Initiates a payment prompt on the customer's phone. Returns the referenceId
// to poll with getStatus().
export async function requestToPay({ amount, phone, orderId, note }) {
  const referenceId = randomUUID();
  const res = await fetch(`${MOMO_BASE_URL}/collection/v1_0/requesttopay`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await getToken()}`,
      'X-Reference-Id': referenceId,
      'X-Target-Environment': MOMO_TARGET_ENV,
      'Ocp-Apim-Subscription-Key': MOMO_SUBSCRIPTION_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: String(amount),
      currency: MOMO_CURRENCY,
      externalId: String(orderId),
      payer: { partyIdType: 'MSISDN', partyId: phone },
      payerMessage: note,
      payeeNote: note,
    }),
  });
  if (res.status !== 202) {
    throw new Error(`MoMo requestToPay failed: ${res.status} ${await res.text()}`);
  }
  return referenceId;
}

// → 'PENDING' | 'SUCCESSFUL' | 'FAILED'
export async function getStatus(referenceId) {
  const res = await fetch(`${MOMO_BASE_URL}/collection/v1_0/requesttopay/${referenceId}`, {
    headers: {
      Authorization: `Bearer ${await getToken()}`,
      'X-Target-Environment': MOMO_TARGET_ENV,
      'Ocp-Apim-Subscription-Key': MOMO_SUBSCRIPTION_KEY,
    },
  });
  if (!res.ok) throw new Error(`MoMo status failed: ${res.status} ${await res.text()}`);
  return (await res.json()).status;
}
