export const CONTROL_TYPES = ['select', 'yesno', 'count', 'number'];
const ID_PATTERN = /^[a-z][A-Za-z0-9]{0,63}$/;

function asText(value, fallback = '') {
  return typeof value === 'string' ? value.trim().normalize('NFC') : fallback;
}

function asNumber(value, fallback = undefined) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(number) ? number : fallback;
}

function fail(message) {
  throw new RangeError(message);
}

export function publicQuestions(catalog) {
  return catalog.filter(field => field.active !== false).map(field => {
    const { scores, fallback, partial, aliases, active, ...question } = field;
    if (question.type === 'select' || question.type === 'yesno') {
      question.options = [...(field.options || Object.keys(scores || {}))];
    }
    if (question.type === 'count') {
      const min = Number.isInteger(field.min) ? field.min : 0;
      const max = Number.isInteger(field.max) ? field.max : 10;
      question.options = Array.from({ length: max - min + 1 }, (_, i) => String(min + i));
    }
    return question;
  });
}

export function validateCatalog(catalog) {
  if (!Array.isArray(catalog) || catalog.length < 1 || catalog.length > 200) {
    fail('Il modello deve contenere tra 1 e 200 campi.');
  }
  const ids = new Set();
  let surface = 0;
  for (const [index, field] of catalog.entries()) {
    if (!field || typeof field !== 'object' || Array.isArray(field)) fail('Campo non valido.');
    if (!ID_PATTERN.test(field.id || '')) fail(`Identificativo non valido per il campo ${index + 1}.`);
    if (ids.has(field.id)) fail('Identificativo duplicato: ' + field.id + '.');
    ids.add(field.id);
    if (!asText(field.label) || field.label.length > 180) fail('Etichetta non valida per ' + field.id + '.');
    if (!asText(field.group) || field.group.length > 80) fail('Gruppo non valido per ' + field.id + '.');
    if (!CONTROL_TYPES.includes(field.type)) fail('Tipo di controllo non valido per ' + field.id + '.');
    if (field.required && field.id === 'surface') surface += 1;
    if (field.id === 'surface') {
      if (field.type !== 'number' || !field.required) fail('La superficie commerciale deve essere un numero obbligatorio.');
    }
    if (field.fallback !== undefined && field.fallback !== null && !Number.isFinite(field.fallback)) {
      fail('Fallback non valido per ' + field.id + '.');
    }
    if (field.min !== undefined && field.min !== null && !Number.isFinite(field.min)) fail('Minimo non valido per ' + field.id + '.');
    if (field.max !== undefined && field.max !== null && !Number.isFinite(field.max)) fail('Massimo non valido per ' + field.id + '.');
    if (field.step !== undefined && field.step !== null && !(field.step > 0)) fail('Passo non valido per ' + field.id + '.');
    if (field.type === 'count') {
      const min = field.min ?? 0;
      const max = field.max ?? 10;
      if (!Number.isInteger(min) || !Number.isInteger(max) || max < min || max - min > 80) {
        fail('Intervallo 0–N non valido per ' + field.id + '.');
      }
    }
    const optionValues = field.options || [];
    if ((field.type === 'select' || field.type === 'yesno') && optionValues.length < 1) {
      fail('Aggiungi almeno un’opzione per ' + field.id + '.');
    }
    if (field.type === 'yesno' && optionValues.length !== 2) {
      fail('Un flag sì/no richiede due opzioni per ' + field.id + '.');
    }
    const seen = new Set();
    for (const value of optionValues) {
      const text = asText(value);
      if (!text || text.length > 180 || seen.has(text.toLocaleLowerCase('it'))) {
        fail('Opzione non valida in ' + field.id + '.');
      }
      seen.add(text.toLocaleLowerCase('it'));
    }
    for (const points of Object.values(field.scores || {})) {
      if (!Number.isFinite(points) || Math.abs(points) > 1000) fail('Coefficiente fuori intervallo in ' + field.id + '.');
    }
    if (field.when) {
      if (!field.when.id || !Array.isArray(field.when.values) || !field.when.values.length) {
        fail('Visibilità condizionale non valida per ' + field.id + '.');
      }
      if (field.when.id === field.id) fail('Un campo non può dipendere da se stesso (' + field.id + ').');
    }
  }
  if (!surface) fail('Manca il campo obbligatorio della superficie commerciale.');
  for (const field of catalog) {
    if (!field.when) continue;
    if (!ids.has(field.when.id)) fail('Il campo ' + field.id + ' dipende da un identificativo inesistente.');
  }
  const visiting = new Set();
  const visited = new Set();
  function walk(id) {
    if (visited.has(id)) return;
    if (visiting.has(id)) fail('Dipendenza ciclica tra i campi.');
    visiting.add(id);
    const field = catalog.find(item => item.id === id);
    if (field?.when) walk(field.when.id);
    visiting.delete(id);
    visited.add(id);
  }
  for (const field of catalog) walk(field.id);
  return catalog;
}

export function fromAdminFields(payload) {
  const list = Array.isArray(payload) ? payload : payload?.fields;
  if (!Array.isArray(list)) fail('Elenco dei campi mancante.');
  const catalog = list.map((raw, index) => {
    const type = asText(raw.type);
    const options = Array.isArray(raw.options) ? raw.options : [];
    const scores = {};
    const aliases = {};
    for (const option of options) {
      const value = asText(option?.value ?? option?.label);
      if (!value) fail('Opzione senza valore nel campo ' + (asText(raw.id) || (index + 1)) + '.');
      const coefficient = asNumber(option?.coefficient, 0);
      const scored = option?.scored !== false && option?.hasCoefficient !== false;
      if (scored) scores[value] = coefficient;
      for (const alias of Array.isArray(option?.aliases) ? option.aliases : []) {
        const aliasText = asText(alias);
        if (aliasText) aliases[aliasText] = value;
      }
    }
    const listed = options
      .filter(option => option?.public !== false)
      .map(option => asText(option?.value ?? option?.label))
      .filter(Boolean);
    const field = {
      id: asText(raw.id),
      label: asText(raw.label),
      group: asText(raw.group),
      type,
      required: Boolean(raw.required),
      active: raw.active !== false,
      partial: Boolean(raw.partial),
      options: type === 'count' || type === 'number' ? undefined : listed,
    };
    if (raw.min !== undefined && raw.min !== null && raw.min !== '') field.min = asNumber(raw.min);
    if (raw.max !== undefined && raw.max !== null && raw.max !== '') field.max = asNumber(raw.max);
    if (raw.step !== undefined && raw.step !== null && raw.step !== '') field.step = asNumber(raw.step);
    if (raw.fallback !== undefined && raw.fallback !== null && raw.fallback !== '') field.fallback = asNumber(raw.fallback);
    if (Object.keys(scores).length) field.scores = scores;
    if (Object.keys(aliases).length) field.aliases = aliases;
    const whenId = asText(raw.when?.id ?? raw.whenFieldId);
    const whenValues = Array.isArray(raw.when?.values) ? raw.when.values.map(asText).filter(Boolean)
      : Array.isArray(raw.whenValues) ? raw.whenValues.map(asText).filter(Boolean) : [];
    if (whenId && whenValues.length) field.when = { id: whenId, values: whenValues };
    return field;
  });
  return validateCatalog(catalog);
}

export function toAdminFields(catalog) {
  return catalog.map((field, index) => {
    const scoredKeys = new Set(Object.keys(field.scores || {}));
    const aliasEntries = Object.entries(field.aliases || {});
    const options = [];
    const seen = new Set();
    for (const value of field.options || Object.keys(field.scores || {})) {
      if (seen.has(value)) continue;
      seen.add(value);
      options.push({
        value,
        label: value,
        coefficient: field.scores?.[value] ?? 0,
        scored: scoredKeys.has(value),
        public: true,
        aliases: aliasEntries.filter(([, target]) => target === value).map(([alias]) => alias),
      });
    }
    for (const value of scoredKeys) {
      if (seen.has(value)) continue;
      options.push({
        value,
        label: value,
        coefficient: field.scores[value],
        scored: true,
        public: Boolean(field.options?.includes(value) || !field.options),
        aliases: aliasEntries.filter(([, target]) => target === value).map(([alias]) => alias),
      });
    }
    return {
      id: field.id,
      label: field.label,
      group: field.group,
      type: field.type,
      sortOrder: index + 1,
      required: Boolean(field.required),
      active: field.active !== false,
      partial: Boolean(field.partial),
      min: field.min ?? null,
      max: field.max ?? null,
      step: field.step ?? null,
      fallback: field.fallback ?? null,
      whenFieldId: field.when?.id ?? null,
      whenValues: field.when?.values ?? [],
      options,
    };
  });
}

export function toDbRows(catalog) {
  const fields = [];
  const options = [];
  toAdminFields(catalog).forEach((field, index) => {
    fields.push({
      id: field.id,
      label: field.label,
      group_name: field.group,
      control_type: field.type,
      sort_order: index + 1,
      required: field.required,
      active: field.active,
      partial: field.partial,
      min_value: field.min,
      max_value: field.max,
      step_value: field.step,
      fallback: field.fallback,
      when_field_id: field.whenFieldId,
      when_values: field.whenValues,
    });
    field.options.forEach((option, optionIndex) => {
      options.push({
        field_id: field.id,
        value: option.value,
        label: option.label,
        coefficient: option.coefficient,
        scored: option.scored,
        public: option.public,
        sort_order: optionIndex + 1,
        aliases: option.aliases,
      });
    });
  });
  return { fields, options };
}

export function fromDbRows(fieldRows, optionRows) {
  const optionsByField = new Map();
  for (const option of optionRows || []) {
    const list = optionsByField.get(option.field_id) || [];
    list.push(option);
    optionsByField.set(option.field_id, list);
  }
  const catalog = (fieldRows || []).map(row => {
    const stored = (optionsByField.get(row.id) || []).sort((a, b) => a.sort_order - b.sort_order);
    const field = {
      id: row.id,
      label: row.label,
      group: row.group_name,
      type: row.control_type,
      required: Boolean(row.required),
      active: row.active !== false,
      partial: Boolean(row.partial),
    };
    if (row.min_value !== null && row.min_value !== undefined) field.min = Number(row.min_value);
    if (row.max_value !== null && row.max_value !== undefined) field.max = Number(row.max_value);
    if (row.step_value !== null && row.step_value !== undefined) field.step = Number(row.step_value);
    if (row.fallback !== null && row.fallback !== undefined) field.fallback = Number(row.fallback);
    const whenValues = Array.isArray(row.when_values) ? row.when_values.filter(Boolean) : [];
    if (row.when_field_id && whenValues.length) field.when = { id: row.when_field_id, values: whenValues };
    const scores = {};
    const aliases = {};
    const options = [];
    for (const option of stored) {
      if (option.public !== false) options.push(option.value);
      if (option.scored !== false) scores[option.value] = Number(option.coefficient);
      for (const alias of option.aliases || []) aliases[alias] = option.value;
    }
    if (options.length) field.options = options;
    if (Object.keys(scores).length) field.scores = scores;
    if (Object.keys(aliases).length) field.aliases = aliases;
    return field;
  });
  return validateCatalog(catalog);
}
