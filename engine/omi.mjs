export const OMI_FONTE = 'Agenzia delle Entrate – OMI';
export const OMI_LICENSE = 'CC-BY 4.0';
export const OMI_OFFICIAL =
  'https://www.agenziaentrate.gov.it/portale/schede/fabbricatiterreni/omi/forniture-dati-omi';
export const OMI_REDISTRIBUTOR =
  'https://github.com/ondata/quotazioni-immobiliari-agenzia-entrate';
export const OMI_ATTRIBUTION =
  '«Agenzia delle Entrate – OMI» (' + OMI_LICENSE + ')';
export const OMI_BASE =
  'https://raw.githubusercontent.com/ondata/quotazioni-immobiliari-agenzia-entrate/master/data/';
export const OMI_FILES = [
  'QI_294586_1_20161_ZONE_utf8.csv',
  'QI_294586_1_20161_VALORI_utf8.csv',
  'QI_294583_1_20162_ZONE_utf8.csv',
  'QI_294583_1_20162_VALORI_utf8.csv',
  'QI_294582_1_20171_ZONE_utf8.csv',
  'QI_294582_1_20171_VALORI_utf8.csv',
  'QI_294581_1_20172_ZONE_utf8.csv',
  'QI_294581_1_20172_VALORI_utf8.csv',
  'QI_294585_1_20181_ZONE_utf8.csv',
  'QI_294585_1_20181_VALORI_utf8.csv',
  'QI_294577_1_20182_ZONE_utf8.csv',
  'QI_294577_1_20182_VALORI_utf8.csv'
];

const ZONE_FIELDS = [
  'Area_territoriale', 'Regione', 'Prov', 'Comune_ISTAT', 'Comune_cat', 'Sez',
  'Comune_amm', 'Comune_descrizione', 'Fascia', 'Zona_Descr', 'Zona', 'LinkZona',
  'Cod_tip_prev', 'Descr_tip_prev', 'Stato_prev', 'Microzona', 'file'
];
const QUOTE_FIELDS = [
  'Area_territoriale', 'Regione', 'Prov', 'Comune_ISTAT', 'Comune_cat', 'Sez',
  'Comune_amm', 'Comune_descrizione', 'Fascia', 'Zona', 'LinkZona', 'Cod_Tip',
  'Descr_Tipologia', 'Stato', 'Stato_prev', 'Compr_min', 'Compr_max', 'Sup_NL_compr',
  'Loc_min', 'Loc_max', 'Sup_NL_loc', 'file'
];

export function parseCsv(csv) {
  const text = String(csv ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const headerLine = text.split('\n', 1)[0] || '';
  const delimiter = headerLine.includes(';') && !headerLine.startsWith('Area_territoriale,') ? ';' : ',';
  const lines = [];
  let row = [], value = '', quoted = false, closed = false;
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === undefined) throw Error('Virgolette non chiuse nel CSV OMI.');
      if (c !== '"') value += c;
      else if (text[i + 1] === '"') { value += '"'; i++; }
      else { quoted = false; closed = true; }
      continue;
    }
    if (c === undefined || c === '\n' || c === delimiter) {
      row.push(value.trim().normalize('NFC'));
      value = '';
      closed = false;
      if (c !== delimiter) {
        if (row.some(Boolean)) lines.push(row);
        row = [];
      }
    } else if (closed || (c === '"' && value)) throw Error('Virgolette non valide nel CSV OMI.');
    else if (c === '"') quoted = true;
    else value += c;
  }
  return lines;
}

export function semesterFromName(name) {
  const match = String(name ?? '').match(/_(\d{4})([12])_(ZONE|VALORI)/i);
  if (!match) throw Error('Semestre OMI non riconosciuto in ' + name);
  return match[1] + '-' + match[2];
}

export function semesterEndDate(semester) {
  const [year, half] = String(semester).split('-');
  if (!/^\d{4}$/.test(year) || (half !== '1' && half !== '2')) {
    throw Error('Semestre OMI non valido: ' + semester);
  }
  return half === '1' ? year + '-06-30' : year + '-12-31';
}

export function compareSemesters(a, b) {
  const pa = String(a).split('-').map(Number);
  const pb = String(b).split('-').map(Number);
  return pa[0] - pb[0] || pa[1] - pb[1];
}

export function latestSemester(values) {
  return [...new Set(values.filter(Boolean))].sort(compareSemesters).at(-1);
}

export function cleanZoneDescr(value) {
  let text = String(value ?? '').trim().normalize('NFC');
  if ((text.startsWith("'") && text.endsWith("'") && text.length >= 2) ||
      (text.startsWith('"') && text.endsWith('"') && text.length >= 2)) {
    text = text.slice(1, -1).trim();
  }
  return text.replace(/^'+|'+$/g, '').trim();
}

export function clip(value, max = 150) {
  const text = String(value ?? '').trim().normalize('NFC');
  return text.length <= max ? text : text.slice(0, max);
}

export function parseOmiNumber(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (/^-?\d+$/.test(text)) return Number(text);
  if (/^-?\d+\.\d+$/.test(text)) return Number(text);
  if (/^-?\d+,\d+$/.test(text)) return Number(text.replace(',', '.'));
  return null;
}

function rowObject(header, line, fields) {
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  const row = {};
  for (const field of fields) row[field] = line[index[field]] ?? '';
  return row;
}

function requireHeader(header, fields) {
  const needed = fields.filter(name => name !== 'file');
  if (!needed.every(name => header.includes(name))) {
    throw Error('Intestazione OMI incompleta. Attese: ' + needed.join(', '));
  }
}

export function parseOmiZones(csv, filename) {
  const lines = parseCsv(csv);
  const header = lines.shift() ?? [];
  requireHeader(header, ZONE_FIELDS);
  const fallback = filename ? semesterFromName(filename) : '';
  const rows = [];
  for (const line of lines) {
    const raw = rowObject(header, line, ZONE_FIELDS);
    const semester = raw.file ? semesterFromName(raw.file) : fallback;
    const comune = clip(raw.Comune_descrizione);
    const zona = clip(raw.Zona);
    if (!semester || !comune || !zona) continue;
    rows.push({
      semester,
      area_territoriale: clip(raw.Area_territoriale),
      regione: clip(raw.Regione),
      provincia: clip(raw.Prov, 8),
      comune_istat: clip(raw.Comune_ISTAT, 20),
      comune_cat: clip(raw.Comune_cat, 20),
      sez: clip(raw.Sez, 8),
      comune_amm: clip(raw.Comune_amm, 20),
      comune,
      fascia: clip(raw.Fascia, 8),
      zona,
      zona_descr: clip(cleanZoneDescr(raw.Zona_Descr), 300),
      link_zona: clip(raw.LinkZona, 40) || [semester, comune, zona].join(':'),
      cod_tip_prev: clip(raw.Cod_tip_prev, 12),
      descr_tip_prev: clip(raw.Descr_tip_prev),
      stato_prev: clip(raw.Stato_prev, 8),
      microzona: clip(raw.Microzona, 12),
      source_file: clip(raw.file || filename || '', 120)
    });
  }
  return rows;
}

export function parseOmiQuotes(csv, filename) {
  const lines = parseCsv(csv);
  const header = lines.shift() ?? [];
  requireHeader(header, QUOTE_FIELDS);
  const fallback = filename ? semesterFromName(filename) : '';
  const rows = [];
  for (const line of lines) {
    const raw = rowObject(header, line, QUOTE_FIELDS);
    const semester = raw.file ? semesterFromName(raw.file) : fallback;
    const comune = clip(raw.Comune_descrizione);
    const zona = clip(raw.Zona);
    const tipologia = clip(raw.Descr_Tipologia);
    if (!semester || !comune || !zona || !tipologia) continue;
    rows.push({
      semester,
      comune,
      provincia: clip(raw.Prov, 8),
      regione: clip(raw.Regione),
      fascia: clip(raw.Fascia, 8),
      zona,
      link_zona: clip(raw.LinkZona, 40) || [semester, comune, zona].join(':'),
      tipologia_cod: clip(raw.Cod_Tip, 12),
      tipologia,
      stato: clip(raw.Stato, 40),
      stato_prevalente: String(raw.Stato_prev).trim().toUpperCase() === 'P',
      compr_min: parseOmiNumber(raw.Compr_min),
      compr_max: parseOmiNumber(raw.Compr_max),
      sup_nl_compr: clip(raw.Sup_NL_compr, 8),
      loc_min: parseOmiNumber(raw.Loc_min),
      loc_max: parseOmiNumber(raw.Loc_max),
      sup_nl_loc: clip(raw.Sup_NL_loc, 8),
      source_file: clip(raw.file || filename || '', 120)
    });
  }
  return rows;
}

export function midpointEuro(min, max) {
  const values = [min, max].filter(value => Number.isFinite(value) && value > 0);
  if (!values.length) return null;
  if (values.length === 1) return Math.round(values[0] * 100) / 100;
  return Math.round((values[0] + values[1]) * 50) / 100;
}

function folded(value) {
  return String(value ?? '').trim().normalize('NFC').toLocaleLowerCase('it');
}

function rankQuote(quote) {
  if (quote.stato_prevalente) return 0;
  if (folded(quote.stato) === 'normale') return 1;
  return 2;
}

export function zoneLabel(zone, quote) {
  const descr = zone?.zona_descr || '';
  return clip(descr || quote.zona || '', 150);
}

export function mapQuotesToRates(quotes, zones, semester) {
  const chosen = semester || latestSemester(quotes.map(row => row.semester));
  if (!chosen) return [];
  const zoneByLink = new Map();
  for (const zone of zones) {
    if (zone.semester !== chosen) continue;
    zoneByLink.set(zone.link_zona, zone);
  }
  const best = new Map();
  for (const quote of quotes) {
    if (quote.semester !== chosen) continue;
    const euro = midpointEuro(quote.compr_min, quote.compr_max);
    if (euro == null) continue;
    const zone = zoneByLink.get(quote.link_zona);
    const comune = clip(quote.comune);
    const zona = zoneLabel(zone, quote);
    const destinazione = clip(quote.tipologia);
    if (!comune || !zona || !destinazione) continue;
    const key = JSON.stringify([folded(comune), folded(zona), folded(destinazione)]);
    const row = {
      comune,
      zona,
      destinazione,
      euro_mq: euro,
      fonte: OMI_FONTE,
      data_riferimento: semesterEndDate(chosen),
      rank: rankQuote(quote)
    };
    const previous = best.get(key);
    if (!previous || row.rank < previous.rank) best.set(key, row);
  }
  return [...best.values()].map(({ rank: _rank, ...row }) => row);
}

export function mergeRates(existing, incoming) {
  const kept = new Map();
  for (const row of existing) {
    kept.set(JSON.stringify([folded(row.comune), folded(row.zona), folded(row.destinazione)]), row);
  }
  for (const row of incoming) {
    const key = JSON.stringify([folded(row.comune), folded(row.zona), folded(row.destinazione)]);
    if (!kept.has(key)) kept.set(key, row);
  }
  return [...kept.values()];
}

export function quoteTuple(row) {
  return [
    row.semester, row.comune, row.provincia, row.regione, row.fascia, row.zona,
    row.link_zona, row.tipologia_cod, row.tipologia, row.stato, row.stato_prevalente,
    row.compr_min, row.compr_max, row.sup_nl_compr, row.loc_min, row.loc_max,
    row.sup_nl_loc, row.source_file
  ];
}

export function zoneTuple(row) {
  return [
    row.semester, row.area_territoriale, row.regione, row.provincia, row.comune_istat,
    row.comune_cat, row.sez, row.comune_amm, row.comune, row.fascia, row.zona,
    row.zona_descr, row.link_zona, row.cod_tip_prev, row.descr_tip_prev, row.stato_prev,
    row.microzona, row.source_file
  ];
}
