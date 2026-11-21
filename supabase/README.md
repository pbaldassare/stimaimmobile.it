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

Salva in UTF-8. Sono ammessi il punto e virgola e la virgola come delimitatori. Con valori decimali separati da virgola, usa il punto e virgola come delimitatore oppure racchiudi il numero tra virgolette. Carica dal pannello un file fino a 1 MiB e controlla le prime 30 righe in anteprima. L’intero file deve superare i controlli per la pubblicazione. L’API accetta fino a 10.000 quotazioni e 4 MiB di richiesta JSON, restituendo fino a 100 righe di anteprima.

Ogni pubblicazione sostituisce l’intero listino in una transazione. Prepara un file completo anche per gli aggiornamenti. Ogni relazione emessa conserva quotazione, fonte, data e risultati utilizzati. Una zona diventa visibile nel sito dopo la pubblicazione.

## Distribuzione

La migrazione versionata in `supabase/migrations` è già applicata al progetto indicato. Per la funzione, distribuire l’entrypoint dichiarato in `supabase/config.toml` insieme al parser CSV e ai moduli condivisi della cartella `engine`. Il runtime usa le variabili integrate Supabase `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_DB_URL`. I dati di accesso restano nel runtime server.

Per verificare il servizio, la richiesta `GET /functions/v1/stimaimmobile-api/zones` restituisce le combinazioni pubblicate. Un elenco vuoto è previsto fino al primo listino. `GET /functions/v1/stimaimmobile-api/admin/contacts` richiede l’accesso amministrativo. Le richieste di contatto si consultano nell’area amministrativa.
