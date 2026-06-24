// Dunne wrapper rond de Supabase REST-API (PostgREST). Geen bibliotheek nodig.
// Vertaalt tussen onze camelCase-objecten en de snake_case-kolommen in de DB.

import { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from './config.js';

export { isConfigured };

const REST = () => `${SUPABASE_URL}/rest/v1/consumptions`;
const STOCK = () => `${SUPABASE_URL}/rest/v1/stock_entries`;
const CONFIG = () => `${SUPABASE_URL}/rest/v1/app_config`;
const SETTLE = () => `${SUPABASE_URL}/rest/v1/aspi_settlements`;
const PERIODS = () => `${SUPABASE_URL}/rest/v1/periods`;

function headers(extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function toRow(c) {
  const row = {
    id: c.id,
    person_id: c.personId,
    registered_by: c.registeredBy,
    drink_code: c.drinkCode,
    tijdstip: c.tijdstip,
    status: c.status,
  };
  // 'aantal' enkel meesturen als het afwijkt van 1 (drankspel). Zo blijven gewone
  // registraties werken ook als de 'aantal'-kolom nog niet in de DB bestaat; de
  // DB-default (1) vult de rest. Enkel drankspel vereist de nieuwe kolom.
  if (c.aantal != null && c.aantal !== 1) row.aantal = c.aantal;
  return row;
}

function fromRow(r) {
  return {
    id: r.id,
    personId: r.person_id,
    registeredBy: r.registered_by,
    drinkCode: r.drink_code,
    tijdstip: r.tijdstip,
    status: r.status,
    aantal: r.aantal == null ? 1 : Number(r.aantal),
    synced: true,
    deleted: false,
  };
}

// Upsert (insert met merge op primaire sleutel) — idempotent: hetzelfde id
// twee keer pushen levert nooit een dubbel op.
export async function pushConsumptions(items) {
  if (!items.length) return;
  const res = await fetch(REST(), {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(items.map(toRow)),
  });
  if (!res.ok) throw new Error(`push ${res.status}: ${await res.text()}`);
}

export async function deleteConsumptions(ids) {
  if (!ids.length) return;
  const list = ids.map(encodeURIComponent).join(',');
  const res = await fetch(`${REST()}?id=in.(${list})`, {
    method: 'DELETE',
    headers: headers({ Prefer: 'return=minimal' }),
  });
  if (!res.ok) throw new Error(`delete ${res.status}: ${await res.text()}`);
}

// Alle registraties in [from, to) — álle statussen, zodat verwijderverzoeken
// en goedkeuringen ook naar andere toestellen propageren.
export async function fetchRange(fromISO, toISO) {
  const q =
    `?select=*` +
    `&tijdstip=gte.${encodeURIComponent(fromISO)}` +
    `&tijdstip=lt.${encodeURIComponent(toISO)}`;
  const res = await fetch(REST() + q, { headers: headers() });
  if (!res.ok) throw new Error(`fetch ${res.status}: ${await res.text()}`);
  return (await res.json()).map(fromRow);
}

// Alle registraties (álle statussen) van een set personen (de aspi's), zónder
// maandgrens. Nodig voor de cumulatieve aspischuld (actieve rijen) én voor de
// aspi-log per uur (ook verwijderde rijen, doorstreept), beide over meerdere
// maanden heen.
export async function fetchAspiConsumptions(ids) {
  if (!ids || !ids.length) return [];
  const list = ids.map(encodeURIComponent).join(',');
  const q =
    `?select=*` +
    `&person_id=in.(${list})`;
  const res = await fetch(REST() + q, { headers: headers() });
  if (!res.ok) throw new Error(`aspi cons ${res.status}: ${await res.text()}`);
  return (await res.json()).map(fromRow);
}

// --- Aspi-afrekeningen (schuld op 0, met goedkeuring drankleiding) ----------

function settleToRow(s) {
  const row = {
    id: s.id,
    person_id: s.personId,
    status: s.status,
    requested_at: s.requestedAt,
    effective_at: s.effectiveAt ?? null,
    resolved_at: s.resolvedAt ?? null,
  };
  // 'snapshot' enkel meesturen als die er is (goedgekeurde afrekening). Zo blijven
  // gewone settlements werken ook als de 'snapshot'-kolom nog niet bestaat.
  if (s.snapshot != null) row.snapshot = s.snapshot;
  return row;
}
function settleFromRow(r) {
  return {
    id: r.id,
    personId: r.person_id,
    status: r.status,
    requestedAt: r.requested_at,
    effectiveAt: r.effective_at,
    resolvedAt: r.resolved_at,
    snapshot: r.snapshot ?? null,
    synced: true,
  };
}

export async function fetchSettlements() {
  // select=* zodat dit ook werkt vóór de 'snapshot'-kolom bestaat.
  const res = await fetch(SETTLE() + '?select=*', { headers: headers() });
  if (!res.ok) throw new Error(`settlements ${res.status}: ${await res.text()}`);
  return (await res.json()).map(settleFromRow);
}

// Upsert (merge op id) — idempotent, zoals de consumptions.
export async function pushSettlements(items) {
  if (!items.length) return;
  const res = await fetch(SETTLE(), {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(items.map(settleToRow)),
  });
  if (!res.ok) throw new Error(`settle push ${res.status}: ${await res.text()}`);
}

// --- Afrekenperiodes (leiding-app) -----------------------------------------

function periodToRow(p) {
  return { id: p.id, start_at: p.startAt, end_at: p.endAt, export_text: p.exportText ?? '' };
}
function periodFromRow(r) {
  return { id: r.id, startAt: r.start_at, endAt: r.end_at, exportText: r.export_text ?? '', synced: true };
}

export async function fetchPeriods() {
  const q = `?select=id,start_at,end_at,export_text`;
  const res = await fetch(PERIODS() + q, { headers: headers() });
  if (!res.ok) throw new Error(`periods ${res.status}: ${await res.text()}`);
  return (await res.json()).map(periodFromRow);
}

// Upsert (merge op id) — idempotent.
export async function pushPeriods(items) {
  if (!items.length) return;
  const res = await fetch(PERIODS(), {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(items.map(periodToRow)),
  });
  if (!res.ok) throw new Error(`period push ${res.status}: ${await res.text()}`);
}

// --- Voorraad --------------------------------------------------------------

export async function upsertStock({ drinkCode, type, aantal, maand }) {
  const res = await fetch(`${STOCK()}?on_conflict=drink_code,type,maand`, {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify([{ drink_code: drinkCode, type, aantal, maand }]),
  });
  if (!res.ok) throw new Error(`stock ${res.status}: ${await res.text()}`);
}

export async function fetchStock(maand) {
  const q = `?select=drink_code,type,aantal,maand&maand=eq.${encodeURIComponent(maand)}`;
  const res = await fetch(STOCK() + q, { headers: headers() });
  if (!res.ok) throw new Error(`stock fetch ${res.status}: ${await res.text()}`);
  return res.json();
}

// Alle voorraad-rijen van één sleutel wissen (bij het starten van een nieuwe periode).
export async function deleteStockByMaand(maand) {
  const res = await fetch(`${STOCK()}?maand=eq.${encodeURIComponent(maand)}`, {
    method: 'DELETE', headers: headers({ Prefer: 'return=minimal' }),
  });
  if (!res.ok) throw new Error(`stock del ${res.status}: ${await res.text()}`);
}

// --- Volledige reset (enkel super-admin) -----------------------------------

const ALL = 'id=neq.00000000-0000-0000-0000-000000000000'; // matcht alle rijen

export async function deleteAllConsumptions() {
  const res = await fetch(`${REST()}?${ALL}`, { method: 'DELETE', headers: headers({ Prefer: 'return=minimal' }) });
  if (!res.ok) throw new Error(`reset cons ${res.status}: ${await res.text()}`);
}

export async function deleteAllStock() {
  const res = await fetch(`${STOCK()}?${ALL}`, { method: 'DELETE', headers: headers({ Prefer: 'return=minimal' }) });
  if (!res.ok) throw new Error(`reset stock ${res.status}: ${await res.text()}`);
}

export async function deleteAllSettlements() {
  const res = await fetch(`${SETTLE()}?${ALL}`, { method: 'DELETE', headers: headers({ Prefer: 'return=minimal' }) });
  if (!res.ok) throw new Error(`reset settle ${res.status}: ${await res.text()}`);
}

export async function deleteAllPeriods() {
  const res = await fetch(`${PERIODS()}?${ALL}`, { method: 'DELETE', headers: headers({ Prefer: 'return=minimal' }) });
  if (!res.ok) throw new Error(`reset periods ${res.status}: ${await res.text()}`);
}

// --- App-config (host-pincode + epoch) -------------------------------------

export async function fetchAppConfig() {
  // Geen select -> alle kolommen, zodat dit ook werkt vóór de aspi-kolommen
  // bestaan (oudere databases): host_pin/host_epoch + aspi_pin/aspi_epoch.
  const res = await fetch(`${CONFIG()}?id=eq.1`, { headers: headers() });
  if (!res.ok) throw new Error(`config ${res.status}`);
  const rows = await res.json();
  return rows[0] || null;
}

// patch = { host_pin, host_epoch } of { aspi_pin, aspi_epoch }.
export async function updateAppConfig(patch) {
  const res = await fetch(`${CONFIG()}?id=eq.1`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`config update ${res.status}: ${await res.text()}`);
}
