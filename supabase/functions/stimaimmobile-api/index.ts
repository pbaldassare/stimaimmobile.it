import postgres from "npm:postgres@3.4.7";
import { calculate, normalizeInputs, ENGINE_VERSION } from "../../../engine/valuation.mjs";
import { fields as seedFields } from "../../../engine/model.mjs";
import { fromAdminFields, fromDbRows, publicQuestions, toAdminFields, toDbRows } from "../../../engine/catalog.mjs";
import { makePdf } from "../../../engine/pdf.mjs";
import { canonicalZone } from "../../../engine/zones.mjs";
import { OMI_FONTE, OMI_LICENSE } from "../../../engine/omi.mjs";
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
    comune: field(data.comune, "comune", 150, required), zona: field(data.zona, "zona", 300, required),
    destinazione: field(data.destinazione, "destinazione", 150, required),
  };
}
function likeNeedle(value: string) {
  return value.toLocaleLowerCase("it").replace(/[%_\\]/g, "\\$&");
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

function isMissingRelation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && String(error.code) === "42P01";
}
function referenceDate(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.valueOf())) return value.toISOString().slice(0, 10);
  const text = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}
async function loadCatalog(tx: postgres.TransactionSql) {
  try {
    const fieldRows = await tx`select id, label, group_name, control_type, sort_order, required, active, partial,
      min_value, max_value, step_value, fallback, when_field_id, when_values
      from stimaimmobile.valuation_fields order by sort_order, id`;
    if (!fieldRows.length) return seedFields;
    const optionRows = await tx`select field_id, value, label, coefficient, scored, public, sort_order, aliases
      from stimaimmobile.valuation_options order by field_id, sort_order`;
    return fromDbRows(fieldRows, optionRows);
  } catch (error) {
    if (isMissingRelation(error)) return seedFields;
    throw error;
  }
}
async function saveCatalog(tx: postgres.TransactionSql, catalog: typeof seedFields) {
  const { fields: fieldRows, options } = toDbRows(catalog);
  await tx`select pg_advisory_xact_lock(548625, 1702)`;
  await tx`truncate stimaimmobile.valuation_fields cascade`;
  await tx`insert into stimaimmobile.valuation_fields (
      id, label, group_name, control_type, sort_order, required, active, partial,
      min_value, max_value, step_value, fallback, when_field_id, when_values)
    select id, label, group_name, control_type, sort_order, required, active, partial,
           min_value, max_value, step_value, fallback, when_field_id, when_values
    from jsonb_to_recordset(${tx.json(fieldRows)}::jsonb) as r(
      id text, label text, group_name text, control_type text, sort_order integer,
      required boolean, active boolean, partial boolean,
      min_value numeric, max_value numeric, step_value numeric, fallback numeric,
      when_field_id text, when_values text[])`;
  if (options.length) {
    await tx`insert into stimaimmobile.valuation_options (
        field_id, value, label, coefficient, scored, public, sort_order, aliases)
      select field_id, value, label, coefficient, scored, public, sort_order, aliases
      from jsonb_to_recordset(${tx.json(options)}::jsonb) as r(
        field_id text, value text, label text, coefficient numeric, scored boolean,
        public boolean, sort_order integer, aliases text[])`;
  }
}
async function lookupRate(tx: postgres.TransactionSql, area: {comune:string,zona:string,destinazione:string}) {
  try {
    const [rate] = await tx`select * from stimaimmobile.lookup_zone_rate(${area.comune}, ${area.zona}, ${area.destinazione})`;
    if (rate) return rate;
  } catch (error) {
    if (!isMissingRelation(error)) throw error;
  }
  const [rate] = await tx`select comune,zona,destinazione,euro_mq,euro_mq as euro_mq_min,euro_mq as euro_mq_max,
    fonte,data_riferimento::text,'listino'::text as source from stimaimmobile.rates
    where lower(trim(comune)) = lower(trim(${area.comune}))
      and lower(trim(zona)) = lower(trim(${area.zona}))
      and lower(trim(destinazione)) = lower(trim(${area.destinazione}))`;
  return rate;
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
  const requestUrl = new URL(req.url);
  const pathname = requestUrl.pathname.split("/stimaimmobile-api").at(-1) || "/";
  const route = req.method + " " + pathname;
  if (route === "GET /questions") {
    const catalog = await scope(loadCatalog);
    return json({ questions: publicQuestions(catalog), engineVersion: ENGINE_VERSION });
  }
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
    const comune = field(requestUrl.searchParams.get("comune") || "", "comune", 150, false);
    const query = field(requestUrl.searchParams.get("q") || "", "ricerca", 80, false);
    const payload = await scope(async tx => {
      const [coverage] = await tx`
        select count(*)::int as quotes,
          count(*) filter (where fonte = ${OMI_FONTE})::int as omi,
          count(distinct lower(trim(comune)))::int as comuni,
          max(data_riferimento) filter (where fonte = ${OMI_FONTE})::text as omi_date
        from stimaimmobile.rates`;
      const listino = {
        quotes: coverage?.quotes ?? 0,
        comuni: coverage?.comuni ?? 0,
        omi: coverage?.omi ?? 0,
        omiDate: coverage?.omi_date || null,
        fonte: OMI_FONTE,
        license: OMI_LICENSE,
        engineVersion: ENGINE_VERSION,
      };
      if (comune) {
        const zones = await tx`
          select comune,zona,destinazione,fonte,data_riferimento::text
          from stimaimmobile.rates
          where lower(trim(comune)) = lower(trim(${comune}))
          order by zona,destinazione`;
        return { zones, comuni: [], listino, engineVersion: ENGINE_VERSION };
      }
      if (query) {
        if (query.length < 2) throw new HttpError(422, "Inserisci almeno due caratteri per la ricerca.");
        const needle = likeNeedle(query);
        const zones = await tx`
          select comune,zona,destinazione,fonte
          from stimaimmobile.rates
          where lower(comune || ' ' || zona || ' ' || destinazione) like ${'%' + needle + '%'} escape ${'\\'}
          order by comune,zona,destinazione
          limit 250`;
        return { zones, comuni: [], listino, engineVersion: ENGINE_VERSION };
      }
      const comuni = await tx`
        select distinct on (lower(trim(comune))) comune
        from stimaimmobile.rates
        order by lower(trim(comune)), case when fonte = ${OMI_FONTE} then 1 else 0 end, comune`;
      return { zones: [], comuni: comuni.map((row: {comune: string}) => row.comune), listino, engineVersion: ENGINE_VERSION };
    });
    return json(payload);
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
      const rate = await lookupRate(tx, area);
      if (!rate) throw new HttpError(404, "Quotazione indisponibile per questa zona e destinazione.");
      area.comune = rate.comune; area.zona = rate.zona; area.destinazione = rate.destinazione;
      const catalog = await loadCatalog(tx);
      let inputs, result;
      try {
        inputs = normalizeInputs(data.inputs, catalog);
        result = calculate(inputs, Number(rate.euro_mq), catalog);
      } catch (error) { throw new HttpError(422, error instanceof Error ? error.message : "Verifica i dati inseriti."); }
      const dataRiferimento = referenceDate(rate.data_riferimento);
      const snapshot = { inputs, result, ...area, fonte:rate.fonte, data_riferimento:dataRiferimento,
        rateMin: rate.euro_mq_min == null ? undefined : Number(rate.euro_mq_min),
        rateMax: rate.euro_mq_max == null ? undefined : Number(rate.euro_mq_max),
        rateSource: rate.source || (String(rate.fonte || "").includes("OMI") ? "omi" : "listino"),
        questions: publicQuestions(catalog),
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
    if (route === "GET /admin/omi") {
      const [stats] = await scope(tx => tx`
        select
          (select count(*)::int from stimaimmobile.omi_zones) as zones,
          (select count(*)::int from stimaimmobile.omi_quotes) as quotes,
          (select count(distinct semester)::int from stimaimmobile.omi_quotes) as semesters,
          (select max(semester) from stimaimmobile.omi_quotes) as latest,
          (select count(*)::int from stimaimmobile.rates where fonte = ${OMI_FONTE}) as rates,
          (select count(*)::int from stimaimmobile.rates where fonte is distinct from ${OMI_FONTE}) as other_rates`);
      return json({ ...stats, fonte: OMI_FONTE, license: OMI_LICENSE });
    }
    if (route === "GET /admin/omi/quotes") {
      const comune = field(requestUrl.searchParams.get("comune") || "", "comune", 150);
      if (comune.length < 2) throw new HttpError(422, "Inserisci almeno due caratteri per il comune.");
      const zona = field(requestUrl.searchParams.get("zona") || "", "zona", 150, false);
      const requested = field(requestUrl.searchParams.get("semester") || "", "semestre", 8, false);
      if (requested && requested !== "2018-2") throw new HttpError(422, "È disponibile solo il semestre 2018-2.");
      const semester = "2018-2";
      const offsetRaw = requestUrl.searchParams.get("offset") || "0";
      if (!/^\d{1,4}$/.test(offsetRaw) || Number(offsetRaw) > 4000) throw new HttpError(422, "Pagina non valida.");
      const offset = Number(offsetRaw);
      const limit = 80;
      const zonaNeedle = zona ? "%" + likeNeedle(zona) + "%" : "";
      const rows = await scope(tx => tx`
        select comune, zona, tipologia, euro_mq, semester
        from (
          select distinct on (
            lower(trim(q.comune)),
            lower(trim(left(coalesce(nullif(trim(z.zona_descr), ''), q.zona), 150))),
            lower(trim(left(q.tipologia, 150)))
          )
            q.comune,
            left(coalesce(nullif(trim(z.zona_descr), ''), q.zona), 150) as zona,
            left(q.tipologia, 150) as tipologia,
            round((
              case
                when coalesce(q.compr_min, 0) > 0 and coalesce(q.compr_max, 0) > 0 then (q.compr_min + q.compr_max) / 2
                when coalesce(q.compr_min, 0) > 0 then q.compr_min
                else q.compr_max
              end
            ), 2) as euro_mq,
            q.semester
          from stimaimmobile.omi_quotes q
          left join stimaimmobile.omi_zones z
            on z.semester = q.semester and z.link_zona = q.link_zona
          where q.semester = ${semester}
            and lower(trim(q.comune)) = lower(trim(${comune}))
            and (coalesce(q.compr_min, 0) > 0 or coalesce(q.compr_max, 0) > 0)
            and (
              ${zonaNeedle} = ''
              or lower(trim(q.zona)) like ${zonaNeedle} escape ${"\\"}
              or lower(trim(coalesce(z.zona_descr, ''))) like ${zonaNeedle} escape ${"\\"}
            )
          order by
            lower(trim(q.comune)),
            lower(trim(left(coalesce(nullif(trim(z.zona_descr), ''), q.zona), 150))),
            lower(trim(left(q.tipologia, 150))),
            case when q.stato_prevalente then 0 when lower(trim(q.stato)) = 'normale' then 1 else 2 end
        ) mapped
        where euro_mq > 0
        order by comune, zona, tipologia
        limit ${limit + 1}
        offset ${offset}`);
      const page = rows.slice(0, limit).map(row => ({
        comune: row.comune, zona: row.zona, tipologia: row.tipologia,
        euro_mq: Number(row.euro_mq), semester: row.semester,
      }));
      return json({
        rows: page, hasMore: rows.length > limit, offset, semester,
        fonte: OMI_FONTE, license: OMI_LICENSE,
      });
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
    if (route === "GET /admin/fields") {
      const catalog = await scope(loadCatalog);
      return json({ fields: toAdminFields(catalog), engineVersion: ENGINE_VERSION });
    }
    if (route === "POST /admin/fields" || route === "POST /admin/fields/reset") {
      let catalog;
      try {
        catalog = route.endsWith("/reset") ? seedFields : fromAdminFields(await readBody(req, 524288));
      } catch (error) { throw new HttpError(422, error instanceof Error ? error.message : "Verifica i campi."); }
      await scope(tx => saveCatalog(tx, catalog));
      return json({ fields: toAdminFields(catalog), engineVersion: ENGINE_VERSION, reset: route.endsWith("/reset") });
    }
    if (route === "POST /admin/preview" || route === "POST /admin/publish") {
      const { csv } = await readBody(req, 4 * 1024 * 1024);
      const preview = previewCatalog(csv);
      if (pathname.endsWith("/preview")) return json({ ...preview, rows:preview.rows.slice(0,100) });
      if (preview.errors.length) return json({ error:"Correggi il CSV prima di pubblicare.", errors:preview.errors }, 422);
      await scope(async tx => {
        // Replace operator rows; keep OMI national coverage unless the CSV overrides the same key.
        await tx`select pg_advisory_xact_lock(548625, 1701)`;
        await tx`delete from stimaimmobile.rates r
          where r.fonte is distinct from ${OMI_FONTE}
             or exists (
               select 1 from jsonb_to_recordset(${tx.json(preview.rows)}::jsonb) as
                 x(comune text,zona text,destinazione text,euro_mq numeric,fonte text,data_riferimento date)
               where lower(trim(r.comune)) = lower(trim(x.comune))
                 and lower(trim(r.zona)) = lower(trim(x.zona))
                 and lower(trim(r.destinazione)) = lower(trim(x.destinazione))
             )`;
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
