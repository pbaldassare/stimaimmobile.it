import { questions as seedQuestions } from './valuation.mjs';

const euros = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
const number = n => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(n);
const pct = n => (n > 0 ? '+' : '') + number(n) + '%';
const ink = '0.07 0.15 0.20', teal = '0.018 0.37 0.33', muted = '0.27 0.34 0.36';
const latinExtras = { '€': 128, '–': 150, '—': 151, '’': 146, '‘': 145, '“': 147, '”': 148, '…': 133, 'œ': 156, 'Œ': 140 };

function literal(text) {
  let result = '';
  for (const ch of String(text).normalize('NFC')) {
    let byte = latinExtras[ch] ?? ch.codePointAt(0);
    if (byte < 32 || byte > 255) byte = 63;
    if (byte >= 127) result += '\\' + byte.toString(8).padStart(3, '0');
    else if ('()\\'.includes(ch)) result += '\\' + ch;
    else result += ch;
  }
  return '(' + result + ')';
}

function wrap(text, chars) {
  const lines = [];
  let line = '';
  for (const word of String(text).trim().split(/\s+/u)) {
    if (line && line.length + word.length + 1 > chars) {
      lines.push(line);
      line = '';
    }
    if (word.length > chars) {
      let start = 0;
      while (word.length - start > chars) {
        lines.push(word.slice(start, start + chars));
        start += chars;
      }
      line = word.slice(start);
    } else line += (line ? ' ' : '') + word;
  }
  if (line) lines.push(line);
  return lines;
}

function date(value, timestamp = false) {
  if (!value) return 'Non specificata';
  const d = new Date(value);
  if (Number.isNaN(d.valueOf())) return 'Non specificata';
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'long', timeZone: timestamp ? 'Europe/Rome' : 'UTC' }).format(d);
}

// Minimal PDF 1.4 writer with built-in Latin fonts. All streams are encoded to ASCII
// before recording offsets so PDF cross-reference positions stay byte accurate.
function documentBytes(pages) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count ' + pages.length + ' /Kids [' + pages.map((_, i) => (5 + 2 * i) + ' 0 R').join(' ') + '] >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  pages.forEach((page, i) => {
    const stream = page.join('\n') + '\n';
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + (6 + 2 * i) + ' 0 R >>');
    objects.push('<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream');
  });
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [i, object] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += (i + 1) + ' 0 obj\n' + object + '\nendobj\n';
  }
  const start = pdf.length;
  pdf += 'xref\n0 ' + offsets.length + '\n0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) pdf += String(offset).padStart(10, '0') + ' 00000 n \n';
  pdf += 'trailer\n<< /Size ' + offsets.length + ' /Root 1 0 R >>\nstartxref\n' + start + '\n%%EOF\n';
  return new TextEncoder().encode(pdf);
}

export function makePdf(snapshot) {
  const result = snapshot.result ?? snapshot;
  const pages = [];
  let page, y;
  function print(text, x, position, size = 11, font = 'F1', color = ink) {
    page.push('BT /' + font + ' ' + size + ' Tf ' + color + ' rg 1 0 0 1 ' + x + ' ' + position + ' Tm ' + literal(text) + ' Tj ET');
  }
  function rule(position) {
    page.push('0.82 0.87 0.86 RG 0.6 w 48 ' + position + ' m 547 ' + position + ' l S');
  }
  function newPage() {
    page = [];
    pages.push(page);
    print('StimaImmobile.it', 48, 788, 17, 'F2', teal);
    print('RELAZIONE DI VALUTAZIONE', 398, 791, 9, 'F2', muted);
    rule(772);
    y = 737;
  }
  function ensure(space) {
    if (y - space < 57) newPage();
  }
  function heading(text) {
    ensure(66);
    print(text, 48, y, 16, 'F2');
    y -= 23;
  }
  function paragraph(text, color = ink) {
    const lines = wrap(text, 75);
    for (const line of lines) {
      ensure(17);
      print(line, 48, y, 11, 'F1', color);
      y -= 16;
    }
    y -= 5;
  }
  function row(label, value) {
    const labels = wrap(label, 31);
    const values = wrap(value, 39);
    const height = Math.max(labels.length, values.length) * 15 + 9;
    ensure(height);
    labels.forEach((line, i) => print(line, 48, y - i * 15, 10, 'F1', muted));
    values.forEach((line, i) => print(line, 263, y - i * 15, 11));
    y -= height;
    rule(y + 11);
  }

  newPage();
  print(result.warnings?.length ? 'Stima indicativa parziale' : 'Stima del valore immobiliare', 48, y, 26, 'F2');
  y -= 32;
  paragraph([snapshot.comune, snapshot.zona, snapshot.destinazione].filter(Boolean).join(' · '), muted);
  page.push(teal + ' rg 48 ' + (y - 81) + ' 499 80 re f');
  print('VALORE STIMATO', 63, y - 24, 9, 'F2', '1 1 1');
  print(euros(result.value), 63, y - 59, 26, 'F2', '1 1 1');
  print('MINIMO INDICATIVO', 331, y - 24, 9, 'F2', '1 1 1');
  print(euros(result.minimum), 331, y - 56, 18, 'F2', '1 1 1');
  y -= 116;
  heading('Dati della valutazione');
  row('Superficie commerciale', number(result.surface) + ' m²');
  const band = snapshot.rateMin != null && snapshot.rateMax != null && Number(snapshot.rateMin) !== Number(snapshot.rateMax);
  row('Quotazione di partenza', euros(result.rate) + '/m²' + (band ? ' (OMI ' + euros(snapshot.rateMin) + '–' + euros(snapshot.rateMax) + ')' : ''));
  row('Correzione complessiva', pct(result.correction ?? result.factors.reduce((sum, factor) => sum + factor.value, 0)));
  row('Fonte del listino', snapshot.fonte ?? snapshot.source ?? 'Non specificata');
  row('Data del listino', date(snapshot.data_riferimento ?? snapshot.referenceDate));
  row('Relazione emessa il', date(snapshot.createdAt, true));
  row('Versione del modello', snapshot.engineVersion ?? '');
  y -= 2;
  heading('Come si legge il risultato');
  paragraph('La stima applica alla superficie commerciale la quotazione della zona e i correttivi associati alle caratteristiche dichiarate. Il minimo indicativo corrisponde al 90% del valore centrale.');
  for (const warning of result.warnings ?? []) paragraph(warning);
  if (result.factors?.length) {
    y -= 8;
    heading('Principali correttivi');
    for (const factor of result.factors.slice(0, 5)) row(factor.label, pct(factor.value));
  }

  const inputs = snapshot.inputs ?? {};
  const applied = new Map((result.factors ?? []).map(item => [item.id, item.value]));
  const questions = snapshot.questions?.length ? snapshot.questions : seedQuestions;
  const groups = [...new Set(questions.map(q => q.group))];
  const answered = questions.filter(q => Object.hasOwn(inputs, q.id) || applied.has(q.id));
  if (answered.length) {
    if (y < 350) newPage();
    heading('Caratteristiche e correttivi');
    paragraph('Le percentuali accanto alle risposte indicano il contributo alla correzione complessiva. I valori mancanti sono indicati quando incidono sulla stima.');
    for (const group of groups) {
      const members = answered.filter(q => q.group === group);
      if (!members.length) continue;
      y -= 8;
      heading(group);
      for (const q of members) {
        const answer = inputs[q.id] ?? 'Non indicato';
        const points = applied.get(q.id);
        row(q.label, String(answer) + (points === undefined ? '' : '  (' + pct(points) + ')'));
      }
    }
  }
  pages.forEach((item, i) => {
    page = item;
    rule(42);
    print('StimaImmobile.it', 48, 24, 9, 'F1', muted);
    print((i + 1) + ' / ' + pages.length, 510, 24, 9, 'F1', muted);
  });
  return documentBytes(pages);
}
