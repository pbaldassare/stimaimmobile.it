# Database di StimaImmobile

Il backend usa lo schema privato `stimaimmobile` nel progetto Supabase `dukuozoqinycdetxqsvr`. Le richieste passano dalla funzione server `stimaimmobile-api`. Il database applica il ruolo locale `stimaimmobile_app` in ogni transazione. Le tabelle hanno RLS attiva. Lo schema rimane fuori dalla Data API.

## Abilitare un amministratore

1. Nella sezione Authentication del progetto, individua l’utente Supabase Auth della persona incaricata. Se occorre un nuovo account, crealo con le normali procedure del progetto.
2. Copia il suo User UID. Nel SQL Editor del progetto esegui la seguente istruzione sostituendo il segnaposto con quel UUID verificato.

```sql
insert into stimaimmobile.admins(user_id)
values ('UUID_VERIFICATO'::uuid)
on conflict (user_id) do nothing;
```

3. Accedi all’area amministrativa del sito con l’indirizzo email e la password di quell’account. L’accesso richiede sia una sessione Supabase valida sia la presenza dell’UID nella tabella dedicata. L’applicazione verifica entrambi a ogni operazione amministrativa.
4. Per revocare l’accesso a questa applicazione, elimina la sola associazione.

```sql
delete from stimaimmobile.admins where user_id = 'UUID_VERIFICATO'::uuid;
```

## Pubblicare il primo listino

Scarica il modello dall’area amministrativa o usa `data/modello-listino.csv`. Ogni riga rappresenta una combinazione di comune, zona e destinazione d’uso. Inserisci la quotazione in euro al metro quadro, la fonte e la data di riferimento nel formato `AAAA-MM-GG`. Il modello contiene solo le intestazioni.

Il file `data/listino-esempio-excel.csv` pubblica la quotazione d’esempio del foglio CALCOLI B80: Brescia, Centro storico, Direzionale, 1450 €/m², fonte `esempio Excel CALCOLI B80`, data `2014-04-04`. Con un account abilitato in `stimaimmobile.admins`:

```bash
STIMAIMMOBILE_ADMIN_EMAIL='…' STIMAIMMOBILE_ADMIN_PASSWORD='…' npm run publish:listino
```

Il comando pubblica quel CSV come listino operatore e lascia le quotazioni OMI, salvo chiavi identiche. L’API accetta anche il refuso Excel `Cenro storico` come alias di `Centro storico`.

Salva in UTF-8. Sono ammessi il punto e virgola e la virgola come delimitatori. Con valori decimali separati da virgola, usa il punto e virgola come delimitatore oppure racchiudi il numero tra virgolette. Carica dal pannello un file fino a 1 MiB e controlla le prime 30 righe in anteprima. L’intero file deve superare i controlli per la pubblicazione. L’API accetta fino a 10.000 quotazioni e 4 MiB di richiesta JSON, restituendo fino a 100 righe di anteprima.

La pubblicazione da CSV sostituisce le quotazioni dell’operatore e lascia le righe con fonte `Agenzia delle Entrate – OMI`, salvo chiavi identiche nel file. Ogni relazione emessa conserva quotazione, fonte, data e risultati utilizzati.

## Quotazioni OMI

Le tabelle `stimaimmobile.omi_zones` e `stimaimmobile.omi_quotes` conservano i CSV pubblici rielaborati da ondata (UTF-8, cartella `data/`), con semestre, comune, zona, tipologia, stato, min/max di compravendita e locazione se presente. Fonte: **«Agenzia delle Entrate – OMI»**, licenza CC-BY 4.0. ondata è un redistributore; il download ufficiale è Forniture OMI. I CSV non vanno in git. In produzione postgres li scarica da GitHub (`stimaimmobile.omi_fetch_csv` + `omi_ingest_cached_range`); in locale `npm run import:omi` prepara lotti JSON. Poi `select stimaimmobile.publish_omi_rates()` scrive nel listino il semestre più recente usando il punto medio min/max, senza toccare l’esempio Excel Brescia · Centro storico · Direzionale. `GET /zones` elenca i comuni; `GET /zones?comune=` e `GET /zones?q=` restituiscono le combinazioni. L’area riservata mostra i conteggi su `GET /admin/omi`. I plus/minus del questionario stanno in `stimaimmobile.valuation_fields` e `valuation_options` (`GET`/`POST /admin/fields`, `POST /admin/fields/reset` per il seme Excel). La stima parte da `stimaimmobile.lookup_zone_rate`, che legge il listino OMI già in `rates` e, se presente, l’intervallo min/max di `omi_quotes`.

## Distribuzione

La migrazione versionata in `supabase/migrations` è già applicata al progetto indicato. Per la funzione, distribuire l’entrypoint dichiarato in `supabase/config.toml` insieme al parser CSV, al modulo mail, a `engine/catalog.mjs` e agli altri moduli condivisi della cartella `engine`. Il runtime usa le variabili integrate Supabase `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_DB_URL`. I dati di accesso restano nel runtime server.

Quando un visitatore lascia un’email (contatto, copertura o stima), la funzione invia un ringraziamento con Resend. La chiave si legge, in quest’ordine, dal Vault `stimaimmobile_resend` tramite `stimaimmobile.resend_api_key()` e, se assente, dalla variabile d’ambiente della funzione `RESEND_API_KEY`. In un progetto Supabase condiviso non sostituire il segreto Edge Function `RESEND_API_KEY` delle altre applicazioni: aggiornare solo il Vault di StimaImmobile. Il valore non va nel repository, nel client o nelle Pages. Mittente: `StimaImmobile.it <noreply@sonyc.it>` (dominio Resend verificato). Se la chiave manca, la richiesta viene comunque salvata.

Per verificare il servizio, la richiesta `GET /functions/v1/stimaimmobile-api/zones` restituisce i comuni coperti. `GET /zones?comune=Brescia` elenca zona e destinazione. Un elenco vuoto è previsto fino al primo listino. `GET /functions/v1/stimaimmobile-api/admin/contacts` richiede l’accesso amministrativo. Stato e note delle richieste si aggiornano con `POST /functions/v1/stimaimmobile-api/admin/contact`.
