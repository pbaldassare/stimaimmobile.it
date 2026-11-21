import { fields } from './model.mjs';
import { publicQuestions } from './catalog.mjs';

export const ENGINE_VERSION = 'omi-xls-2.0.0';

export const questions = publicQuestions(fields);

function normalized(value) {
  return String(value).trim().normalize('NFC').toLocaleLowerCase('it').replace(/^si$/, 'sì');
}

function scoreKey(field, text) {
  if (text === undefined || text === null) return undefined;
  const needle = normalized(text);
  const direct = Object.keys(field.scores || {}).find(key => normalized(key) === needle);
  if (direct) return direct;
  const aliases = field.aliases || {};
  const alias = Object.keys(aliases).find(key => normalized(key) === needle);
  return alias ? aliases[alias] : undefined;
}

function listedOption(field, text) {
  return (field.options || []).find(key => normalized(key) === normalized(text));
}

function answerFor(field, raw) {
  if (raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim())) {
    if (field.required) throw new RangeError('Inserisci la ' + field.label.toLowerCase() + '.');
    return undefined;
  }
  if (typeof raw !== 'string' && typeof raw !== 'number') throw new RangeError('Valore non valido per ' + field.label + '.');
  if (field.type === 'number' || field.type === 'count') {
    const token = String(raw).trim().replace(',', '.');
    const value = Number(token);
    if (!/^\d+(?:\.\d+)?$/.test(token) || !Number.isFinite(value) || value < (field.min ?? 0) ||
        value > (field.max ?? Number.MAX_SAFE_INTEGER) || (field.step === 1 && !Number.isSafeInteger(value)) ||
        (field.step === 0.01 && Math.abs(value * 100 - Math.round(value * 100)) > 0.00001)) {
      throw new RangeError('Verifica il valore di ' + field.label + '.');
    }
    return value;
  }
  const text = String(raw).trim().normalize('NFC');
  if (text.length > 180 || /[\u0000-\u001f]/.test(text)) throw new RangeError('Verifica il testo di ' + field.label + '.');
  if (field.type === 'select' || field.type === 'yesno') {
    const option = scoreKey(field, text);
    if (option) return option;
    const listed = listedOption(field, text);
    if (listed) return listed;
    throw new RangeError('Scegli una delle opzioni per ' + field.label + '.');
  }
  throw new RangeError('Scegli una delle opzioni per ' + field.label + '.');
}

function visible(field, inputs) {
  return !field.when || field.when.values.includes(inputs[field.when.id]);
}

export function normalizeInputs(raw, catalog = fields) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new RangeError('Dati immobile mancanti.');
  const inputs = {};
  for (const field of catalog) {
    if (field.active === false || !visible(field, inputs)) continue;
    const answer = answerFor(field, raw[field.id]);
    if (answer !== undefined) inputs[field.id] = answer;
  }
  return inputs;
}

function euroAmounts(surface, rate, correctionTenths) {
  // Decimal arithmetic keeps half-cent boundaries identical across JavaScript runtimes.
  const [mantissa, exponent = '0'] = String(rate).toLowerCase().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const scale = fraction.length - Number(exponent);
  const rateUnits = BigInt(whole + fraction) * 10n ** BigInt(Math.max(0, -scale));
  const numerator = BigInt(Math.round(surface * 100)) * rateUnits * BigInt(1000 + correctionTenths);
  const denominator = 10n ** BigInt(Math.max(0, scale)) * 1000n;
  function money(n, d) {
    const cents = (2n * n + d) / (2n * d);
    if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Importo fuori intervallo.');
    return Number(cents) / 100;
  }
  return { value: money(numerator, denominator), minimum: money(numerator * 9n, denominator * 10n) };
}

// Intended CALCOLI coefficients, not Excel SUM-as-text: E58 nessuno +1, E74 intenso −1.9,
// E61 porta "va bene così" +1. Blank B50/B51 each score -1.
export function calculate(raw, rate, catalog = fields) {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) throw new RangeError('Quotazione non valida.');
  const inputs = normalizeInputs(raw, catalog);
  const factors = [];
  const warnings = [];
  let correctionTenths = 0;
  for (const field of catalog) {
    if (field.active === false || !field.scores) continue;
    const answer = inputs[field.id];
    const key = scoreKey(field, answer);
    if (field.partial && answer !== undefined && key === undefined) {
      warnings.push(field.label + ': il coefficiente per il valore dichiarato non è disponibile nel modello originale. Il risultato esclude questo correttivo.');
    }
    const points = key === undefined ? (field.fallback ?? 0) : field.scores[key];
    if (points !== 0) {
      correctionTenths += Math.round(points * 10);
      factors.push({ id: field.id, label: field.label, value: points });
    }
  }
  factors.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const surface = inputs.surface;
  return { ...euroAmounts(surface, rate, correctionTenths), rate, surface, correction: correctionTenths / 10, factors, warnings };
}
