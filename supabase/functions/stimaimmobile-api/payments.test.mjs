import test from "node:test";
import assert from "node:assert/strict";
import { checkoutForm, stripeSignature, verifyStripeSignature, PRICE_CENTS } from "./payments.mjs";

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
