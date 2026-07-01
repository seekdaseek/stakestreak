// StakeStreak shared theme — dark, bold, pot-as-hero
export const C = {
  // surfaces
  bg:        '#1A1310',   // page background (near-black warm)
  card:      '#241A15',   // raised tile/card
  cardEdge:  '#3A2E24',   // card border
  bar:       '#2B2118',   // top bars / headers

  // brand
  orange:    '#FF5A36',   // primary action, brand
  orangeLt:  '#FF7A54',   // lighter orange (pending, accents)
  gold:      '#FFD84D',   // the POT / money hero color
  green:     '#7BC950',   // success, survived, winnings
  greenDim:  '#5A8A3A',
  red:       '#FF3B6B',   // eliminated / danger

  // text
  text:      '#FFFFFF',   // primary
  textDim:   '#8A7E72',   // secondary / labels
  textFaint: '#6B5D50',   // faint / disabled

  // tints for check-in cards
  greenBg:   '#1D2B15',
  orangeBg:  '#2B1A15',
};

// shared style tokens
export const T = {
  screen:    {flex: 1, backgroundColor: C.bg},
  pad:       {padding: 18},
  card:      {backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.cardEdge, padding: 18},
  tile:      {flex: 1, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardEdge, padding: 12, alignItems: 'center'},
  label:     {color: C.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 1},
  h1:        {color: C.text, fontSize: 24, fontWeight: '900'},
  h2:        {color: C.text, fontSize: 20, fontWeight: '900'},
  meta:      {color: C.textDim, fontSize: 13},
  cta:       {backgroundColor: C.orange, borderRadius: 18, padding: 16, alignItems: 'center'},
  ctaText:   {color: C.text, fontSize: 16, fontWeight: '900'},
  ctaSub:    {color: '#FFD5C8', fontSize: 11, fontWeight: '700', marginTop: 2},
  chip:      {backgroundColor: C.card, borderWidth: 1, borderColor: C.cardEdge, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8},
};

// helper: minutes-into-day -> "6:30am" or "15:00"
export function fmtTime(mins, use24h) {
  const h = Math.floor(mins / 60), m = mins % 60;
  if (use24h) return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  const ap = h < 12 ? 'am' : 'pm'; let h12 = h % 12; if (h12 === 0) h12 = 12;
  return h12 + ':' + String(m).padStart(2, '0') + ap;
}
