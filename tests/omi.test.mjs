import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OMI_FONTE, parseCsv, parseOmiNumber, parseOmiZones, parseOmiQuotes, cleanZoneDescr,
  semesterFromName, semesterEndDate, latestSemester, midpointEuro, mapQuotesToRates, mergeRates
} from '../engine/omi.mjs';

const zoneCsv = `Area_territoriale,Regione,Prov,Comune_ISTAT,Comune_cat,Sez,Comune_amm,Comune_descrizione,Fascia,Zona_Descr,Zona,LinkZona,Cod_tip_prev,Descr_tip_prev,Stato_prev,Microzona
NORD-OVEST,LOMBARDIA,BS,3017178,C3BS, ,B157,BRESCIA,B,'CENTRO STORICO',B1,BS00000001,20,Abitazioni civili,N,0
NORD-OVEST,LOMBARDIA,BS,3017178,C3BS, ,B157,BRESCIA,D,"'PERIFERIA, QUARTIERE'",D1,BS00000002,20,Abitazioni civili,N,0
`;
const quoteCsv = `Area_territoriale,Regione,Prov,Comune_ISTAT,Comune_cat,Sez,Comune_amm,Comune_descrizione,Fascia,Zona,LinkZona,Cod_Tip,Descr_Tipologia,Stato,Stato_prev,Compr_min,Compr_max,Sup_NL_compr,Loc_min,Loc_max,Sup_NL_loc
NORD-OVEST,LOMBARDIA,BS,3017178,C3BS, ,B157,BRESCIA,B,B1,BS00000001,20,Abitazioni civili,NORMALE,P,2000,2400,L,7,"8,5",L
NORD-OVEST,LOMBARDIA,BS,3017178,C3BS, ,B157,BRESCIA,B,B1,BS00000001,20,Abitazioni civili,OTTIMO,,2600,3000,L,9,11,L
NORD-OVEST,LOMBARDIA,BS,3017178,C3BS, ,B157,BRESCIA,B,B1,BS00000001,6,Uffici,NORMALE,P,1450,1750,L,6,8,L
NORD-OVEST,LOMBARDIA,BS,3017178,C3BS, ,B157,BRESCIA,D,D1,BS00000002,20,Abitazioni civili,NORMALE,P,0,0,L,0,0,L
`;

test('parses ondata UTF-8 CSV with quoted Italian decimals and zone apostrophes', () => {
  assert.equal(semesterFromName('QI_294577_1_20182_VALORI_utf8.csv'), '2018-2');
  assert.equal(semesterEndDate('2018-2'), '2018-12-31');
  assert.equal(semesterEndDate('2016-1'), '2016-06-30');
  assert.equal(parseOmiNumber('8,5'), 8.5);
  assert.equal(parseOmiNumber('8.5'), 8.5);
  assert.equal(parseOmiNumber('2400'), 2400);
  assert.equal(cleanZoneDescr("'CENTRO STORICO'"), 'CENTRO STORICO');
  const zones = parseOmiZones(zoneCsv, 'QI_294577_1_20182_ZONE_utf8.csv');
  assert.equal(zones.length, 2);
  assert.equal(zones[0].zona_descr, 'CENTRO STORICO');
  assert.equal(zones[1].zona_descr, 'PERIFERIA, QUARTIERE');
  const quotes = parseOmiQuotes(quoteCsv, 'QI_294577_1_20182_VALORI_utf8.csv');
  assert.equal(quotes.length, 4);
  assert.equal(quotes[0].loc_max, 8.5);
  assert.equal(quotes[0].stato_prevalente, true);
  assert.equal(quotes[1].stato_prevalente, false);
});

test('listino uses official min/max midpoint and keeps the Brescia Excel row', () => {
  assert.equal(midpointEuro(2000, 2400), 2200);
  assert.equal(midpointEuro(1450, 1750), 1600);
  const zones = parseOmiZones(zoneCsv, 'QI_294577_1_20182_ZONE_utf8.csv');
  const quotes = parseOmiQuotes(quoteCsv, 'QI_294577_1_20182_VALORI_utf8.csv');
  const rates = mapQuotesToRates(quotes, zones);
  assert.equal(latestSemester(quotes.map(row => row.semester)), '2018-2');
  assert.equal(rates.length, 2);
  const homes = rates.find(row => row.destinazione === 'Abitazioni civili');
  const offices = rates.find(row => row.destinazione === 'Uffici');
  assert.equal(homes.zona, 'CENTRO STORICO');
  assert.equal(homes.euro_mq, 2200);
  assert.equal(homes.fonte, OMI_FONTE);
  assert.equal(homes.data_riferimento, '2018-12-31');
  assert.equal(offices.euro_mq, 1600);
  const excel = {
    comune: 'Brescia', zona: 'Centro storico', destinazione: 'Direzionale',
    euro_mq: 1450, fonte: 'esempio Excel CALCOLI B80', data_riferimento: '2014-04-04'
  };
  const merged = mergeRates([excel], rates);
  assert.equal(merged.length, 3);
  assert.equal(merged.find(row => row.destinazione === 'Direzionale').euro_mq, 1450);
  assert.equal(merged.find(row => row.destinazione === 'Direzionale').fonte, 'esempio Excel CALCOLI B80');
});

test('CSV parser keeps commas inside quoted OMI fields', () => {
  const rows = parseCsv('a,b\n"1,2",x');
  assert.deepEqual(rows[1], ['1,2', 'x']);
});
