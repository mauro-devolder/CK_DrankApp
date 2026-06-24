// Data-laag met offline-wachtrij + automatische sync naar Supabase.
//
//  - Elke tik wordt ONMIDDELLIJK lokaal opgeslagen (synced:false); de UI
//    reageert meteen, ook zonder bereik (kelder).
//  - sync() pusht alle niet-gesyncte wijzigingen (toevoegen, verwijderen,
//    statuswijzigingen) en haalt de registraties van anderen op.
//  - Client-UUID's + upsert = nooit dubbel tellen.
//  - Verwijderen is een STATUSwijziging ('verwijderd'), geen harde delete, zodat
//    een verwijdering ook naar andere toestellen propageert.
//  - Zonder Supabase-config draait alles lokaal.

import { MEMBERS } from './members.js';
import { HOST_PIN, ASPI_PIN } from './config.js';
import * as api from './api.js';

export const isConfigured = api.isConfigured;

// In welke modus draait deze build: 'leiding' (standaard) of 'aspi'. Het
// HTML-instappunt van de aspi-app zet window.APP_GROUP = 'aspi'.
export function currentGroup() {
  return (typeof window !== 'undefined' && window.APP_GROUP) || 'leiding';
}

// localStorage is gedeeld per origin: de leiding-app en de aspi-app staan op
// dezelfde domeinnaam. Sleutels die PER APP verschillen (identiteit, host-status,
// pincode) krijgen daarom een groep-suffix. De drankdata zelf en de voorraad zijn
// wél gedeeld — één database, één frigo.
function keyFor(base, group) { return group === 'aspi' ? `${base}.aspi` : base; }
const G = currentGroup();
const KEY_USER = keyFor('drank.currentUserId', G);
const KEY_SEEN = keyFor('drank.seenNotifs', G);
const KEY_HOST = keyFor('drank.hostUnlocked', G);
const KEY_PIN = keyFor('drank.hostPin', G);            // gecachte server-pincode
const KEY_EPOCH_SERVER = keyFor('drank.epochServer', G); // laatst gekende server-epoch
const KEY_HOST_EPOCH = keyFor('drank.hostEpoch', G);   // epoch waarop dit toestel host werd
const KEY_CONS = 'drank.consumptions';      // gedeeld: één database
const KEY_STOCK = 'drank.stock';            // gedeeld: één frigo
const KEY_ASPI_CONS = 'drank.aspiCons';     // gedeeld: actieve aspi-rijen (cross-maand) voor de cumulatieve schuld
const KEY_SETTLE = 'drank.aspiSettlements'; // gedeeld: afrekeningen (schuld op 0)
const KEY_PERIODS = 'drank.periods';        // gedeeld: afgesloten afrekenperiodes (leiding)
const STOCK_KEY = 'current';                // voorraad hoort bij de huidige periode (niet per maand)
const KEY_PINS = 'drank.pins';              // gedeeld: laatst gekende codes (enkel voor weergave aan de drankleiding)

const listeners = new Set();
function emit() { for (const fn of listeners) fn(); }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function load(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function loadCons() { return load(KEY_CONS, []); }
function saveCons(arr) { save(KEY_CONS, arr); }
function memberName(id) { const m = MEMBERS.find((x) => x.id === id); return m ? m.naam : '??'; }
function curUser() { return load(KEY_USER, null); }

function newId() {
  if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'c_' + Date.now() + '_' + Math.random().toString(16).slice(2);
}

// --- Leden -----------------------------------------------------------------

// Enkel de leden van de groep van déze app. Naam-opzoeking (memberName,
// getMemberById) blijft over álle groepen werken, zodat registered_by altijd
// klopt — enkel de zichtbare lijsten zijn per groep gescheiden.
// 'leidingOnly'-identiteiten (bv. de aspileiding) zijn beheer-accounts, geen
// drinkende leden: ze blijven uit de keuzelijst, het overzicht en de schulden.
export async function getMembers() {
  const groep = currentGroup();
  return MEMBERS.filter((m) => m.actief && m.groep === groep && !m.leidingOnly);
}

// id's van de drinkende aspi's (zonder de aspileiding-identiteit). Gebruikt om
// de cumulatieve schuld op te halen en te berekenen.
function aspiIds() {
  return MEMBERS.filter((m) => m.groep === 'aspi' && !m.leidingOnly).map((m) => m.id);
}

// Groep van een lid (voor het filteren van logs/overzichten per app).
export function memberGroup(id) { const m = MEMBERS.find((x) => x.id === id); return m ? m.groep : null; }
export async function getMemberById(id) { return MEMBERS.find((m) => m.id === id) || null; }
export async function isHost(id) { const m = MEMBERS.find((x) => x.id === id); return !!(m && m.host); }
export function isSuperAdmin(id) { const m = MEMBERS.find((x) => x.id === id); return !!(m && m.superadmin); }

// --- Identiteit op dit toestel ---------------------------------------------

export async function getCurrentUserId() { return curUser(); }
export async function setCurrentUserId(id) { save(KEY_USER, id); }
export async function clearCurrentUser() { localStorage.removeItem(KEY_USER); }

// Host-modus blijft op dit toestel bewaard nadat de code 1x correct is ingegeven.
export function isHostUnlocked() { return load(KEY_HOST, false) === true; }
export function unlockHost() {
  save(KEY_HOST, true);
  save(KEY_HOST_EPOCH, load(KEY_EPOCH_SERVER, 1)); // onthoud op welke epoch we host werden
  emit();
}
export function lockHost() { save(KEY_HOST, false); localStorage.removeItem(KEY_HOST_EPOCH); emit(); }

// Standaard-pincode van deze app (gebruikt zolang de server geen waarde geeft).
function defaultPin() { return currentGroup() === 'aspi' ? ASPI_PIN : HOST_PIN; }

// Huidige host-pincode van deze app (server-waarde indien gekend, anders standaard).
export function currentPin() { return load(KEY_PIN, defaultPin()); }

// Laatst gekende codes van beide groepen (enkel om aan de drankleiding te tonen).
// Terugval op de standaardwaarden zolang de server nog niets gaf.
export function getKnownPins() {
  const p = load(KEY_PINS, {});
  return { leiding: p.leiding || HOST_PIN, aspi: p.aspi || ASPI_PIN };
}

// Drankleiding wijzigt de pincode van een groep: epoch +1 -> alle andere toestellen
// van die groep verliezen host. Mauro kan zo ook de aspi-code (7777) wijzigen
// vanuit de leiding-app, waar hij als drankleiding herkend wordt.
export async function changePin(targetGroup, newPin) {
  if (!api.isConfigured() || !navigator.onLine) throw new Error('offline');
  const isAspi = targetGroup === 'aspi';
  const pinKey = keyFor('drank.hostPin', targetGroup);
  const epochKey = keyFor('drank.epochServer', targetGroup);
  const hostEpochKey = keyFor('drank.hostEpoch', targetGroup);
  const newEpoch = load(epochKey, 1) + 1;
  await api.updateAppConfig(isAspi
    ? { aspi_pin: newPin, aspi_epoch: newEpoch }
    : { host_pin: newPin, host_epoch: newEpoch });
  save(pinKey, newPin);
  save(epochKey, newEpoch);
  if (targetGroup === currentGroup()) save(hostEpochKey, newEpoch); // déze app blijft host
  emit();
}

// --- Registraties ----------------------------------------------------------

// registeredBy = wie tikte (default = personId zelf). Voor een rondje zet je
// drankjes op anderen: personId = ontvanger, registeredBy = jij.
export async function addConsumption({ personId, drinkCode, registeredBy }) {
  const all = loadCons();
  const entry = {
    id: newId(),
    personId,
    registeredBy: registeredBy || personId,
    drinkCode,
    tijdstip: new Date().toISOString(),
    status: 'actief',
    aantal: 1,
    synced: false,
  };
  all.push(entry);
  saveCons(all);
  emit();
  scheduleSync();
  return entry;
}

// Meerdere ineens (bak = 24 pinten, halve bak = 12). Eén keer opslaan/synchroniseren.
export async function addMany({ personId, drinkCode, registeredBy, aantal }) {
  const all = loadCons();
  const entries = [];
  for (let i = 0; i < aantal; i++) {
    const e = {
      id: newId(), personId, registeredBy: registeredBy || personId,
      drinkCode, tijdstip: new Date().toISOString(), status: 'actief', aantal: 1, synced: false,
    };
    all.push(e); entries.push(e);
  }
  saveCons(all);
  emit();
  scheduleSync();
  return entries;
}

// Drankspel: ken elke deelnemer zijn aandeel pinten toe. 'shares' = lijst van
// { personId, aantal } (aantal kan een kommagetal zijn). Elke deelnemer krijgt
// één pint-registratie met dat gewicht. registeredBy = wie het ingaf, zodat de
// deelnemers een melding krijgen (behalve die persoon zelf, als hij meespeelt).
export async function addDrankspel({ shares, registeredBy }) {
  if (!shares || !shares.length) return [];
  const all = loadCons();
  const entries = [];
  const t = new Date().toISOString();
  for (const { personId, aantal } of shares) {
    if (!aantal || aantal <= 0) continue; // 0 pinten = niets toevoegen
    const e = {
      id: newId(), personId, registeredBy: registeredBy || personId,
      drinkCode: 'p', tijdstip: t, status: 'actief', aantal, synced: false,
    };
    all.push(e); entries.push(e);
  }
  saveCons(all);
  emit();
  scheduleSync();
  return entries;
}

function setStatus(id, status) {
  const all = loadCons();
  const c = all.find((x) => x.id === id);
  if (!c) return;
  if (status === 'verwijderd' && !c.synced) {
    saveCons(all.filter((x) => x.id !== id)); // stond nog niet op server
  } else {
    c.status = status;
    c.synced = false;
    saveCons(all);
  }
  emit();
  scheduleSync();
}

// Zelf-correctie binnen het venster (mis getikt) -> meteen weg.
export async function removeConsumption(id) { setStatus(id, 'verwijderd'); }

// Iemand vraagt een host om een (oudere) registratie te verwijderen.
export async function requestDeletion(id) { setStatus(id, 'pending_delete'); }

// Host beslist.
export async function approveDeletion(id) { setStatus(id, 'verwijderd'); }
export async function rejectDeletion(id) { setStatus(id, 'actief'); }

function activeForMonth(date) {
  const y = date.getFullYear(), m = date.getMonth();
  return loadCons().filter((c) => {
    if (c.status !== 'actief') return false;
    const t = new Date(c.tijdstip);
    return t.getFullYear() === y && t.getMonth() === m;
  });
}

export async function getTotalsForMonth(date = new Date()) {
  const totals = {};
  for (const c of activeForMonth(date)) {
    totals[c.personId] = totals[c.personId] || {};
    totals[c.personId][c.drinkCode] = (totals[c.personId][c.drinkCode] || 0) + (c.aantal ?? 1);
  }
  return totals;
}

// --- Postvak (drankjes die anderen op mijn naam zetten) --------------------

function seenSet() { return new Set(load(KEY_SEEN, [])); }

export async function getNotifications() {
  const me = curUser();
  const seen = seenSet();
  return loadCons()
    .filter((c) => c.personId === me && c.registeredBy !== me && c.status !== 'verwijderd')
    .sort((a, b) => b.tijdstip.localeCompare(a.tijdstip))
    .map((c) => ({
      id: c.id,
      door: memberName(c.registeredBy),
      drinkCode: c.drinkCode,
      tijdstip: c.tijdstip,
      status: c.status,
      aantal: c.aantal ?? 1,
      seen: seen.has(c.id),
    }));
}

export function getUnseenNotificationCount() {
  const me = curUser();
  const seen = seenSet();
  return loadCons().filter(
    (c) => c.personId === me && c.registeredBy !== me && c.status === 'actief' && !seen.has(c.id)
  ).length;
}

export async function markNotificationsSeen() {
  const me = curUser();
  const ids = loadCons()
    .filter((c) => c.personId === me && c.registeredBy !== me)
    .map((c) => c.id);
  save(KEY_SEEN, [...new Set([...load(KEY_SEEN, []), ...ids])]);
  emit();
}

// --- Host: openstaande verwijderverzoeken ----------------------------------

export async function getPendingDeletes() {
  return loadCons()
    .filter((c) => c.status === 'pending_delete')
    .sort((a, b) => b.tijdstip.localeCompare(a.tijdstip))
    .map((c) => ({
      id: c.id,
      voor: memberName(c.personId),
      door: memberName(c.registeredBy),
      drinkCode: c.drinkCode,
      tijdstip: c.tijdstip,
    }));
}

// --- Host: log + tellingen per persoon aanpassen ---------------------------

// Volledig logboek van een maand (alle statussen), nieuwste eerst.
export async function getLogForMonth(date = new Date()) {
  const y = date.getFullYear(), m = date.getMonth();
  return loadCons()
    .filter((c) => { const t = new Date(c.tijdstip); return t.getFullYear() === y && t.getMonth() === m; })
    .sort((a, b) => b.tijdstip.localeCompare(a.tijdstip))
    .map((c) => ({
      id: c.id,
      personId: c.personId,
      persoon: memberName(c.personId),
      groep: memberGroup(c.personId),
      door: c.registeredBy !== c.personId ? memberName(c.registeredBy) : null,
      drinkCode: c.drinkCode,
      tijdstip: c.tijdstip,
      status: c.status,
      aantal: c.aantal ?? 1,
    }));
}

// Actieve tellingen van één persoon in een maand: { p: 3, f: 1 }
export async function getCountsForPerson(personId, date = new Date()) {
  const counts = {};
  for (const c of activeForMonth(date)) {
    if (c.personId === personId) counts[c.drinkCode] = (counts[c.drinkCode] || 0) + (c.aantal ?? 1);
  }
  return counts;
}

// Host voegt er één toe (registered_by = de persoon zelf, dus geen melding).
export async function hostAddOne(personId, drinkCode) {
  return addConsumption({ personId, drinkCode, registeredBy: personId });
}

// Host haalt er één weg: de meest recente actieve van die persoon+drank in de maand.
export async function hostRemoveOne(personId, drinkCode, date = new Date()) {
  const all = loadCons();
  const y = date.getFullYear(), m = date.getMonth();
  const cands = all
    .filter((c) => {
      if (c.personId !== personId || c.drinkCode !== drinkCode || c.status !== 'actief') return false;
      const t = new Date(c.tijdstip);
      return t.getFullYear() === y && t.getMonth() === m;
    })
    .sort((a, b) => b.tijdstip.localeCompare(a.tijdstip));
  if (!cands.length) return false;
  const target = cands[0];
  if (!target.synced) saveCons(all.filter((c) => c.id !== target.id));
  else { target.status = 'verwijderd'; target.synced = false; saveCons(all); }
  emit();
  scheduleSync();
  return true;
}

// --- Aspi-schulden (per maand, met afrekening voor álle aspi's) -------------
//
// De aspischuld blijft per maand staan en stapelt op zolang ze niet wordt
// afgerekend. Afrekenen wist GEEN registraties (anders verschuift de maand-zwerf
// van de drankleiding), het legt enkel één GEDEELD watermerk: alle aspi's worden
// in één keer afgerekend — niet per persoon. De openstaande schuld = de actieve
// aspi-drankjes ná dat watermerk, getoond PER MAAND (zodat elke maand-zwerf de
// schuld van díe maand gebruikt, niet een hoop sinds de laatste afrekening).
// Een afrekening moet de drankleiding goedkeuren.

function loadSettle() { return load(KEY_SETTLE, []); }
function saveSettle(arr) { save(KEY_SETTLE, arr); }
function loadAspiCons() { return load(KEY_ASPI_CONS, []); }

// Alle aspi-registraties (álle statussen, cross-maand): de servercache aangevuld
// met lokale rijen uit de gewone wachtrij (zodat een verse tik en offline ook
// meetellen). Lokaal is leidend bij dezelfde id. Ontdubbeld op id.
function aspiAllRows() {
  const ids = new Set(aspiIds());
  const byId = new Map();
  for (const r of loadAspiCons()) if (ids.has(r.personId)) byId.set(r.id, r);
  for (const c of loadCons()) if (ids.has(c.personId)) byId.set(c.id, c); // lokaal leidend
  return [...byId.values()];
}

// Enkel de actieve rijen — dat is de schuld.
function aspiDebtRows() {
  return aspiAllRows().filter((r) => r.status === 'actief');
}

// Eén gedeeld watermerk: het tijdstip van de laatste GOEDGEKEURDE afrekening
// (alle aspi's samen). Alles ervóór is afgerekend.
function aspiWatermark() {
  let wm = null;
  for (const s of loadSettle()) {
    if (s.status === 'approved' && s.effectiveAt && (!wm || s.effectiveAt > wm)) wm = s.effectiveAt;
  }
  return wm;
}

function monthKeyOf(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Openstaande schuld PER MAAND (nieuwste eerst). Elke maand:
//   { maand:'YYYY-MM', perPerson:[{personId,naam,counts}], total:{p,f,..} }
// Enkel de drankjes ná het gedeelde watermerk.
export async function getAspiDebtsByMonth() {
  const wm = aspiWatermark();
  const rows = aspiDebtRows().filter((r) => !wm || r.tijdstip > wm);
  const byMonth = new Map();
  for (const r of rows) {
    const k = monthKeyOf(r.tijdstip);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k).push(r);
  }
  return [...byMonth.keys()].sort().reverse().map((maand) => {
    const perPerson = new Map();
    const total = {};
    for (const r of byMonth.get(maand)) {
      if (!perPerson.has(r.personId)) perPerson.set(r.personId, { personId: r.personId, naam: memberName(r.personId), counts: {} });
      perPerson.get(r.personId).counts[r.drinkCode] = (perPerson.get(r.personId).counts[r.drinkCode] || 0) + (r.aantal ?? 1);
      total[r.drinkCode] = (total[r.drinkCode] || 0) + (r.aantal ?? 1);
    }
    const list = [...perPerson.values()].sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
    return { maand, perPerson: list, total };
  });
}

// Log van álle aspi's sinds de laatste afrekening (álle statussen, nieuwste
// eerst), in de vorm die buildGroupedLog verwacht. Na een goedgekeurde
// afrekening staat het watermerk op 'nu', dus deze log is dan leeg — de
// aspileiding-app is dan "volledig leeg".
export async function getAspiLog() {
  const wm = aspiWatermark();
  return aspiAllRows()
    .filter((r) => !wm || r.tijdstip > wm)
    .sort((a, b) => b.tijdstip.localeCompare(a.tijdstip))
    .map((c) => ({
      id: c.id,
      personId: c.personId,
      persoon: memberName(c.personId),
      groep: memberGroup(c.personId),
      door: c.registeredBy && c.registeredBy !== c.personId ? memberName(c.registeredBy) : null,
      drinkCode: c.drinkCode,
      tijdstip: c.tijdstip,
      status: c.status,
      aantal: c.aantal ?? 1,
    }));
}

// Totale openstaande schuld per aspi over alle maanden (voor de snapshot bij de
// goedkeuring) + 'pending'-status. Globaal: één afrekening voor iedereen.
export async function getAspiOutstanding() {
  const months = await getAspiDebtsByMonth();
  const perPerson = new Map();
  for (const m of months) for (const p of m.perPerson) {
    if (!perPerson.has(p.personId)) perPerson.set(p.personId, { personId: p.personId, naam: p.naam, counts: {} });
    const acc = perPerson.get(p.personId).counts;
    for (const [c, n] of Object.entries(p.counts)) acc[c] = (acc[c] || 0) + n;
  }
  return [...perPerson.values()].sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
}

// 'pending' als er een open afrekenverzoek (voor alle aspi's) is, anders 'none'.
export function getAspiSettlementState() {
  return loadSettle().some((s) => s.status === 'pending') ? 'pending' : 'none';
}

// Aspileiding vraagt één afrekening aan voor álle aspi's. Geen dubbele verzoeken.
export async function requestAspiSettlement() {
  if (getAspiSettlementState() === 'pending') return null;
  const entry = {
    id: newId(), personId: 'ALL', status: 'pending',
    requestedAt: new Date().toISOString(), effectiveAt: null, resolvedAt: null, synced: false,
  };
  const all = loadSettle();
  all.push(entry);
  saveSettle(all);
  emit();
  scheduleSync();
  return entry;
}

// Voor de leiding-app: het open afrekenverzoek met de per-aspi schuld-snapshot
// die de drankleiding op 0 zou zetten.
export async function getPendingAspiSettlements() {
  const perPerson = await getAspiOutstanding();
  return loadSettle()
    .filter((s) => s.status === 'pending')
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
    .map((s) => ({ id: s.id, requestedAt: s.requestedAt, perPerson }));
}

function resolveSettlement(id, status, snapshot) {
  const all = loadSettle();
  const s = all.find((x) => x.id === id);
  if (!s) return;
  s.status = status;
  s.resolvedAt = new Date().toISOString();
  // Goedkeuren legt het watermerk op het moment van aanvragen: alles tot dan is
  // afgerekend, drankjes daarna blijven openstaan. We bewaren ook een snapshot
  // (wie hoeveel open had) voor het archief.
  if (status === 'approved') { s.effectiveAt = s.requestedAt; s.snapshot = snapshot || ''; }
  s.synced = false;
  saveSettle(all);
  emit();
  scheduleSync();
}

// Drankleiding beslist (bij goedkeuren geeft de UI de snapshot mee voor het archief).
export async function approveAspiSettlement(id, snapshot) { resolveSettlement(id, 'approved', snapshot); }
export async function rejectAspiSettlement(id) { resolveSettlement(id, 'rejected'); }

// Archief: goedgekeurde aspi-afrekeningen, nieuwste eerst, met datum van–tot
// (vorige afrekening → deze) en de snapshot van wie hoeveel open had.
export async function getAspiSettlementArchive() {
  const approved = loadSettle()
    .filter((s) => s.status === 'approved' && s.effectiveAt)
    .sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt)); // oudste eerst
  const out = [];
  let prev = null;
  for (const s of approved) {
    out.push({ id: s.id, from: prev, to: s.effectiveAt, snapshot: s.snapshot || '' });
    prev = s.effectiveAt;
  }
  return out.reverse(); // nieuwste eerst
}

// --- Afrekenperiodes (leiding) ---------------------------------------------
//
// De leiding rekent per PERIODE af (niet per kalendermaand). Een nieuwe periode
// starten archiveert de exporttekst + datums en legt een watermerk: de huidige
// periode begint bij het einde van de laatst afgesloten periode. Niets wordt
// gewist — alles telt vanaf dat watermerk (zoals de aspi-afrekening).

function loadPeriods() { return load(KEY_PERIODS, []); }
function savePeriods(arr) { save(KEY_PERIODS, arr); }

// Start van de huidige (open) periode = laatste end_at, of null (= vanaf het begin).
export function currentPeriodStart() {
  let m = null;
  for (const p of loadPeriods()) if (p.endAt && (!m || p.endAt > m)) m = p.endAt;
  return m;
}

// Actieve registraties sinds de periodestart (alle groepen — één frigo).
function activeSincePeriod() {
  const start = currentPeriodStart();
  return loadCons().filter((c) => c.status === 'actief' && (!start || c.tijdstip >= start));
}

export async function getTotalsForPeriod() {
  const totals = {};
  for (const c of activeSincePeriod()) {
    totals[c.personId] = totals[c.personId] || {};
    totals[c.personId][c.drinkCode] = (totals[c.personId][c.drinkCode] || 0) + (c.aantal ?? 1);
  }
  return totals;
}

export async function getCountsForPersonPeriod(personId) {
  const counts = {};
  for (const c of activeSincePeriod()) {
    if (c.personId === personId) counts[c.drinkCode] = (counts[c.drinkCode] || 0) + (c.aantal ?? 1);
  }
  return counts;
}

// Actieve tellingen van één persoon sinds een tijdstip (voor de 'vandaag'-teller).
export async function getCountsForPersonSince(personId, sinceISO) {
  const counts = {};
  for (const c of loadCons()) {
    if (c.personId === personId && c.status === 'actief' && c.tijdstip >= sinceISO) {
      counts[c.drinkCode] = (counts[c.drinkCode] || 0) + (c.aantal ?? 1);
    }
  }
  return counts;
}

// Voor de zwerf: alle actieve registraties sinds de periodestart.
export async function getConsumptionsForPeriod() { return activeSincePeriod(); }

// Volledig logboek van de periode (alle statussen), nieuwste eerst.
export async function getLogForPeriod() {
  const start = currentPeriodStart();
  return loadCons()
    .filter((c) => !start || c.tijdstip >= start)
    .sort((a, b) => b.tijdstip.localeCompare(a.tijdstip))
    .map((c) => ({
      id: c.id,
      personId: c.personId,
      persoon: memberName(c.personId),
      groep: memberGroup(c.personId),
      door: c.registeredBy !== c.personId ? memberName(c.registeredBy) : null,
      drinkCode: c.drinkCode,
      tijdstip: c.tijdstip,
      status: c.status,
      aantal: c.aantal ?? 1,
    }));
}

// Host haalt er één weg binnen de periode: de meest recente actieve.
export async function hostRemoveOnePeriod(personId, drinkCode) {
  const start = currentPeriodStart();
  const all = loadCons();
  const cands = all
    .filter((c) => c.personId === personId && c.drinkCode === drinkCode && c.status === 'actief' && (!start || c.tijdstip >= start))
    .sort((a, b) => b.tijdstip.localeCompare(a.tijdstip));
  if (!cands.length) return false;
  const target = cands[0];
  if (!target.synced) saveCons(all.filter((c) => c.id !== target.id));
  else { target.status = 'verwijderd'; target.synced = false; saveCons(all); }
  emit();
  scheduleSync();
  return true;
}

// Afgesloten periodes, nieuwste eerst.
export async function getPeriods() {
  return loadPeriods().slice().sort((a, b) => b.endAt.localeCompare(a.endAt));
}

function earliestActiveTijdstip() {
  let min = null;
  for (const c of loadCons()) if (c.status === 'actief' && (!min || c.tijdstip < min)) min = c.tijdstip;
  return min;
}

// Sluit de huidige periode af: archiveer de exporttekst + datums en wis de
// voorraad (de nieuwe periode begint leeg). De drankregistraties blijven staan.
export async function startNewPeriod(exportText) {
  const now = new Date().toISOString();
  const entry = {
    id: newId(),
    startAt: currentPeriodStart() || earliestActiveTijdstip() || now,
    endAt: now,
    exportText: exportText || '',
    synced: false,
  };
  const all = loadPeriods();
  all.push(entry);
  savePeriods(all);
  await clearCurrentStock();
  emit();
  scheduleSync();
  return entry;
}

// Periodes synchroniseren (pushen + ophalen), net als de aspi-afrekeningen.
export async function syncPeriods() {
  if (!api.isConfigured() || !navigator.onLine) return;
  try {
    const toPush = loadPeriods().filter((p) => !p.synced);
    if (toPush.length) await api.pushPeriods(toPush);
    const pushedIds = new Set(toPush.map((p) => p.id));
    const server = await api.fetchPeriods();
    const local = loadPeriods();
    const byId = new Map(local.map((p) => [p.id, p]));
    for (const p of local) if (pushedIds.has(p.id)) p.synced = true;
    for (const row of server) {
      const cur = byId.get(row.id);
      if (!cur) { local.push(row); byId.set(row.id, row); }
      else if (cur.synced) Object.assign(cur, row); // server leidend
    }
    savePeriods(local);
  } catch (e) { console.warn('periodes sync mislukt:', e.message); }
}

// --- Voorraad --------------------------------------------------------------

export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function loadStock() { return load(KEY_STOCK, {}); }

// -> { p: { in: 200, rest: 12 }, ... } voor de gevraagde maand
export async function getStock(maand) {
  const store = loadStock();
  const out = {};
  for (const [k, v] of Object.entries(store)) {
    const [mnd, code, type] = k.split('|');
    if (mnd !== maand) continue;
    out[code] = out[code] || {};
    out[code][type] = v;
  }
  return out;
}

export async function setStock(maand, drinkCode, type, aantal) {
  const store = loadStock();
  store[`${maand}|${drinkCode}|${type}`] = aantal;
  save(KEY_STOCK, store);
  emit();
  if (api.isConfigured() && navigator.onLine) {
    try { await api.upsertStock({ drinkCode, type, aantal, maand }); }
    catch (e) { console.warn('voorraad opslaan mislukt:', e.message); }
  }
}

export async function syncStock(maand) {
  if (!api.isConfigured() || !navigator.onLine) return;
  try {
    const rows = await api.fetchStock(maand);
    const store = loadStock();
    for (const r of rows) store[`${r.maand}|${r.drink_code}|${r.type}`] = r.aantal;
    save(KEY_STOCK, store);
  } catch (e) { console.warn('voorraad ophalen mislukt:', e.message); }
}

// Voorraad van de huidige periode wissen (bij het starten van een nieuwe periode).
async function clearCurrentStock() {
  const store = loadStock();
  for (const k of Object.keys(store)) if (k.startsWith(`${STOCK_KEY}|`)) delete store[k];
  save(KEY_STOCK, store);
  if (api.isConfigured() && navigator.onLine) {
    try { await api.deleteStockByMaand(STOCK_KEY); }
    catch (e) { console.warn('voorraad wissen mislukt:', e.message); }
  }
}

// Aspi-schulden synchroniseren: open/afgehandelde afrekeningen pushen + ophalen,
// en de cross-maand cache met actieve aspi-registraties verversen. Klein in
// volume (een handvol aspi's), dus dit mag bij elke sync mee.
export async function syncAspi() {
  if (!api.isConfigured() || !navigator.onLine) return;
  try {
    const toPush = loadSettle().filter((s) => !s.synced);
    if (toPush.length) await api.pushSettlements(toPush);
    const pushedIds = new Set(toPush.map((s) => s.id));

    const server = await api.fetchSettlements();
    const local = loadSettle();
    const byId = new Map(local.map((s) => [s.id, s]));
    for (const s of local) if (pushedIds.has(s.id)) s.synced = true;
    for (const row of server) {
      const cur = byId.get(row.id);
      if (!cur) { local.push(row); byId.set(row.id, row); }
      else if (cur.synced) Object.assign(cur, row); // server leidend
    }
    saveSettle(local);

    save(KEY_ASPI_CONS, await api.fetchAspiConsumptions(aspiIds()));
  } catch (e) { console.warn('aspi-schulden sync mislukt:', e.message); }
}

// --- Sync ------------------------------------------------------------------

let syncing = false;
let syncTimer = null;
let resetting = false; // true terwijl een volledige reset loopt: blokkeert syncs
let resetToken = 0;    // bumpt bij elke reset; maakt een lopende sync ongeldig

function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, 400); }

export function getPendingCount() { return loadCons().filter((c) => !c.synced).length; }

function monthBounds(date = new Date()) {
  return {
    from: new Date(date.getFullYear(), date.getMonth(), 1).toISOString(),
    to: new Date(date.getFullYear(), date.getMonth() + 1, 1).toISOString(),
  };
}

export async function syncNow() {
  if (syncing || resetting || !api.isConfigured() || !navigator.onLine) return;
  syncing = true;
  const token = resetToken; // als er tijdens deze sync gereset wordt, niets terugschrijven
  try {
    // 1) Pushen wat nog niet gesynct is (adds, verwijderingen, statuswijzigingen).
    const toPush = loadCons().filter((c) => !c.synced);
    if (toPush.length) await api.pushConsumptions(toPush);
    const pushedIds = new Set(toPush.map((c) => c.id));

    // 2) Ophalen wat anderen deze maand deden.
    const { from, to } = monthBounds();
    const server = await api.fetchRange(from, to);

    // Werd er tijdens deze sync gereset? Dan is onze in-memory data verouderd:
    // stoppen zonder iets weg te schrijven (anders zetten we de gewiste data terug).
    if (token !== resetToken) return;

    // 3) Opnieuw inladen vóór het wegschrijven: zo behouden we registraties die
    //    TIJDENS de sync zijn toegevoegd (anders gaat een tik tijdens het
    //    syncen verloren — kritisch bij slecht bereik in de kelder).
    const all = loadCons();
    const byId = new Map(all.map((c) => [c.id, c]));
    for (const c of all) if (pushedIds.has(c.id)) c.synced = true;
    for (const row of server) {
      const local = byId.get(row.id);
      if (!local) { all.push(row); byId.set(row.id, row); }
      else if (local.synced) { local.status = row.status; } // server is leidend
    }

    saveCons(all);
    await syncStock(STOCK_KEY);
    await syncAspi();
    await syncPeriods();
    await syncConfig();
    emit();
  } catch (err) {
    console.warn('sync mislukt, opnieuw bij volgende poging:', err.message);
  } finally {
    syncing = false;
  }
}

// Haal de gedeelde pincode + epoch op. Trek host-modus in als de drankleiding de
// pincode wijzigde (epoch veranderde), behalve op het toestel van de drankleiding.
async function syncConfig() {
  try {
    const cfg = await api.fetchAppConfig();
    if (!cfg) return;
    // Beide codes cachen voor weergave aan de drankleiding (leiding-app).
    if (cfg.host_pin != null || cfg.aspi_pin != null) {
      const prev = load(KEY_PINS, {});
      save(KEY_PINS, {
        leiding: cfg.host_pin != null ? cfg.host_pin : prev.leiding,
        aspi: cfg.aspi_pin != null ? cfg.aspi_pin : prev.aspi,
      });
    }
    const isAspi = currentGroup() === 'aspi';
    const pin = isAspi ? cfg.aspi_pin : cfg.host_pin;
    const epoch = isAspi ? cfg.aspi_epoch : cfg.host_epoch;
    if (pin == null || epoch == null) return; // kolom bestaat (nog) niet -> standaard houden
    save(KEY_PIN, pin);
    save(KEY_EPOCH_SERVER, epoch);
    if (!isHostUnlocked()) return;
    const me = curUser();
    if (isSuperAdmin(me)) { save(KEY_HOST_EPOCH, epoch); return; } // drankleiding blijft
    const localEpoch = load(KEY_HOST_EPOCH, null);
    if (localEpoch == null) { save(KEY_HOST_EPOCH, epoch); return; } // bestaande host meenemen
    if (localEpoch !== epoch) lockHost(); // pincode gewijzigd -> uitloggen als host
  } catch { /* tabel app_config bestaat (nog) niet -> stil overslaan */ }
}

// Volledige reset: alle registraties én voorraad wissen (cloud + lokaal).
// Gecoördineerd met de auto-sync: nieuwe syncs worden geblokkeerd (resetting),
// een lopende sync wordt ongeldig (resetToken) zodat hij niets terugschrijft, en
// we wachten eerst tot een actieve sync klaar is — zo kan de zopas gewiste data
// niet door een sync teruggezet worden op dit toestel.
export async function resetAll() {
  if (!api.isConfigured() || !navigator.onLine) {
    throw new Error('offline'); // reset moet de cloud raken, anders synct alles terug
  }
  resetting = true;  // blokkeer nieuwe syncs
  resetToken++;      // maak een eventueel lopende sync ongeldig
  try {
    // Wacht tot een lopende sync klaar is (max ~3s), zodat een push niet net na
    // het wissen alsnog rijen terugzet.
    for (let i = 0; i < 30 && syncing; i++) await new Promise((r) => setTimeout(r, 100));
    await api.deleteAllConsumptions();
    await api.deleteAllStock();
    await api.deleteAllSettlements();
    await api.deleteAllPeriods();
    localStorage.removeItem(KEY_CONS);
    localStorage.removeItem(KEY_STOCK);
    localStorage.removeItem(KEY_SEEN);
    localStorage.removeItem(KEY_ASPI_CONS);
    localStorage.removeItem(KEY_SETTLE);
    localStorage.removeItem(KEY_PERIODS);
    emit();
  } finally {
    resetting = false; // syncs weer toelaten
  }
}

export function init() {
  window.addEventListener('online', syncNow);
  setInterval(() => { if (navigator.onLine) syncNow(); }, 20_000);
  syncNow();
}
