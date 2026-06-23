// Dunne wrapper rond de Supabase REST-API (PostgREST). Geen bibliotheek nodig.
// Vertaalt tussen onze camelCase-objecten en de snake_case-kolommen in de DB.

import { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from './config.js';

export { isConfigured };

const REST = () => `${SUPABASE_URL}/rest/v1/consumptions`;
const STOCK = () => `${SUPABASE_URL}/rest/v1/stock_entries`;
const CONFIG = () => `${SUPABASE_URL}/rest/v1/app_config`;

function headers(extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function toRow(c) {
  return {
    id: c.id,
    person_id: c.personId,
    registered_by: c.registeredBy,
    drink_code: c.drinkCode,
    tijdstip: c.tijdstip,
    status: c.status,
  };
}

function fromRow(r) {
  return {
    id: r.id,
    personId: r.person_id,
    registeredBy: r.registered_by,
    drinkCode: r.drink_code,
    tijdstip: r.tijdstip,
    status: r.status,
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
    `?select=id,person_id,registered_by,drink_code,tijdstip,status` +
    `&tijdstip=gte.${encodeURIComponent(fromISO)}` +
    `&tijdstip=lt.${encodeURIComponent(toISO)}`;
  const res = await fetch(REST() + q, { headers: headers() });
  if (!res.ok) throw new Error(`fetch ${res.status}: ${await res.text()}`);
  return (await res.json()).map(fromRow);
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
