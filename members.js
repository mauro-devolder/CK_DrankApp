// Ledenlijst — 1x per jaar bijwerken bij de leidingswissel.
// VERVANG deze voorbeeldnamen door de echte ~30 leiding.
// 'host: true' = drankleiding (mag straks deletes goedkeuren in fase 3).
//
// In fase 1 staat deze lijst hier; in een latere fase verhuist hij naar de
// database zodat een host hem zelf kan bewerken zonder code aan te raken.

export const MEMBERS = [
  { id: 'm01', naam: 'Bavo',     actief: true },
  { id: 'm02', naam: 'Noor',     actief: true },
  { id: 'm03', naam: 'Danske',   actief: true },
  { id: 'm04', naam: 'Mauro',    actief: true, host: true, superadmin: true },
  { id: 'm05', naam: 'Suzanne',  actief: true },
  { id: 'm06', naam: 'Marie',    actief: true },
  { id: 'm07', naam: 'Logann',   actief: true },
  { id: 'm08', naam: 'Jarne',    actief: true },
  { id: 'm09', naam: 'Ine',      actief: true },
  { id: 'm10', naam: 'Jozefien', actief: true },
  { id: 'm11', naam: 'Milan',    actief: true },
  { id: 'm12', naam: 'Tibbe',    actief: true },
  { id: 'm13', naam: 'Stan',     actief: true },
  { id: 'm14', naam: 'Luna',     actief: true },
  { id: 'm15', naam: 'Lotte',    actief: true },
  { id: 'm16', naam: 'Yolan',    actief: true },
  { id: 'm17', naam: 'Sari',     actief: true },
  { id: 'm18', naam: 'Hanna',    actief: true },
  { id: 'm19', naam: 'Alicia',   actief: true },
  { id: 'm20', naam: 'Torben',   actief: true },
  { id: 'm21', naam: 'Lore',     actief: true },
  { id: 'm22', naam: 'Layla',    actief: true },
  { id: 'm23', naam: 'Juliette', actief: true },
  { id: 'm24', naam: 'Milo',     actief: true },
  { id: 'm25', naam: 'Flo',      actief: true },
  { id: 'm26', naam: 'Lieze',    actief: true },
  { id: 'm27', naam: 'Marije',   actief: true },
  { id: 'm28', naam: 'Polle',    actief: true },
  { id: 'm29', naam: 'Ella',     actief: true },
  { id: 'm30', naam: 'Yannis',   actief: true },
];

// De 7 drankjes/types. De 'code' is wat in de export verschijnt (1p, 1f, ...).
// 'order' bepaalt de vaste volgorde in de exportregel: p f c w s k d.
export const DRINKS = [
  { code: 'p', naam: 'Pint',       emoji: '🍺', kleur: '#d9a441', order: 0 },
  { code: 'f', naam: 'Frisdrank',  emoji: '🥤', kleur: '#e8553a', order: 1 },
  { code: 'c', naam: 'Chips',      emoji: '🥔', kleur: '#e0b020', order: 2 },
  { code: 'w', naam: 'Water',      emoji: '💧', kleur: '#3aa0e8', order: 3 },
  { code: 's', naam: 'Sterk bier', emoji: '🍻', kleur: '#9a6a2f', order: 4 },
  { code: 'k', naam: 'Kriek',      emoji: '🍒', kleur: '#c0314f', order: 5 },
  { code: 'd', naam: 'Desperados', emoji: '🌵', kleur: '#5aa84a', order: 6 },
];

export const DRINK_BY_CODE = Object.fromEntries(DRINKS.map((d) => [d.code, d]));
