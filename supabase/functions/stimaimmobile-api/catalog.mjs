const fields = ["comune","zona","destinazione","euro_mq","fonte","data_riferimento"];

function parseCsv(csv) {
  const text = csv.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const delimiter = text.split("\n", 1)[0].includes(";") ? ";" : ",";
  const lines = [];
  let row = [], value = "", quoted = false, closed = false;
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === undefined) throw Error("Virgolette non chiuse nel CSV.");
      if (c !== '"') value += c;
      else if (text[i + 1] === '"') { value += '"'; i++; }
      else { quoted = false; closed = true; }
      continue;
    }
    if (c === undefined || c === "\n" || c === delimiter) {
      row.push(value.trim().normalize("NFC"));
      value = ""; closed = false;
      if (c !== delimiter) {
        if (row.some(Boolean)) lines.push(row);
        if (lines.length > 10001) throw Error("Ogni listino può contenere fino a 10.000 quotazioni.");
        row = [];
      }
    } else if (closed || (c === '"' && value)) throw Error("Virgolette non valide nel CSV.");
    else if (c === '"') quoted = true;
    else value += c;
  }
  return lines;
}

export function previewCatalog(csv) {
  const errors = [], rows = [], seen = new Set();
  if (typeof csv !== "string" || !csv.trim()) return {rows, errors:["Seleziona un file CSV."], total:0};
  let lines;
  try { lines = parseCsv(csv); } catch (err) { return {rows, errors:[err.message], total:0}; }
  const header = lines.shift() ?? [];
  if (header.length !== fields.length || !fields.every(f => header.includes(f))) {
    return {rows, errors:["Intestazione richiesta: " + fields.join(";")], total:lines.length};
  }
  for (const [index,line] of lines.entries()) {
    const row = Object.fromEntries(fields.map(f => [f, line[header.indexOf(f)] || ""]));
    const messages = [];
    if (line.length !== fields.length) messages.push("numero di colonne errato");
    if (["comune","zona","destinazione","fonte"].some(k => !row[k] || row[k].length > (k === "fonte" ? 300 : 150))) messages.push("comune, zona, destinazione e fonte sono obbligatori e devono rispettare la lunghezza massima");
    const validPrice = /^\d{1,10}([.,]\d{1,2})?$/.test(row.euro_mq);
    row.euro_mq = Number(row.euro_mq.replace(",", "."));
    if (!validPrice || row.euro_mq <= 0) messages.push("€/m² deve essere positivo, con un massimo di due decimali");
    const date = new Date(row.data_riferimento + "T00:00:00Z");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.data_riferimento) || row.data_riferimento.startsWith("0000") || !Number.isFinite(+date) || date.toISOString().slice(0,10) !== row.data_riferimento) messages.push("data non valida, usare AAAA-MM-GG");
    const key = JSON.stringify([row.comune,row.zona,row.destinazione].map(v => v.toLocaleLowerCase("it-IT")));
    if (seen.has(key)) messages.push("combinazione comune, zona e destinazione duplicata");
    seen.add(key);
    if (messages.length) {
      if (errors.length < 100) errors.push(`Riga dati ${index+1}: ${messages.join(", ")}.`);
    } else rows.push(row);
  }
  if (!lines.length) errors.push("Aggiungi almeno una quotazione.");
  return {rows, errors, total:lines.length};
}
