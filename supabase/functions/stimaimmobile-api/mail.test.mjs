import test from "node:test";
import assert from "node:assert/strict";
import { isEmail, requestKind, mailFrom, thankYouMessage, sendThankYou, MAIL_FROM, MAIL_FROM_FALLBACK } from "./mail.mjs";

test("riconosce email e tipi di richiesta", () => {
  assert.equal(isEmail("paolo@example.it"), true);
  assert.equal(isEmail("nope"), false);
  assert.equal(requestKind("estimate"), "estimate");
  assert.equal(requestKind("altro", true), "coverage");
  assert.equal(requestKind("altro", false), "contact");
});

test("sceglie il mittente dal dominio Resend verificato, con preferenza sonyc", () => {
  assert.equal(mailFrom([]), MAIL_FROM_FALLBACK);
  assert.equal(mailFrom([{ name: "vetrik.it", status: "verified" }]), "StimaImmobile.it <noreply@vetrik.it>");
  assert.equal(mailFrom([
    { name: "vetrik.it", status: "verified" },
    { name: "sonyc.it", status: "verified" }
  ]), MAIL_FROM);
});

test("il testo ringrazia senza overclaim legale", () => {
  const mail = thankYouMessage("Paolo");
  assert.match(mail.subject, /Abbiamo ricevuto/);
  assert.match(mail.text, /Ciao Paolo/);
  assert.match(mail.text, /ti ricontatteremo/);
  assert.match(mail.text, /indicativa/);
  assert.doesNotMatch(mail.text, /perizia ufficiale|valore legale|certificat/i);
  assert.match(mail.html, /Paolo/);
});

test("non invia senza chiave e inoltra a Resend con il mittente scelto", async () => {
  assert.deepEqual(await sendThankYou({ apiKey: "", to: "a@b.it", name: "A" }), { sent: false, reason: "missing-key" });
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200 };
  };
  const result = await sendThankYou({ apiKey: "re_test", from: MAIL_FROM, to: "a@b.it", name: "Ada", fetchImpl });
  assert.equal(result.sent, true);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.from, MAIL_FROM);
  assert.deepEqual(body.to, ["a@b.it"]);
  assert.match(body.text, /Ciao Ada/);
});
