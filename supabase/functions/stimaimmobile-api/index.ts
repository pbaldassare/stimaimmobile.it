import postgres from "npm:postgres@3.4.7";
import { calculate, normalizeInputs, questions, ENGINE_VERSION } from "../../../engine/valuation.mjs";
import { makePdf } from "../../../engine/pdf.mjs";
import { canonicalZone } from "../../../engine/zones.mjs";
import { previewCatalog } from "./catalog.mjs";
import { addressCandidates } from "./geocoding.mjs";
import { isEmail, requestKind, sendThankYou, MAIL_FROM, STATUSES } from "./mail.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_ANON_KEY")!;
const db = postgres(Deno.env.get("SUPABASE_DB_URL")!, {
  max: 1, prepare: false, idle_timeout: 5, connect_timeout: 8,
});

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors });
}
function scope<T>(action: (tx: postgres.TransactionSql) => Promise<T>) {
  return db.begin(async tx => {
    await tx`set local role stimaimmobile_app`;
    await tx`set local search_path = pg_catalog, stimaimmobile`;
    return await action(tx);
  });
}
async function readBody(req: Request, limit = 32768) {
  if (!req.headers.get("Content-Type")?.toLowerCase().startsWith("application/json"))
    throw new HttpError(415, "Invia i dati in formato JSON.");
  if (Number(req.headers.get("Content-Length")) > limit) throw new HttpError(413, "Dati troppo grandi.");
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "Corpo della richiesta mancante.");
  const decoder = new TextDecoder();
  let size = 0, body = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new HttpError(413, "Dati troppo grandi."); }
    body += decoder.decode(value, { stream: true });
  }
  try {
    const result = JSON.parse(body + decoder.decode());
    if (result === null || Array.isArray(result) || typeof result !== "object") throw new Error();
    return result;
  } catch { throw new HttpError(400, "Il JSON inviato non è valido."); }
}
function field(value: unknown, label: string, max = 150, required = true): string {
  const text = typeof value === "string" ? value.trim().normalize("NFC") : "";
  if (text.length > max || (required && !text) || /\u0000/.test(text))
    throw new HttpError(422, `Controlla il campo ${label}.`);
  return text;
}
function region(data: Record<string,unknown>, required = true) {
  return {
    comune: field(data.comune, "comune", 150, required), zona: field(data.zona, "zona", 150, required),
    destinazione: field(data.destinazione, "destinazione", 150, required),
  };
}
function toHex(bytes: ArrayBuffer | Uint8Array) {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}
async function digest(token: string) {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
}
async function requireAdmin(token: string) {
  if (!token) throw new HttpError(401, "Accedi all’area amministrativa.");
  const auth = await fetch(url + "/auth/v1/user", { headers: { apikey: key, Authorization: "Bearer " + token } });
  if (!auth.ok) throw new HttpError(auth.status >= 500 ? 503 : 401, "Sessione non disponibile. Accedi di nuovo.");
  const user = await auth.json();
  const users = await scope(tx => tx`select user_id from stimaimmobile.admins where user_id = ${user.id}::uuid`);
  if (!users.length) throw new HttpError(403, "Account non abilitato a StimaImmobile.");
  return user.id;
}
async function resendApiKey() {
  try {
    const [row] = await scope(tx => tx`select stimaimmobile.resend_api_key() as key`);
    if (typeof row?.key === "string" && row.key) return row.key;
  } catch (error) {
    console.error("Resend vault unavailable", error instanceof Error ? error.name : "unknown");
  }
  return Deno.env.get("RESEND_API_KEY") || "";
}
async function notifyThankYou(name: string, email: string) {
  try {
    const apiKey = await resendApiKey();
    const result = await sendThankYou({ apiKey, from: MAIL_FROM, to: email, name });
    if (!result.sent) console.error("Resend thank-you skipped", result.reason);
  } catch (error) {
    console.error("Resend thank-you failed", error instanceof Error ? error.name : "unknown");
  }
}
async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const pathname = new URL(req.url).pathname.split("/stimaimmobile-api").at(-1) || "/";
  const route = req.method + " " + pathname;
  if (route === "GET /questions") return json({ questions, engineVersion: ENGINE_VERSION });
  if (route === "POST /address") {
    const data = await readBody(req, 2048);
    const address = field(data.address, "indirizzo", 220);
    if (address.length < 5) throw new HttpError(422, "Inserisci via e comune.");
    const [slot] = await scope(tx => tx`select stimaimmobile.reserve_maps_request() as credential`);
    if (!slot?.credential) throw new HttpError(429, "Ricerca indirizzo indisponibile. Puoi inserire il comune a mano.");
    const search = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    search.search = new URLSearchParams({ address, language:"it", components:"country:IT", key:slot.credential }).toString();
    const upstream = await fetch(search, {signal:AbortSignal.timeout(7000), redirect:"error"});
    if (!upstream.ok) throw new HttpError(503, "Google Maps non disponibile. Puoi inserire il comune a mano.");
    const geo = await upstream.json();
    if (geo.status === "ZERO_RESULTS") return json({ addresses:[] });
    if (geo.status !== "OK") {
      console.warn("Geocoding status", String(geo.status).slice(0,32));
      throw new HttpError(503, "Ricerca indirizzo non disponibile. Puoi inserire il comune a mano.");
    }
    return json({ addresses:addressCandidates(geo.results) });
  }
  if (route === "GET /zones") {
    const zones = await scope(tx => tx`select comune,zona,destinazione from stimaimmobile.rates order by comune,zona,destinazione`);
    return json({ zones, engineVersion: ENGINE_VERSION });
  }
  if (route === "POST /estimate") {
    const data = await readBody(req), area = region(data);
    area.zona = canonicalZone(area.zona);
    if (!data.inputs || typeof data.inputs !== "object" || Array.isArray(data.inputs))
      throw new HttpError(422, "Compila le caratteristiche dell’immobile.");
    const name = field(data.name, "nome", 120, false);
    const email = field(data.email, "email", 254, false);
    if (email && !isEmail(email)) throw new HttpError(422, "Inserisci un indirizzo email valido.");
    const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const tokenDigest = await digest(token);
    const result = await scope(async tx => {
      const [rate] = await tx`select comune,zona,destinazione,euro_mq,fonte,data_riferimento::text from stimaimmobile.rates
        where lower(trim(comune)) = lower(trim(${area.comune}))
          and lower(trim(zona)) = lower(trim(${area.zona}))
          and lower(trim(destinazione)) = lower(trim(${area.destinazione}))`;
      if (!rate) throw new HttpError(404, "Quotazione indisponibile per questa zona e destinazione.");
      area.comune = rate.comune; area.zona = rate.zona; area.destinazione = rate.destinazione;
      let inputs, result;
      try {
        inputs = normalizeInputs(data.inputs);
        result = calculate(inputs, Number(rate.euro_mq));
      } catch (error) { throw new HttpError(422, error instanceof Error ? error.message : "Verifica i dati inseriti."); }
      const snapshot = { inputs, result, ...area, fonte:rate.fonte, data_riferimento:rate.data_riferimento,
        createdAt:new Date().toISOString(), engineVersion:ENGINE_VERSION };
      await tx`insert into stimaimmobile.estimates(token_digest,snapshot) values(${tokenDigest},${tx.json(snapshot)})`;
      if (email) {
        const summary = `Stima indicativa ${result.value} € (minimo ${result.minimum} €), superficie ${result.surface} m².`;
        await tx`insert into stimaimmobile.contacts(name,email,message,comune,zona,destinazione,kind)
          values(${name || "Visitatore"},${email},${summary},${area.comune},${area.zona},${area.destinazione},'estimate')`;
      }
      return { ...result, fonte:snapshot.fonte, data_riferimento:snapshot.data_riferimento, createdAt:snapshot.createdAt,
        contactReceived:Boolean(email) };
    });
    if (email) await notifyThankYou(name, email);
    return json({ ...result, engineVersion: ENGINE_VERSION, pdfUrl:`${url}/functions/v1/stimaimmobile-api/pdf/${token}` }, 201);
  }
  if (req.method === "GET" && pathname.startsWith("/pdf/")) {
    const token = pathname.slice(5);
    if (!/^[a-f0-9]{64}$/.test(token)) throw new HttpError(404, "Relazione non trovata.");
    const tokenDigest = await digest(token);
    const [document] = await scope(tx => tx`select snapshot from stimaimmobile.estimates where token_digest=${tokenDigest}`);
    if (!document) throw new HttpError(404, "Relazione non trovata.");
    return new Response(await makePdf(document.snapshot), { headers:{ ...cors, "Content-Type":"application/pdf",
      "Content-Disposition":'attachment; filename="Relazione-StimaImmobile.pdf"' } });
  }
  if (route === "POST /contact") {
    const data = await readBody(req), area = region(data, false);
    const name = field(data.name,"nome",120), email = field(data.email,"email",254);
    const message = field(data.message,"messaggio",3000,false);
    if (!isEmail(email)) throw new HttpError(422, "Inserisci un indirizzo email valido.");
    const kind = requestKind(typeof data.kind === "string" ? data.kind : "", Boolean(area.comune || area.zona || area.destinazione));
    await scope(tx => tx`insert into stimaimmobile.contacts(name,email,message,comune,zona,destinazione,kind)
      values(${name},${email},${message},${area.comune},${area.zona},${area.destinazione},${kind})`);
    await notifyThankYou(name, email);
    return json({ received:true }, 201);
  }
  if (route === "POST /admin/login") {
    const data = await readBody(req), email = field(data.email,"email",254);
    if (typeof data.password !== "string" || !data.password.length || data.password.length > 4096)
      throw new HttpError(401, "Credenziali non valide.");
    const auth = await fetch(url + "/auth/v1/token?grant_type=password", { method:"POST",
      headers:{ apikey:key,"Content-Type":"application/json" }, body:JSON.stringify({ email,password:data.password }) });
    if (!auth.ok) throw new HttpError(auth.status === 429 ? 429 : auth.status >= 500 ? 503 : 401, "Accesso non riuscito. Verifica le credenziali o riprova più tardi.");
    const session = await auth.json();
    await requireAdmin(session.access_token);
    return json({ access_token:session.access_token,expires_in:session.expires_in });
  }
  if (pathname.startsWith("/admin/")) {
    const token = req.headers.get("Authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1] || "";
    const userId = await requireAdmin(token);
    if (route === "GET /admin/contacts") {
      const contacts = await scope(tx => tx`select id,created_at,updated_at,name,email,message,comune,zona,destinazione,kind,status,notes
        from stimaimmobile.contacts order by created_at desc limit 200`);
      return json({ contacts });
    }
    if (route === "POST /admin/contact") {
      const data = await readBody(req);
      const id = field(data.id, "richiesta", 36);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
        throw new HttpError(422, "Richiesta non valida.");
      const status = field(data.status, "stato", 32);
      if (STATUSES.indexOf(status) < 0) throw new HttpError(422, "Stato non valido.");
      const notes = field(data.notes, "note", 4000, false);
      const [contact] = await scope(tx => tx`update stimaimmobile.contacts
        set status=${status}, notes=${notes}, updated_at=now()
        where id=${id}::uuid
        returning id,created_at,updated_at,name,email,message,comune,zona,destinazione,kind,status,notes`);
      if (!contact) throw new HttpError(404, "Richiesta non trovata.");
      return json({ contact });
    }
    if (route === "POST /admin/preview" || route === "POST /admin/publish") {
      const { csv } = await readBody(req, 4 * 1024 * 1024);
      const preview = previewCatalog(csv);
      if (pathname.endsWith("/preview")) return json({ ...preview, rows:preview.rows.slice(0,100) });
      if (preview.errors.length) return json({ error:"Correggi il CSV prima di pubblicare.", errors:preview.errors }, 422);
      await scope(async tx => {
        // Serialize whole-list replacements, including the first publication with an empty table.
        await tx`select pg_advisory_xact_lock(548625, 1701)`;
        await tx`delete from stimaimmobile.rates`;
        await tx`insert into stimaimmobile.rates(comune,zona,destinazione,euro_mq,fonte,data_riferimento,published_by)
          select r.*, ${userId}::uuid from jsonb_to_recordset(${tx.json(preview.rows)}::jsonb) as
          r(comune text,zona text,destinazione text,euro_mq numeric,fonte text,data_riferimento date)`;
      });
      return json({ published:preview.total });
    }
  }
  throw new HttpError(404, "Risorsa non trovata.");
}
Deno.serve(async req => {
  try { return await handle(req); }
  catch (error) {
    if (error instanceof HttpError) return json({ error:error.message }, error.status);
    console.error("StimaImmobile request failed", error instanceof Error ? error.name : "unknown",
      typeof error === "object" && error && "code" in error ? String(error.code) : "");
    return json({ error:"Servizio temporaneamente non disponibile. Riprova tra poco." }, 503);
  }
});
