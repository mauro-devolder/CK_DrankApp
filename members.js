// Ledenlijst — 1x per jaar bijwerken bij de leidingswissel.
// VERVANG deze voorbeeldnamen door de echte ~30 leiding.
// 'host: true' = drankleiding (mag straks deletes goedkeuren in fase 3).
//
// In fase 1 staat deze lijst hier; in een latere fase verhuist hij naar de
// database zodat een host hem zelf kan bewerken zonder code aan te raken.

// 'groep' bepaalt in welke app iemand thuishoort: 'leiding' of 'aspi'.
// De leiding-app toont enkel groep 'leiding', de aspi-app enkel groep 'aspi'.
// Mauro is opper-host en regelt beide; hij staat in 'leiding' (daar tikt hij
// zijn eigen drankjes) en host de aspi-app via de code, dus geen aspi-rij nodig.
export const MEMBERS = [
  { id: 'm01', naam: 'Bavo',     actief: true, groep: 'leiding' },
  { id: 'm02', naam: 'Noor',     actief: true, groep: 'leiding' },
  { id: 'm03', naam: 'Danske',   actief: true, groep: 'leiding' },
  { id: 'm04', naam: 'Mauro',    actief: true, groep: 'leiding', host: true, superadmin: true },
  { id: 'm05', naam: 'Suzanne',  actief: true, groep: 'leiding' },
  { id: 'm06', naam: 'Marie',    actief: true, groep: 'leiding' },
  { id: 'm07', naam: 'Logann',   actief: true, groep: 'leiding' },
  { id: 'm08', naam: 'Jarne',    actief: true, groep: 'leiding' },
  { id: 'm09', naam: 'Ine',      actief: true, groep: 'leiding' },
  { id: 'm10', naam: 'Jozefien', actief: true, groep: 'leiding' },
  { id: 'm11', naam: 'Milan',    actief: true, groep: 'leiding' },
  { id: 'm12', naam: 'Tibbe',    actief: true, groep: 'leiding' },
  { id: 'm13', naam: 'Stan',     actief: true, groep: 'leiding' },
  { id: 'm14', naam: 'Luna',     actief: true, groep: 'leiding' },
  { id: 'm15', naam: 'Lotte',    actief: true, groep: 'leiding' },
  { id: 'm16', naam: 'Yolan',    actief: true, groep: 'leiding' },
  { id: 'm17', naam: 'Sari',     actief: true, groep: 'leiding' },
  { id: 'm18', naam: 'Hanna',    actief: true, groep: 'leiding' },
  { id: 'm19', naam: 'Alicia',   actief: true, groep: 'leiding' },
  { id: 'm20', naam: 'Torben',   actief: true, groep: 'leiding' },
  { id: 'm21', naam: 'Lore',     actief: true, groep: 'leiding' },
  { id: 'm22', naam: 'Layla',    actief: true, groep: 'leiding' },
  { id: 'm23', naam: 'Juliette', actief: true, groep: 'leiding' },
  { id: 'm24', naam: 'Milo',     actief: true, groep: 'leiding' },
  { id: 'm25', naam: 'Flo',      actief: true, groep: 'leiding' },
  { id: 'm26', naam: 'Lieze',    actief: true, groep: 'leiding' },
  { id: 'm27', naam: 'Marije',   actief: true, groep: 'leiding' },
  { id: 'm28', naam: 'Polle',    actief: true, groep: 'leiding' },
  { id: 'm29', naam: 'Ella',     actief: true, groep: 'leiding' },
  { id: 'm30', naam: 'Yannis',   actief: true, groep: 'leiding' },

  // Aspi's (oudste leden) — eigen aspi-app. Aspileiding = voorlopig enkel Mauro.
  { id: 'a01', naam: 'Michelle', actief: true, groep: 'aspi' },
  { id: 'a02', naam: 'Jona',     actief: true, groep: 'aspi' },
  { id: 'a03', naam: 'Mo',       actief: true, groep: 'aspi' },
  { id: 'a04', naam: 'Marlon',   actief: true, groep: 'aspi' },
  { id: 'a05', naam: 'Yoko',     actief: true, groep: 'aspi' },
  { id: 'a06', naam: 'Nanou',    actief: true, groep: 'aspi' },

  // Aspileiding-identiteit voor de aspi-app. 'leidingOnly: true' = dit is een
  // beheer-identiteit, geen drinkende aspi: hij verschijnt NIET in de keuze-
  // lijst, het overzicht, de export of de schulden (getMembers filtert hem weg),
  // maar getMemberById/memberName blijven werken. Inloggen gebeurt via de knop
  // "Inloggen als aspileiding" op het keuzescherm (vraagt de aspi-code 7777).
  { id: 'as1', naam: 'Aspileiding', actief: true, groep: 'aspi', host: true, leidingOnly: true },
];

// De 7 drankjes/types. De 'code' is wat in de export verschijnt (1p, 1f, ...).
// 'order' bepaalt de vaste volgorde in de exportregel: p f c w s k d.
//
// EIGEN FOTO i.p.v. emoji? Zet een afbeelding in de map 'img/' en vul 'img' in,
// bv. img: 'img/pint.png'. Staat 'img' ingevuld, dan toont de app de foto i.p.v.
// de emoji. Laat 'img' weg (of null) om de emoji te gebruiken.
export const DRINKS = [
  { code: 'p', naam: 'Pint',       emoji: '🍺', kleur: '#2e6b3e', order: 0, img: 'img/pint.png' },
  { code: 'f', naam: 'Frisdrank',  emoji: '🥤', kleur: '#e8553a', order: 1, img: 'img/frisdrank.png' },
  { code: 'c', naam: 'Chips',      emoji: '🥔', kleur: '#e0b020', order: 2, img: 'img/chips.png' },
  { code: 'w', naam: 'Water',      emoji: '💧', kleur: '#3aa0e8', order: 3, img: 'img/water.png' },
  { code: 's', naam: 'Sterk bier', emoji: '🍻', kleur: '#9a6a2f', order: 4, img: 'img/sterkbier.png' },
  { code: 'k', naam: 'Kriek',      emoji: '🍒', kleur: '#c0314f', order: 5, img: 'img/kriek.png' },
  { code: 'd', naam: 'Desperados', emoji: '🌵', kleur: '#5aa84a', order: 6, img: 'img/desperados.png' },
];

export const DRINK_BY_CODE = Object.fromEntries(DRINKS.map((d) => [d.code, d]));

// Snelknoppen die in één tik meerdere pinten op jezelf zetten.
// Ook hier kan 'img' een eigen foto zijn (bv. img: 'img/bak.png').
export const BULK = [
  { id: 'halve-bak', naam: 'Halve bak', code: 'p', aantal: 12, emoji: '🍺', kleur: '#b8863a', img: 'img/halvebak.png' },
  { id: 'bak',       naam: 'Bak',       code: 'p', aantal: 24, emoji: '📦', kleur: '#8a5a22', img: 'img/bak.png' },
];

// Drankspel (enkel leiding — staat in de 'ANDERE'-sectie, die in de aspi-app
// verborgen is). De leiding kiest het aantal pinten van het spel, wie meedoet, en
// verdeelt 'gelijk' of 'per persoon'. Elke deelnemer krijgt zo een (mogelijk
// decimaal) aantal pinten. Opent het drankspel-scherm.
export const DRANKSPEL = {
  id: 'drankspel', naam: 'Drankspel', code: 'p', emoji: '🍺', kleur: '#c0314f',
  img: 'img/bierpong.png', defaultPints: 10,
};
