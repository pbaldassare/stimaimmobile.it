export const KINDS = ["contact", "coverage", "estimate"];
export const STATUSES = ["new", "contacted", "closed"];
export const MAIL_FROM = "StimaImmobile.it <noreply@sonyc.it>";
export const MAIL_FROM_FALLBACK = "StimaImmobile.it <beth.t@example.com>";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value) {
  return typeof value === "string" && EMAIL.test(value.trim()) && value.trim().length <= 254;
}

export function requestKind(value, hasArea = false) {
  if (KINDS.includes(value)) return value;
  return hasArea ? "coverage" : "contact";
}

export function mailFrom(domains) {
  const verified = (Array.isArray(domains) ? domains : [])
    .filter(item => item && (item.status === "verified" || item.status === "success"))
    .map(item => String(item.name || "").toLowerCase());
  const pick = (test) => verified.find(name => test.test(name));
  const domain = pick(/(^|\.)sonyc\.it$/) || pick(/(^|\.)stimaimmobile\.it$/) || verified[0];
  if (!domain) return MAIL_FROM_FALLBACK;
  return "StimaImmobile.it <noreply@" + domain + ">";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

export function thankYouMessage(name) {
  const who = typeof name === "string" ? name.trim() : "";
  const greeting = who ? "Ciao " + who + "," : "Ciao,";
  const text = greeting + "\n\n"
    + "grazie per averci scritto. Abbiamo ricevuto la tua richiesta e ti ricontatteremo all’indirizzo email che ci hai indicato.\n\n"
    + "Se hai già ottenuto una stima sul sito, resta indicativa e dipende dai dati dichiarati: non sostituisce una perizia o una valutazione formale.\n\n"
    + "Cordiali saluti,\nStimaImmobile.it";
  const html = '<div style="font-family:Georgia,\'Times New Roman\',serif;color:#202d31;max-width:560px;line-height:1.6">'
    + "<p>" + escapeHtml(greeting) + "</p>"
    + "<p>Grazie per averci scritto. Abbiamo ricevuto la tua richiesta e ti ricontatteremo all’indirizzo email che ci hai indicato.</p>"
    + "<p>Se hai già ottenuto una stima sul sito, resta indicativa e dipende dai dati dichiarati: non sostituisce una perizia o una valutazione formale.</p>"
    + "<p>Cordiali saluti,<br>StimaImmobile.it</p>"
    + "</div>";
  return {
    subject: "Abbiamo ricevuto la tua richiesta · StimaImmobile.it",
    text,
    html
  };
}

export async function sendThankYou({ apiKey, from = MAIL_FROM, to, name, fetchImpl = fetch }) {
  if (!apiKey) return { sent: false, reason: "missing-key" };
  if (!isEmail(to)) return { sent: false, reason: "invalid-to" };
  const mail = thankYouMessage(name);
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to.trim()], subject: mail.subject, text: mail.text, html: mail.html })
  });
  if (!response.ok) return { sent: false, reason: "http-" + response.status };
  return { sent: true };
}
