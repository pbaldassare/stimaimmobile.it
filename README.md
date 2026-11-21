# StimaImmobile.it

Applicazione italiana per stimare immobili a partire da un listino territoriale e dai correttivi del foglio di valutazione. Il sito statico chiama la funzione Supabase `stimaimmobile-api`. Il browser riceve i campi del questionario e il risultato. Il server sceglie il prezzo dal listino, calcola gli importi e conserva i dati necessari per riprodurre il PDF.

## Avvio locale

Con Node.js 22 o successivo, eseguire `npm test`, `npm run build` e `npm run dev`. Aprire `http://127.0.0.1:4186`. Anche in anteprima, le chiamate dal browser usano la funzione Supabase del progetto configurato in `api-client.js`. Usare dati sintetici per le verifiche.

## Primo listino

1. Abilitare l’operatore seguendo le istruzioni nella directory `supabase`.
2. Aprire l’**Area riservata** dal sito e accedere. Scaricare il modello CSV.
3. Inserire una riga per combinazione di comune, zona e destinazione d’uso. Indicare un prezzo positivo in euro al metro quadro, la fonte e la data di riferimento in formato `AAAA-MM-GG`.
4. Verificare l’anteprima e scegliere **Pubblica e sostituisci il listino**. Le zone acquistano copertura alla pubblicazione. Le relazioni già emesse utilizzano la propria copia dei dati.

Nel pannello amministrativo sono consultabili anche le richieste manuali. Un visitatore può chiedere un contatto in assenza di copertura. Per scaricare il PDF di una stima basta il suo link personale.

## Modello

Il calcolo centrale equivale a superficie commerciale × €/m² × (1 + somma dei correttivi / 100). Il minimo indicativo è il 90% del valore centrale, calcolato prima dell’arrotondamento in euro. Il massimo scritto a mano nell’esempio Excel è escluso. I test conservano i contributi numerici dell’esempio senza dati personali, con tre correttivi riparati rispetto al foglio: porta d’ingresso «va bene così» +1 (non +6), pavimenti «nessuno» +1 (non testo ignorato da SUM), rumore «intenso» −1.9 (non testo ignorato da SUM).

Il file conserva soltanto i risultati di esempio per piano rialzato e anno 1900 nelle celle E14 ed E20 di CALCOLI. Per altri valori dichiarati, il sito identifica la stima come parziale e riporta nel risultato e nel PDF i correttivi mancanti. Le pagine `/faq/` e `/blog/` spiegano listino, correttivi e limiti della stima indicativa.

## Consegna

`npm run build` copia in `dist` soltanto file pubblici. Le migrazioni e il backend si trovano in `supabase`, le formule e il generatore PDF in `engine`. Lo schema PostgreSQL dedicato si chiama `stimaimmobile`. Il repository non contiene il foglio Excel originale o le credenziali di accesso.

