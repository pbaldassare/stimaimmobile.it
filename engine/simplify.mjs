// Simplified questionnaire (Nov 2026): short floor lists, rooms as 0–4/«più di 4», gardens as private/shared/no,
// every option active (0 points unless set). Old numeric answers keep working through aliases.
export const FLOOR_OPTIONS = ['interrato', 'terra', 'rialzato', '1', '2', '3', '4', '5', 'oltre il 5°', 'attico'];
export const TOTAL_FLOOR_OPTIONS = ['1', '2', '3', '4', '5', 'oltre 5'];
export const ROOM_OPTIONS = ['Nessuno', '1', '2', '3', '4', 'più di 4'];
export const GARDEN_OPTIONS = ['Sì, privato', 'Sì, condominiale', 'No'];
const ROOMS_GROUP = 'Superfici e locali';
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i));

function asSelect(field, options, scores, aliases = {}) {
  const { min, max, step, aliases: _old, ...rest } = field;
  const next = { ...rest, type: 'select', options, scores, partial: false };
  if (Object.keys(aliases).length) next.aliases = aliases;
  return next;
}
const aliasAll = (values, target) => Object.fromEntries(values.map(value => [value, target]));

export function roomScores(old = {}, fallback) {
  // Missing counts take the closest lower coefficient; «più di 4» takes the highest one already set.
  let last = 0;
  const scores = { Nessuno: old['0'] ?? fallback ?? 0 };
  for (let n = 1; n <= 10; n++) {
    last = old[String(n)] ?? last;
    if (n <= 4) scores[String(n)] = last;
  }
  scores['più di 4'] = last;
  return scores;
}

export function simplifyCatalog(catalog) {
  return catalog.map(field => {
    if (field.id === 'floor' || field.id === 'levelNames') {
      return asSelect(field, FLOOR_OPTIONS,
        Object.fromEntries(FLOOR_OPTIONS.map(option => [option, field.scores?.[option] ?? 0])),
        aliasAll(range(6, 50), 'oltre il 5°'));
    }
    if (field.id === 'totalFloors') {
      return asSelect(field, TOTAL_FLOOR_OPTIONS,
        Object.fromEntries(TOTAL_FLOOR_OPTIONS.map(option => [option, field.scores?.[option] ?? 0])),
        aliasAll(range(6, 30), 'oltre 5'));
    }
    if (field.id === 'gardens') {
      return asSelect(field, GARDEN_OPTIONS, Object.fromEntries(GARDEN_OPTIONS.map(option => [option, 0])));
    }
    if (field.group === ROOMS_GROUP && field.id !== 'surface' && (field.type === 'count' || field.type === 'number')) {
      return asSelect(field, ROOM_OPTIONS, roomScores(field.scores, field.fallback),
        { '0': 'Nessuno', ...aliasAll(range(5, 10), 'più di 4') });
    }
    if ((field.type === 'select' || field.type === 'yesno') && field.options) {
      // Every listed answer counts (0 points until the operator sets a coefficient).
      const scores = Object.fromEntries(field.options.map(option => [option, field.scores?.[option] ?? 0]));
      return { ...field, scores: { ...field.scores, ...scores }, partial: false };
    }
    return field;
  });
}
