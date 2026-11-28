export const PRICE_CENTS = 4900;
export const CURRENCY = "eur";
export const PRODUCT_NAME = "Valutazione immobiliare · StimaImmobile.it";
export const ORDER_STATUSES = ["pending", "paid", "cancelled", "refunded"];

export function normalizeCode(value) {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z0-9-]{3,32}$/.test(code) ? code : "";
}

// Euro discount codes. `uses` counts paid orders; `today` is YYYY-MM-DD (Europe/Rome).
export function applyCoupon(coupon, { uses = 0, today, price = PRICE_CENTS } = {}) {
  if (!coupon || !coupon.active || coupon.referrer_active === false) return { valid: false, error: "Codice sconto non valido." };
  const until = coupon.valid_until ? String(coupon.valid_until instanceof Date ? coupon.valid_until.toISOString() : coupon.valid_until).slice(0, 10) : "";
  if (until && today > until) return { valid: false, error: "Codice sconto scaduto." };
  if (coupon.max_uses != null && uses >= Number(coupon.max_uses)) return { valid: false, error: "Codice sconto esaurito." };
  const discount = Math.min(price, Number(coupon.discount_cents));
  return { valid: true, discount, amount: price - discount, price };
}

// Stripe Checkout Session as application/x-www-form-urlencoded body.
export function checkoutForm({ orderId, email, siteUrl, amount = PRICE_CENTS }) {
  const site = siteUrl.replace(/\/+$/, "");
  return new URLSearchParams({
    mode: "payment",
    client_reference_id: orderId,
    customer_email: email,
    "metadata[order_id]": orderId,
    "payment_intent_data[metadata][order_id]": orderId,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": CURRENCY,
    "line_items[0][price_data][unit_amount]": String(amount),
    "line_items[0][price_data][product_data][name]": PRODUCT_NAME,
    success_url: site + "/account/?ordine=" + orderId,
    cancel_url: site + "/#ordine",
    locale: "it",
  }).toString();
}

function hex(bytes) {
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export async function stripeSignature(payload, secret, timestamp) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(timestamp + "." + payload)));
}
// Verifies the Stripe-Signature header (t=…,v1=…) against the raw body; 5 minutes tolerance.
export async function verifyStripeSignature(payload, header, secret, now = Date.now(), tolerance = 300) {
  if (!secret || typeof header !== "string") return false;
  const parts = header.split(",").map(item => item.trim().split("="));
  const timestamp = parts.find(([k]) => k === "t")?.[1] || "";
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v || "");
  if (!/^\d+$/.test(timestamp) || !signatures.length) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > tolerance) return false;
  const expected = await stripeSignature(payload, secret, timestamp);
  return signatures.some(sig => sameText(sig, expected));
}
