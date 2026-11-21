import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {previewCatalog} from "./catalog.mjs";
const header = "comune;zona;destinazione;euro_mq;fonte;data_riferimento\n";
test("legge Excel italiano, BOM, decimali, separatori nei campi", () => {
  const parsed = previewCatalog("\ufeff"+header+'Comune;Zona;Abitazione;1500,25;"Fonte; ""prova""";2024-02-29');
  assert.deepEqual(parsed.errors, []); assert.equal(parsed.rows[0].euro_mq, 1500.25);
  assert.equal(parsed.rows[0].fonte, 'Fonte; "prova"');
});
test("rifiuta date, duplicati, quotazioni non positive e intestazioni vuote", () => {
  const read=previewCatalog(header+"Comune;Zona;Casa;2;Fonte;2024-02-29\nCOMUNE;Zona;Casa;0;Fonte;2023-02-29");
  assert.equal(read.total,2); assert.match(read.errors.join(" "),/duplicata/);
  assert.match(read.errors.join(" "),/data non valida/); assert.match(read.errors.join(" "),/positivo/);
  assert.equal(previewCatalog(header).errors.length,1);
});
test("il listino di esempio Excel copre Brescia Centro storico Direzionale", () => {
  const csv = readFileSync(fileURLToPath(new URL("../../../data/listino-esempio-excel.csv", import.meta.url)), "utf8");
  const parsed = previewCatalog(csv);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.total, 1);
  assert.equal(parsed.rows[0].comune, "Brescia");
  assert.equal(parsed.rows[0].zona, "Centro storico");
  assert.equal(parsed.rows[0].destinazione, "Direzionale");
  assert.equal(parsed.rows[0].euro_mq, 1450);
  assert.equal(parsed.rows[0].fonte, "esempio Excel CALCOLI B80");
  assert.equal(parsed.rows[0].data_riferimento, "2014-04-04");
});
