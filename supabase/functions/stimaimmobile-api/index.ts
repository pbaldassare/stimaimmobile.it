import postgres from "npm:postgres@3.4.7";
import { calculate, normalizeInputs, questions, ENGINE_VERSION } from "../../../engine/valuation.mjs";
import { makePdf } from "../../../engine/pdf.mjs";
import { previewCatalog } from "./catalog.mjs";

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
async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const pathname = new URL(req.url).pathname.split("/stimaimmobile-api").at(-1) || "/";
  const route = req.method + " " + pathname;
  if (route === "GET /questions") return json({ questions });
  if (route === "GET /zones") {
    const zones = await scope(tx => tx`select comune,zona,destinazione from stimaimmobile.rates order by comune,zona,destinazione`);
    return json({ zones });
  }
  if (route === "POST /estimate") {
    const data = await readBody(req), area = region(data);
    if (!data.inputs || typeof data.inputs !== "object" || Array.isArray(data.inputs))
      throw new HttpError(422, "Compila le caratteristiche dell’immobile.");
    const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const tokenDigest = await digest(token);
    const result = await scope(async tx => {
      const [rate] = await tx`select euro_mq,fonte,data_riferimento::text from stimaimmobile.rates
        where comune=${area.comune} and zona=${area.zona} and destinazione=${area.destinazione}`;
      if (!rate) throw new HttpError(404, "Quotazione indisponibile per questa zona e destinazione.");
      let inputs, result;
      try {
        inputs = normalizeInputs(data.inputs);
        result = calculate(inputs, Number(rate.euro_mq));
      } catch (error) { throw new HttpError(422, error instanceof Error ? error.message : "Verifica i dati inseriti."); }
      const snapshot = { inputs, result, ...area, fonte:rate.fonte, data_riferimento:rate.data_riferimento,
        createdAt:new Date().toISOString(), engineVersion:ENGINE_VERSION };
      await tx`insert into stimaimmobile.estimates(token_digest,snapshot) values(${tokenDigest},${tx.json(snapshot)})`;
      return { ...result, fonte:snapshot.fonte, data_riferimento:snapshot.data_riferimento, createdAt:snapshot.createdAt };
    });
    return json({ ...result, pdfUrl:`${url}/functions/v1/stimaimmobile-api/pdf/${token}` }, 201);
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(422, "Inserisci un indirizzo email valido.");
    await scope(tx => tx`insert into stimaimmobile.contacts(name,email,message,comune,zona,destinazione)
      values(${name},${email},${message},${area.comune},${area.zona},${area.destinazione})`);
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
      const contacts = await scope(tx => tx`select id,created_at,name,email,message,comune,zona,destinazione
        from stimaimmobile.contacts order by created_at desc limit 100`);
      return json({ contacts });
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
