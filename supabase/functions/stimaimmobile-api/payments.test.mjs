import test from "node:test";
import assert from "node:assert/strict";
import { checkoutForm, stripeSignature, verifyStripeSignature, PRICE_CENTS, applyCoupon, normalizeCode } from "./payments.mjs";

test("euro coupons: discount, full discount, expiry, max uses, inactive", () => {
  const coupon = { active: true, discount_cents: 1000, valid_until: null, max_uses: null };
  assert.deepEqual(applyCoupon(coupon, { today: "2026-11-28" }), { valid: true, discount: 1000, amount: 3900, price: 4900 });
  assert.equal(applyCoupon({ ...coupon, discount_cents: 9999 }, { today: "2026-11-28" }).amount, 0);
  assert.equal(applyCoupon({ ...coupon, valid_until: "2026-11-28" }, { today: "2026-11-28" }).valid, true);
  assert.equal(applyCoupon({ ...coupon, valid_until: "2026-11-27" }, { today: "2026-11-28" }).error, "Codice sconto scaduto.");
  assert.equal(applyCoupon({ ...coupon, max_uses: 2 }, { uses: 2, today: "2026-11-28" }).error, "Codice sconto esaurito.");
  assert.equal(applyCoupon({ ...coupon, max_uses: 2 }, { uses: 1, today: "2026-11-28" }).valid, true);
  assert.equal(applyCoupon({ ...coupon, active: false }, { today: "2026-11-28" }).valid, false);
  assert.equal(applyCoupon({ ...coupon, referrer_active: false }, { today: "2026-11-28" }).valid, false);
  assert.equal(applyCoupon(null, { today: "2026-11-28" }).valid, false);
  assert.equal(normalizeCode(" mario-10 "), "MARIO-10");
  assert.equal(normalizeCode("x"), "");
  assert.equal(normalizeCode("drop table;"), "");
});

test("checkout form carries order id, price and return urls", () => {
  const form = new URLSearchParams(checkoutForm({ orderId: "abc", email: "a@b.it", siteUrl: "https://x.dev/" }));
  assert.equal(form.get("client_reference_id"), "abc");
  assert.equal(form.get("line_items[0][price_data][unit_amount]"), String(PRICE_CENTS));
  assert.equal(PRICE_CENTS, 4900);
  assert.equal(form.get("success_url"), "https://x.dev/account/?ordine=abc");
  assert.equal(form.get("cancel_url"), "https://x.dev/#ordine");
});

test("stripe signature: valid, tampered, expired, wrong secret", async () => {
  const body = '{"type":"checkout.session.completed"}', secret = "whsec_test", t = 1_800_000_000;
  const header = `t=${t},v1=${await stripeSignature(body, secret, t)}`;
  const now = t * 1000;
  assert.equal(await verifyStripeSignature(body, header, secret, now), true);
  assert.equal(await verifyStripeSignature(body + " ", header, secret, now), false);
  assert.equal(await verifyStripeSignature(body, header, secret, now + 301_000), false);
  assert.equal(await verifyStripeSignature(body, header, "whsec_other", now), false);
  assert.equal(await verifyStripeSignature(body, "garbage", secret, now), false);
  assert.equal(await verifyStripeSignature(body, header, "", now), false);
});
