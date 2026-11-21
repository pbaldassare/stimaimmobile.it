// Excel CALCOLI B4 stored the Brescia district as "Cenro storico". Canonical listino zona is Centro storico.
const ZONE_ALIASES = {
  'cenro storico': 'Centro storico'
};

function folded(value) {
  return String(value ?? '').trim().normalize('NFC').toLocaleLowerCase('it');
}

export function canonicalZone(zona) {
  const text = String(zona ?? '').trim().normalize('NFC');
  if (!text) return text;
  return ZONE_ALIASES[folded(text)] || text;
}

export function sameZone(a, b) {
  return folded(canonicalZone(a)) === folded(canonicalZone(b));
}

export function sameRateField(a, b) {
  return folded(a) === folded(b);
}
