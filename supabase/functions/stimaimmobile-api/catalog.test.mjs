import test from "node:test";
import assert from "node:assert/strict";
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
