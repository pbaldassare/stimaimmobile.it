# StimaImmobile.it

Applicazione italiana per stimare immobili a partire da un listino territoriale e dai correttivi del foglio di valutazione. Il sito statico chiama la funzione Supabase `stimaimmobile-api`. Il browser riceve i campi del questionario e il risultato. Il server sceglie il prezzo dal listino, calcola gli importi e conserva i dati necessari per riprodurre il PDF.

## Avvio locale

Con Node.js 22 o successivo, eseguire `npm test`, `npm run build` e `npm run dev`. Aprire `http://127.0.0.1:4186`. Anche in anteprima, le chiamate dal browser usano la funzione Supabase del progetto configurato in `api-client.js`. Usare dati sintetici per le verifiche.

## Primo listino

1. Abilitare l’operatore seguendo le istruzioni nella directory `supabase`.
2. Aprire l’**Area riservata** dal sito e accedere. Scaricare il modello CSV, oppure usare `data/listino-esempio-excel.csv` (Brescia · Centro storico · Direzionale a 1450 €/m², fonte «esempio Excel CALCOLI B80», data 2014-04-04). Il refuso Excel «Cenro storico» è accettato come alias.
3. Inserire una riga per combinazione di comune, zona e destinazione d’uso. Indicare un prezzo positivo in euro al metro quadro, la fonte e la data di riferimento in formato `AAAA-MM-GG`.
4. Verificare l’anteprima e scegliere **Pubblica e sostituisci il listino**, oppure da un account abilitato eseguire `npm run publish:listino`. Un CSV dell’operatore non cancella le quotazioni OMI, salvo chiavi identiche. Le relazioni già emesse utilizzano la propria copia dei dati.

## Quotazioni OMI

Il listino nazionale deriva dalle quotazioni semestrali dell’Osservatorio del Mercato Immobiliare. Fonte da citare: **«Agenzia delle Entrate – OMI»** (licenza [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/)). I CSV nel repository GitHub [ondata/quotazioni-immobiliari-agenzia-entrate](https://github.com/ondata/quotazioni-immobiliari-agenzia-entrate) (`data/`, file UTF-8 rielaborati) sono un redistributore di comodo: il download ufficiale resta [Forniture OMI](https://www.agenziaentrate.gov.it/portale/schede/fabbricatiterreni/omi/forniture-dati-omi). Il repository non contiene i CSV grezzi; `npm run import:omi -- --dir data/omi --batch-dir /tmp/omi-batches` li scarica e li carica in `stimaimmobile.omi_zones` e `omi_quotes`. Il semestre più recente alimenta `stimaimmobile.rates` con il punto medio dell’intervallo min/max di compravendita, senza cancellare l’esempio Excel di Brescia. Le quotazioni OMI sono indicazioni di larga massima, non una perizia.

Nel pannello amministrativo si consultano e si aggiornano le richieste (stime con recapiti, contatti, copertura mancante). Stato: nuova, contattata, chiusa, con note interne. Chi lascia un’email riceve una conferma automatica. Per scaricare il PDF di una stima basta il suo link personale.

## Modello

Il calcolo centrale equivale a superficie commerciale × €/m² × (1 + somma dei correttivi / 100). La base €/m² è la quotazione OMI della zona pubblicata in `stimaimmobile.rates` (punto medio min/max del semestre più recente, fonte «Agenzia delle Entrate – OMI»), con l’esempio Excel di Brescia conservato se la chiave non coincide. Il minimo indicativo è il 90% del valore centrale, calcolato prima dell’arrotondamento in euro. Il massimo scritto a mano nell’esempio Excel è escluso.

I campi del questionario, il tipo di controllo, le opzioni e i coefficienti vivono in Postgres (`stimaimmobile.valuation_fields` e `valuation_options`) e si modificano dall’area riservata, senza un nuovo deploy. Il seme iniziale copia le mappe Excel di `engine/model.mjs`. Il questionario pubblico è a tendina, sì/no o conteggio 0–N: niente testo libero sui correttivi. La versione del motore è `omi-xls-2.0.0`. I test conservano i contributi numerici dell’esempio senza dati personali, con tre correttivi riparati rispetto al foglio: porta d’ingresso «va bene così» +1 (non +6), pavimenti «nessuno» +1 (non testo ignorato da SUM), rumore «intenso» −1.9 (non testo ignorato da SUM).

Il file conserva soltanto i risultati di esempio per piano rialzato e anno 1900 nelle celle E14 ed E20 di CALCOLI. Per altri valori dichiarati, il sito identifica la stima come parziale e riporta nel risultato e nel PDF i correttivi mancanti. Le pagine `/faq/` e `/blog/` spiegano listino, correttivi e limiti della stima indicativa.

## Consegna

`npm run build` copia in `dist` soltanto file pubblici. Le migrazioni e il backend si trovano in `supabase`, le formule e il generatore PDF in `engine`. Lo schema PostgreSQL dedicato si chiama `stimaimmobile`. Il repository non contiene il foglio Excel originale o le credenziali di accesso.

