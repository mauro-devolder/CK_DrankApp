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
import { HOST_PIN } from './config.js';
import * as api from './api.js';

export const isConfigured = api.isConfigured;

const KEY_USER = 'drank.currentUserId';
const KEY_CONS = 'drank.consumptions';
const KEY_SEEN = 'drank.seenNotifs';
const KEY_STOCK = 'drank.stock';
const KEY_HOST = 'drank.hostUnlocked';
const KEY_PIN = 'drank.hostPin';            // gecachte server-pincode
const KEY_EPOCH_SERVER = 'drank.epochServer'; // laatst gekende server-epoch
const KEY_HOST_EPOCH = 'drank.hostEpoch';   // epoch waarop dit toestel host werd

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

// In welke modus draait deze build: 'leiding' (standaard) of 'aspi'. Het
// HTML-instappunt van de aspi-app zet window.APP_GROUP = 'aspi'; de gewone
// leiding-app laat het leeg en valt terug op 'leiding'.
export function currentGroup() {
  return (typeof window !== 'undefined' && window.APP_GROUP) || 'leiding';
}

// Enkel de leden van de groep van déze app. Naam-opzoeking (memberName,
// getMemberById) blijft over álle groepen werken, zodat registered_by altijd
// klopt — enkel de zichtbare lijsten zijn per groep gescheiden.
export async function getMembers() {
  const groep = currentGroup();
  return MEMBERS.filter((m) => m.actief && m.groep === groep);
}
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

// Huidige host-pincode (server-waarde indien gekend, anders de standaard).
export function currentPin() { return load(KEY_PIN, HOST_PIN); }

// Opper-host wijzigt de pincode: epoch +1 -> alle andere toestellen verliezen host.
export async function changeHostPin(newPin) {
  if (!api.isConfigured() || !navigator.onLine) throw new Error('offline');
  const newEpoch = load(KEY_EPOCH_SERVER, 1) + 1;
  await api.updateAppConfig(newPin, newEpoch);
  save(KEY_PIN, newPin);
  save(KEY_EPOCH_SERVER, newEpoch);
  save(KEY_HOST_EPOCH, newEpoch); // dit toestel (opper-host) blijft host
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
      drinkCode, tijdstip: new Date().toISOString(), status: 'actief', synced: false,
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

export async function getConsumptionsForMonth(date = new Date()) { return activeForMonth(date); }

export async function getTotalsForMonth(date = new Date()) {
  const totals = {};
  for (const c of activeForMonth(date)) {
    totals[c.personId] = totals[c.personId] || {};
    totals[c.personId][c.drinkCode] = (totals[c.personId][c.drinkCode] || 0) + 1;
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
      door: c.registeredBy !== c.personId ? memberName(c.registeredBy) : null,
      drinkCode: c.drinkCode,
      tijdstip: c.tijdstip,
      status: c.status,
    }));
}

// Actieve tellingen van één persoon in een maand: { p: 3, f: 1 }
export async function getCountsForPerson(personId, date = new Date()) {
  const counts = {};
  for (const c of activeForMonth(date)) {
    if (c.personId === personId) counts[c.drinkCode] = (counts[c.drinkCode] || 0) + 1;
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

// --- Sync ------------------------------------------------------------------

let syncing = false;
let syncTimer = null;

function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, 400); }

export function getPendingCount() { return loadCons().filter((c) => !c.synced).length; }

function monthBounds(date = new Date()) {
  return {
    from: new Date(date.getFullYear(), date.getMonth(), 1).toISOString(),
    to: new Date(date.getFullYear(), date.getMonth() + 1, 1).toISOString(),
  };
}

export async function syncNow() {
  if (syncing || !api.isConfigured() || !navigator.onLine) return;
  syncing = true;
  try {
    // 1) Pushen wat nog niet gesynct is (adds, verwijderingen, statuswijzigingen).
    const toPush = loadCons().filter((c) => !c.synced);
    if (toPush.length) await api.pushConsumptions(toPush);
    const pushedIds = new Set(toPush.map((c) => c.id));

    // 2) Ophalen wat anderen deze maand deden.
    const { from, to } = monthBounds();
    const server = await api.fetchRange(from, to);

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
    await syncStock(monthKey());
    await syncConfig();
    emit();
  } catch (err) {
    console.warn('sync mislukt, opnieuw bij volgende poging:', err.message);
  } finally {
    syncing = false;
  }
}

// Haal de gedeelde pincode + epoch op. Trek host-modus in als de opper-host de
// pincode wijzigde (epoch veranderde), behalve op het toestel van de opper-host.
async function syncConfig() {
  try {
    const cfg = await api.fetchAppConfig();
    if (!cfg) return;
    save(KEY_PIN, cfg.host_pin);
    save(KEY_EPOCH_SERVER, cfg.host_epoch);
    if (!isHostUnlocked()) return;
    const me = curUser();
    if (isSuperAdmin(me)) { save(KEY_HOST_EPOCH, cfg.host_epoch); return; } // opper-host blijft
    const localEpoch = load(KEY_HOST_EPOCH, null);
    if (localEpoch == null) { save(KEY_HOST_EPOCH, cfg.host_epoch); return; } // bestaande host meenemen
    if (localEpoch !== cfg.host_epoch) lockHost(); // pincode gewijzigd -> uitloggen als host
  } catch { /* tabel app_config bestaat (nog) niet -> stil overslaan */ }
}

// Volledige reset: alle registraties én voorraad wissen (cloud + lokaal).
export async function resetAll() {
  if (!api.isConfigured() || !navigator.onLine) {
    throw new Error('offline'); // reset moet de cloud raken, anders synct alles terug
  }
  await api.deleteAllConsumptions();
  await api.deleteAllStock();
  localStorage.removeItem(KEY_CONS);
  localStorage.removeItem(KEY_STOCK);
  localStorage.removeItem(KEY_SEEN);
  emit();
}

export function init() {
  window.addEventListener('online', syncNow);
  setInterval(() => { if (navigator.onLine) syncNow(); }, 20_000);
  syncNow();
}
