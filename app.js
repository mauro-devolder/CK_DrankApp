// Controller: schermwissels + alle interacties. Alle opslag loopt via store.js.

import { DRINKS, DRINK_BY_CODE, BULK, DRANKSPEL } from './members.js';
import * as store from './store.js';

// De aspi-app draait vanuit /aspi/, maar de foto's staan in de hoofdmap.
// window.ASSET_BASE ('../' in de aspi-app, leeg in de leiding-app) zet het recht.
function assetUrl(p) { return (typeof window !== 'undefined' && window.ASSET_BASE || '') + p; }

// Symbool voor een drank/knop: eigen foto als 'img' is ingevuld, anders de emoji.
function symbolHTML(item) {
  return item.img
    ? `<img class="drink-sym" src="${assetUrl(item.img)}" alt="">`
    : `<span class="drink-btn__emoji">${item.emoji}</span>`;
}

// Klein symbool voor lijstjes (voorraad, per persoon): foto of emoji, compact.
function rowSymHTML(item) {
  return item.img
    ? `<img class="row-sym" src="${assetUrl(item.img)}" alt="">`
    : `<span class="row-sym row-sym--emoji">${item.emoji}</span>`;
}

const UNDO_MS = 60_000; // venster om zelf te corrigeren zonder host

const screens = {
  onboarding: document.getElementById('screen-onboarding'),
  main: document.getElementById('screen-main'),
  overview: document.getElementById('screen-overview'),
  others: document.getElementById('screen-others'),
  postvak: document.getElementById('screen-postvak'),
  admin: document.getElementById('screen-admin'),
  settings: document.getElementById('screen-settings'),
  mylog: document.getElementById('screen-mylog'),
  drankspel: document.getElementById('screen-drankspel'),
};

function show(name) {
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
  window.scrollTo(0, 0);
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), 2200);
}

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

// Filter een personen-pick-lijst op naam (li.dataset.name). De selectie blijft:
// we verbergen enkel niet-passende rijen i.p.v. de lijst te herbouwen.
function wirePickSearch(inputId, listEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.value = '';
  input.oninput = () => {
    const q = input.value.trim().toLowerCase();
    for (const li of listEl.children) li.hidden = !!q && !(li.dataset.name || '').includes(q);
  };
}

const HOST_BADGE = '<span class="host-badge">drankleiding</span>';

// Toon een aantal netjes: heel getal zonder komma, anders met komma (max 2
// decimalen, nullen weg). Nodig sinds drankspel halve/decimale pinten kan geven.
function fmtAmount(n) {
  const r = Math.round(n * 100) / 100;
  if (Number.isInteger(r)) return String(r);
  return r.toFixed(2).replace(/0+$/, '').replace(/[.,]$/, '').replace('.', ',');
}

// Compacte telling zoals in de export: "3p 1f 2s" (vaste volgorde, nul weg).
function formatCounts(counts) {
  return DRINKS.filter((d) => counts[d.code]).map((d) => `${fmtAmount(counts[d.code])}${d.code}`).join(' ');
}

function fmtTime(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Enkel het uur: "22:17".
function fmtClock(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Enkel de datum: "23/06/2026".
function fmtDate(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// --- Onboarding ------------------------------------------------------------

async function renderOnboarding() {
  const members = await store.getMembers();
  const list = document.getElementById('member-list');
  const search = document.getElementById('member-search');

  function draw(filter = '') {
    const q = filter.trim().toLowerCase();
    list.innerHTML = '';
    for (const m of members) {
      if (q && !m.naam.toLowerCase().includes(q)) continue;
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = `<span>${m.naam}</span>` + (m.host ? HOST_BADGE : '');
      btn.addEventListener('click', () => chooseMember(m.id));
      li.appendChild(btn);
      list.appendChild(li);
    }
  }

  search.value = '';
  search.oninput = () => draw(search.value);
  draw();

  // Enkel in de aspi-app: inloggen als aspileiding (beheer-identiteit, code 7777).
  const leidingBtn = document.getElementById('login-aspileiding');
  if (leidingBtn) leidingBtn.onclick = loginAspileiding;

  show('onboarding');
}

// 'as1' = de aspileiding-identiteit uit members.js (leidingOnly).
async function loginAspileiding() {
  const pin = window.prompt('Code aspileiding:');
  if (pin == null) return;
  if (pin !== store.currentPin()) { toast('Foute code'); return; }
  await store.setCurrentUserId('as1');
  store.unlockHost();
  toast('Ingelogd als aspileiding');
  await renderMain();
}

async function chooseMember(id) {
  await store.setCurrentUserId(id);
  await renderMain();
  const m = await store.getMemberById(id);
  toast(`Hallo, ${m.naam}!`);
}

// --- Hoofdscherm -----------------------------------------------------------

let lastAction = null; // { id, timer }

async function renderMain() {
  const id = await store.getCurrentUserId();
  const me = await store.getMemberById(id);
  if (!me) return renderOnboarding();

  document.getElementById('current-name').textContent = me.naam;

  // De aspileiding is een beheer-identiteit: geen persoonlijke drankknoppen,
  // postvak of mijn-log — enkel beheer (via ⚙️) en het overzicht.
  const hostOnly = !!me.leidingOnly;
  // 'ANDERE' (bak/halve bak en alles wat daar later bij komt) is niet voor de
  // aspi's: in de aspi-app blijft die sectie volledig verborgen.
  const hideBulk = hostOnly || store.currentGroup() === 'aspi';

  document.getElementById('drink-grid').hidden = hostOnly;
  document.getElementById('go-others').hidden = hostOnly;
  document.getElementById('bulk-head').hidden = hideBulk;
  document.getElementById('bulk-row').hidden = hideBulk;
  document.getElementById('go-postvak').hidden = hostOnly;
  document.getElementById('go-mylog').hidden = hostOnly;
  // Gewone aspis zien geen stats (hun eigen log volstaat); de aspileiding wél
  // (die toont de stats sinds de laatste afrekening).
  document.getElementById('go-overview').hidden = store.currentGroup() === 'aspi' && !hostOnly;
  const hostLogWrap = document.getElementById('host-log-wrap');
  if (hostLogWrap) hostLogWrap.hidden = !hostOnly;

  if (!hostOnly) {
    const grid = document.getElementById('drink-grid');
    grid.innerHTML = '';
    for (const d of DRINKS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'drink-btn';
      btn.style.background = d.kleur;
      btn.dataset.code = d.code;
      btn.innerHTML = `${symbolHTML(d)}<span>${d.naam}</span>`;
      btn.addEventListener('click', () => registerDrink(d, btn));
      grid.appendChild(btn);
    }

    // Bak / halve bak: snelknoppen die meteen meerdere pinten op jezelf zetten.
    // Niet opbouwen in de aspi-app (sectie is daar verborgen).
    const bulkRow = document.getElementById('bulk-row');
    bulkRow.innerHTML = '';
    if (!hideBulk) {
      // Drankspel eerst (enkel leiding, want 'ANDERE' is verborgen in de aspi-app).
      // Opent een eigen scherm i.p.v. meteen op jezelf te zetten.
      const bp = document.createElement('button');
      bp.type = 'button';
      bp.className = 'bulk-btn';
      bp.innerHTML = `${symbolHTML(DRANKSPEL)}<span class="bulk-btn__name">${DRANKSPEL.naam}</span>`;
      bp.addEventListener('click', renderDrankspel);
      bulkRow.appendChild(bp);

      for (const b of BULK) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bulk-btn';
        btn.innerHTML =
          `${symbolHTML(b)}<span class="bulk-btn__name">${b.naam}</span>` +
          `<span class="bulk-btn__count">+${b.aantal}</span>`;
        btn.addEventListener('click', () => registerBulk(b, btn));
        bulkRow.appendChild(btn);
      }
    }
  }

  if (hostOnly) await renderHostLog();

  hideUndo();
  refreshBell();
  refreshSyncStatus();
  refreshGear();
  await refreshSelfTotal();
  show('main');
}

// Aspileiding-hoofdscherm: de log van álle aspi's per uur, sinds de laatste
// afrekening (na een reset is die leeg). Hergebruikt de gegroepeerde log-bouwer.
async function renderHostLog() {
  const wrap = document.getElementById('host-log-wrap');
  if (!wrap) return;
  buildGroupedLog(await store.getAspiLog(), document.getElementById('host-log'),
    document.getElementById('host-log-empty'), true);
  // Meest recente groep meteen open, zodat live-updates zichtbaar blijven.
  const first = wrap.querySelector('details');
  if (first) first.open = true;
}

function refreshGear() {
  document.getElementById('go-admin').hidden = !store.isHostUnlocked();
}

// --- Instellingen (naam tikken) --------------------------------------------

async function renderSettings() {
  const meId = await store.getCurrentUserId();
  const me = await store.getMemberById(meId);
  document.getElementById('settings-name').textContent = me ? me.naam : '—';
  const host = store.isHostUnlocked();
  document.getElementById('settings-hostlogin').hidden = host;
  document.getElementById('settings-hostlogout').hidden = !host;
  // Pincode wijzigen: enkel de drankleiding (Mauro), en enkel in host-modus.
  const canChangePin = host && store.isSuperAdmin(meId);
  document.getElementById('settings-changepin').hidden = !canChangePin;
  document.getElementById('settings-changepin-hint').hidden = !canChangePin;
  // Aspi-code wijzigen kan Mauro enkel vanuit de leiding-app (daar is hij drankleiding).
  const canChangeAspi = canChangePin && store.currentGroup() === 'leiding';
  document.getElementById('settings-changeaspipin').hidden = !canChangeAspi;
  // Subtiel: de drankleiding ziet de actuele codes onder de wijzig-knoppen.
  const codesEl = document.getElementById('settings-codes');
  if (canChangePin) {
    const pins = store.getKnownPins();
    codesEl.textContent = `Huidige codes — leiding: ${pins.leiding} · aspi: ${pins.aspi}`;
    codesEl.hidden = false;
  } else {
    codesEl.hidden = true;
  }
  show('settings');
}

async function doChangePin(targetGroup, label) {
  if (!askCode('Huidige code ter bevestiging:')) return;
  const np = window.prompt(`Nieuwe ${label} (3 tot 8 cijfers):`);
  if (np == null) return;
  const clean = np.trim();
  if (!/^\d{3,8}$/.test(clean)) { toast('Ongeldige pincode'); return; }
  try {
    await store.changePin(targetGroup, clean);
    toast('Pincode gewijzigd — andere toestellen uitgelogd');
    await renderMain();
  } catch (e) {
    toast('Wijzigen mislukt — internet nodig');
  }
}

// Pincode van déze app wijzigen (drankleiding).
async function settingsChangePin() { return doChangePin(store.currentGroup(), 'pincode'); }

// Vanuit de leiding-app kan Mauro ook de aspi-code (7777) wijzigen.
async function settingsChangeAspiPin() { return doChangePin('aspi', 'aspi-pincode'); }

function askCode(reden) {
  const pin = window.prompt(reden);
  if (pin == null) return false;
  if (pin !== store.currentPin()) { toast('Foute code'); return false; }
  return true;
}

async function settingsSwitch() {
  if (!askCode('Code drankleiding (om van persoon te wisselen):')) return;
  await renderOnboarding();
}

async function settingsHostLogin() {
  if (!askCode('Code drankleiding:')) return;
  store.unlockHost();
  toast('Drankleiding-modus aan');
  await renderMain();
}

async function settingsHostLogout() {
  store.lockHost();
  toast('Drankleiding-modus uit');
  await renderMain();
}

const TAP_GUARD_MS = 350; // dubbeltik-rem: zelfde knop niet 2x binnen deze tijd
const lastTap = {};

function tapFeedback(btn) {
  if (navigator.vibrate) navigator.vibrate(25); // trilling (Android; iOS negeert dit)
  btn.classList.remove('flash');
  void btn.offsetWidth; // herstart animatie
  btn.classList.add('flash');
}

async function registerDrink(drink, btn) {
  const now = Date.now();
  if (now - (lastTap[drink.code] || 0) < TAP_GUARD_MS) return; // per ongeluk dubbel? negeren
  lastTap[drink.code] = now;

  const me = await store.getCurrentUserId();
  const entry = await store.addConsumption({ personId: me, drinkCode: drink.code });
  tapFeedback(btn);
  showUndo(`✓ +1 ${drink.naam}`, [entry.id]);
}

// Bak (+24) / halve bak (+12): meteen meerdere pinten op jezelf.
async function registerBulk(bulk, btn) {
  const now = Date.now();
  if (now - (lastTap[bulk.id] || 0) < TAP_GUARD_MS) return;
  lastTap[bulk.id] = now;

  // Bevestiging: een bak/halve bak zet er veel ineens bij, dus geen toevallige tik.
  const drankNaam = DRINK_BY_CODE[bulk.code] ? DRINK_BY_CODE[bulk.code].naam.toLowerCase() : 'drankjes';
  if (!window.confirm(`${bulk.naam}: ${bulk.aantal} ${drankNaam} op jouw naam toevoegen?`)) return;

  const me = await store.getCurrentUserId();
  const entries = await store.addMany({ personId: me, drinkCode: bulk.code, aantal: bulk.aantal });
  tapFeedback(btn);
  const naam = DRINK_BY_CODE[bulk.code] ? DRINK_BY_CODE[bulk.code].naam : 'drankje';
  showUndo(`✓ +${bulk.aantal} ${naam} (${bulk.naam.toLowerCase()})`, entries.map((e) => e.id));
}

function showUndo(text, ids) {
  const bar = document.getElementById('undo-bar');
  document.getElementById('undo-text').textContent = text;
  bar.hidden = false;
  if (lastAction?.timer) clearTimeout(lastAction.timer);
  lastAction = { ids, timer: setTimeout(hideUndo, UNDO_MS) };
}

function hideUndo() {
  if (lastAction?.timer) clearTimeout(lastAction.timer);
  lastAction = null;
  document.getElementById('undo-bar').hidden = true;
}

async function undoLast() {
  if (!lastAction) return;
  for (const id of lastAction.ids) await store.removeConsumption(id);
  hideUndo();
  toast('Ongedaan gemaakt');
}

// --- Overzicht (iedereen) --------------------------------------------------

async function renderOverview() {
  const meId = await store.getCurrentUserId();
  const me = await store.getMemberById(meId);
  const list = document.getElementById('overview-list');
  const empty = document.getElementById('overview-empty');
  list.innerHTML = '';

  // Aspileiding: stats per aspi sinds de laatste afrekening (i.p.v. per maand).
  if (me && me.leidingOnly) {
    document.getElementById('overview-title').textContent = 'Sinds de laatste afrekening';
    const rows = (await store.getAspiOutstanding()).filter((r) => Object.keys(r.counts).length);
    empty.hidden = rows.length > 0;
    for (const r of rows) {
      const li = document.createElement('li');
      li.className = 'overview-row';
      li.innerHTML = `<span class="overview-row__name">${r.naam}</span>` +
        `<span class="overview-row__counts">${formatCounts(r.counts)}</span>`;
      list.appendChild(li);
    }
    show('overview');
    return;
  }

  const now = new Date();
  document.getElementById('overview-title').textContent = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  const totals = await store.getTotalsForMonth(now);

  const group = store.currentGroup();
  const rows = [];
  for (const [personId, counts] of Object.entries(totals)) {
    const m = await store.getMemberById(personId);
    if (!m || m.groep !== group || m.leidingOnly) continue; // enkel de eigen groep, geen beheer-identiteit
    rows.push({ naam: m.naam, personId, counts });
  }
  rows.sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));

  empty.hidden = rows.length > 0;
  for (const r of rows) {
    const li = document.createElement('li');
    li.className = 'overview-row' + (r.personId === meId ? ' is-me' : '');
    li.innerHTML = `<span class="overview-row__name">${r.naam}</span>` +
      `<span class="overview-row__counts">${formatCounts(r.counts)}</span>`;
    list.appendChild(li);
  }
  show('overview');
}

// --- Voor anderen (rondje) -------------------------------------------------

let othersDrink = null;
const othersPeople = new Set();

async function renderOthers() {
  othersDrink = null;
  othersPeople.clear();

  const drinkRow = document.getElementById('others-drinks');
  drinkRow.innerHTML = '';
  for (const d of DRINKS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = `${d.emoji} ${d.naam}`;
    b.addEventListener('click', () => {
      othersDrink = d;
      [...drinkRow.children].forEach((c) => { c.classList.remove('is-selected'); c.style.background = ''; });
      b.classList.add('is-selected');
      b.style.background = d.kleur;
      updateOthersSummary();
    });
    drinkRow.appendChild(b);
  }

  const meId = await store.getCurrentUserId();
  const members = await store.getMembers();
  const list = document.getElementById('others-people');
  list.innerHTML = '';
  for (const m of members) {
    if (m.id === meId) continue; // voor jezelf gebruik je het hoofdscherm
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span class="tick">✓</span><span>${m.naam}</span>` + (m.host ? HOST_BADGE : '');
    b.addEventListener('click', () => {
      if (othersPeople.has(m.id)) { othersPeople.delete(m.id); b.classList.remove('is-picked'); }
      else { othersPeople.add(m.id); b.classList.add('is-picked'); }
      updateOthersSummary();
    });
    const li = document.createElement('li');
    li.dataset.name = m.naam.toLowerCase();
    li.appendChild(b);
    list.appendChild(li);
  }

  wirePickSearch('others-search', list);
  updateOthersSummary();
  show('others');
}

function updateOthersSummary() {
  const summary = document.getElementById('others-summary');
  const confirm = document.getElementById('others-confirm');
  const n = othersPeople.size;
  if (!othersDrink) { summary.textContent = 'Kies een drankje'; confirm.disabled = true; confirm.textContent = 'Zet'; return; }
  if (n === 0) { summary.textContent = `${othersDrink.naam}: tik wie het krijgt`; confirm.disabled = true; confirm.textContent = 'Zet'; return; }
  summary.textContent = `${n}× ${othersDrink.naam}`;
  confirm.disabled = false;
  confirm.textContent = `Zet ${n}×`;
}

async function confirmOthers() {
  if (!othersDrink || othersPeople.size === 0) return;
  const me = await store.getCurrentUserId();
  const n = othersPeople.size;
  for (const pid of othersPeople) {
    await store.addConsumption({ personId: pid, drinkCode: othersDrink.code, registeredBy: me });
  }
  toast(`${n}× ${othersDrink.naam} gezet`);
  await renderMain();
}

// --- Drankspel (enkel leiding) ---------------------------------------------
// Flow: 1) aantal pinten kiezen, 2) wie meespeelt, 3) gelijk verdelen (standaard)
// of per persoon. Per-persoon-aandelen gaan in stappen van een halve pint.

let dsTotal = DRANKSPEL.defaultPints;     // gekozen aantal pinten voor het spel
const dsPlayers = new Set();              // wie meespeelt
let dsMode = 'equal';                     // 'equal' | 'each'
let dsPhase = 'select';                   // 'select' (pinten + spelers) | 'split' (verdelen)
const dsShares = new Map();               // personId -> aandeel (enkel in 'each')
const dsNames = new Map();                // personId -> naam (voor de per-persoon-rijen)

const roundHalf = (n) => Math.round(n * 2) / 2;
function dsEqualShare() { return dsPlayers.size ? roundHalf(dsTotal / dsPlayers.size) : 0; }

async function renderDrankspel() {
  dsTotal = DRANKSPEL.defaultPints;
  dsPlayers.clear();
  dsShares.clear();
  dsNames.clear();
  dsMode = 'equal';
  dsPhase = 'select';
  document.getElementById('ds-total').textContent = dsTotal;
  document.getElementById('ds-mode-equal').classList.add('is-active');
  document.getElementById('ds-mode-each').classList.remove('is-active');
  document.getElementById('ds-each').hidden = true;
  document.getElementById('ds-phase-select').hidden = false;
  document.getElementById('ds-phase-split').hidden = true;

  const members = await store.getMembers(); // de leiding speelt zelf mee, dus niemand uitsluiten
  const list = document.getElementById('drankspel-people');
  list.innerHTML = '';
  for (const m of members) {
    dsNames.set(m.id, m.naam);
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span class="tick">✓</span><span>${m.naam}</span>` + (m.host ? HOST_BADGE : '');
    b.addEventListener('click', () => {
      if (dsPlayers.has(m.id)) { dsPlayers.delete(m.id); dsShares.delete(m.id); b.classList.remove('is-picked'); }
      else { dsPlayers.add(m.id); if (dsMode === 'each') dsShares.set(m.id, dsEqualShare()); b.classList.add('is-picked'); }
      if (dsMode === 'each') renderDsEach();
      updateDrankspelSummary();
    });
    const li = document.createElement('li');
    li.dataset.name = m.naam.toLowerCase();
    li.appendChild(b);
    list.appendChild(li);
  }
  wirePickSearch('drankspel-search', list);
  updateDrankspelSummary();
  show('drankspel');
}

function setDsMode(mode) {
  dsMode = mode;
  document.getElementById('ds-mode-equal').classList.toggle('is-active', mode === 'equal');
  document.getElementById('ds-mode-each').classList.toggle('is-active', mode === 'each');
  const each = document.getElementById('ds-each');
  if (mode === 'each') {
    // Start de per-persoon-verdeling vanaf een gelijke verdeling.
    const share = dsEqualShare();
    dsShares.clear();
    for (const pid of dsPlayers) dsShares.set(pid, share);
    renderDsEach();
    each.hidden = false;
  } else {
    each.hidden = true;
  }
  updateDrankspelSummary();
}

function changeDsTotal(delta) {
  dsTotal = Math.max(1, dsTotal + delta);
  document.getElementById('ds-total').textContent = dsTotal;
  // In 'each' is het totaal enkel een richtgetal; de aandelen blijven manueel.
  updateDrankspelSummary();
}

// Wissel tussen fase 'select' (pinten + spelers) en 'split' (verdelen).
function setDsPhase(phase) {
  dsPhase = phase;
  document.getElementById('ds-phase-select').hidden = phase !== 'select';
  document.getElementById('ds-phase-split').hidden = phase !== 'split';
  if (phase === 'split') setDsMode('equal'); // standaard gelijk verdeeld (ververst ook de samenvatting)
  else updateDrankspelSummary();
  window.scrollTo(0, 0);
}

// Primaire knop onderaan: in 'select' = 'Volgende', in 'split' = 'Zet'.
function drankspelPrimary() {
  if (dsPhase === 'select') { if (dsPlayers.size) setDsPhase('split'); }
  else confirmDrankspel();
}

// Terug-pijl: vanuit 'split' terug naar 'select', anders het scherm verlaten.
function drankspelBack() {
  if (dsPhase === 'split') setDsPhase('select');
  else renderMain();
}

// Per-persoon-rijen: enkel de meespelers, elk met − [aandeel] + (stap 0,5).
function renderDsEach() {
  const wrap = document.getElementById('ds-each');
  wrap.innerHTML = '';
  for (const pid of dsPlayers) {
    const row = document.createElement('div');
    row.className = 'ds-row';
    const name = document.createElement('span');
    name.className = 'ds-row__name';
    name.textContent = dsNames.get(pid) || '?';
    const minus = document.createElement('button');
    minus.type = 'button'; minus.className = 'stepbtn'; minus.textContent = '−';
    minus.disabled = (dsShares.get(pid) || 0) <= 0;
    minus.addEventListener('click', () => { dsShares.set(pid, Math.max(0, (dsShares.get(pid) || 0) - 0.5)); renderDsEach(); updateDrankspelSummary(); });
    const val = document.createElement('span');
    val.className = 'ds-row__val'; val.textContent = fmtAmount(dsShares.get(pid) || 0);
    const plus = document.createElement('button');
    plus.type = 'button'; plus.className = 'stepbtn'; plus.textContent = '+';
    plus.addEventListener('click', () => { dsShares.set(pid, (dsShares.get(pid) || 0) + 0.5); renderDsEach(); updateDrankspelSummary(); });
    row.append(name, minus, val, plus);
    wrap.appendChild(row);
  }
}

function dsSum() { let s = 0; for (const pid of dsPlayers) s += (dsShares.get(pid) || 0); return s; }

function updateDrankspelSummary() {
  const summary = document.getElementById('drankspel-summary');
  const confirm = document.getElementById('drankspel-confirm');
  const n = dsPlayers.size;

  // Fase 1: pinten + spelers kiezen -> knop 'Volgende'.
  if (dsPhase === 'select') {
    confirm.textContent = 'Volgende';
    if (n === 0) { summary.textContent = 'Tik wie meespeelt'; confirm.disabled = true; }
    else { summary.textContent = `${n} ${n === 1 ? 'speler' : 'spelers'} · ${dsTotal} pinten`; confirm.disabled = false; }
    return;
  }

  // Fase 2: verdelen -> knop 'Zet'.
  if (dsMode === 'equal') {
    const per = dsTotal / n;
    summary.textContent = `${n} ${n === 1 ? 'speler' : 'spelers'} → ${fmtAmount(per)} pint elk`;
    confirm.disabled = n === 0;
    confirm.textContent = `Zet (${fmtAmount(per)}p p.p.)`;
  } else {
    const sum = dsSum();
    summary.textContent = `Verdeeld: ${fmtAmount(sum)} pint`;
    confirm.disabled = sum <= 0;
    confirm.textContent = `Zet (${fmtAmount(sum)}p)`;
  }
}

async function confirmDrankspel() {
  const n = dsPlayers.size;
  if (n === 0) return;
  const me = await store.getCurrentUserId();
  let shares;
  if (dsMode === 'equal') {
    const per = dsTotal / n;
    shares = [...dsPlayers].map((pid) => ({ personId: pid, aantal: per }));
  } else {
    shares = [...dsPlayers].map((pid) => ({ personId: pid, aantal: dsShares.get(pid) || 0 }));
  }
  const totaal = shares.reduce((s, x) => s + x.aantal, 0);
  const entries = await store.addDrankspel({ shares, registeredBy: me });
  await renderMain();
  showUndo(`✓ Drankspel: ${fmtAmount(totaal)} pint over ${n} ${n === 1 ? 'speler' : 'spelers'}`, entries.map((e) => e.id));
  toast('Drankspel gezet');
}

// --- Postvak ---------------------------------------------------------------

async function renderPostvak() {
  const notifs = await store.getNotifications();
  const list = document.getElementById('postvak-list');
  const empty = document.getElementById('postvak-empty');
  list.innerHTML = '';
  empty.hidden = notifs.length > 0;

  for (const n of notifs) {
    const drink = DRINK_BY_CODE[n.drinkCode];
    const li = document.createElement('li');
    li.className = 'overview-row notif';
    const aantal = n.aantal ?? 1;
    const bron = aantal !== 1 ? ' (drankspel)' : ''; // enkel een drankspel geeft een kommagetal
    const top = `<div class="notif__top">` +
      (n.seen ? '' : '<span class="unseen-dot"></span>') +
      `<span class="notif__main">${n.door} zette ${fmtAmount(aantal)} ${drink ? drink.naam : n.drinkCode} op jouw naam${bron}</span>` +
      `<span class="notif__time">${fmtTime(n.tijdstip)}</span></div>`;
    li.innerHTML = top;
    if (n.status === 'pending_delete') {
      const p = document.createElement('span');
      p.className = 'notif__pending';
      p.textContent = 'Verwijdering aangevraagd — wacht op drankleiding.';
      li.appendChild(p);
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'notif__btn';
      btn.textContent = 'Klopt niet — vraag verwijdering';
      btn.addEventListener('click', async () => { await store.requestDeletion(n.id); toast('Verzoek verstuurd'); renderPostvak(); });
      li.appendChild(btn);
    }
    list.appendChild(li);
  }
  show('postvak');
}

// --- Beheer (host) ---------------------------------------------------------

let adminDate = new Date();
let editPersonId = null;

// Het tandwiel is verborgen voor niet-hosts; openen vraagt dus geen code meer.
async function openAdmin() {
  if (!store.isHostUnlocked()) return;
  adminDate = new Date();
  // De aspi-app beheert de voorraad niet (één frigo, dat is voor de drankleiding).
  if (store.currentGroup() !== 'aspi') await store.syncStock('current');
  await store.syncAspi();    // verse schulden + afrekenverzoeken
  await store.syncPeriods(); // verse vorige-periodes
  await renderAdmin();
}

async function renderAdmin() {
  const aspi = store.currentGroup() === 'aspi';
  // Maandnavigatie enkel in de aspi-app; de leiding werkt per PERIODE.
  document.getElementById('month-prev').hidden = !aspi;
  document.getElementById('month-next').hidden = !aspi;
  if (aspi) {
    document.getElementById('admin-month').textContent = `${MONTHS[adminDate.getMonth()]} ${adminDate.getFullYear()}`;
  } else {
    const start = store.currentPeriodStart();
    document.getElementById('admin-month').textContent = start ? `Periode sinds ${fmtDate(start)}` : 'Huidige periode';
  }
  await renderAdminRequests();
  await renderAdminPersonEdit();
  document.getElementById('stock-card').hidden = aspi; // geen voorraad in de aspi-app
  if (!aspi) await renderAdminStock();
  const exportSum = document.getElementById('export-summary');
  if (exportSum) exportSum.textContent = aspi ? 'Openstaande schuld' : 'Afrekening & export';
  await renderAdminReport();
  await renderAdminLog();
  await renderAdminPersonSelect();
  await renderAspiSettlements(); // afrekenverzoeken goedkeuren (enkel drankleiding, leiding-app)
  await renderAspiArchive();     // vorige aspi-afrekeningen (aspi-app)
  await renderPeriods();         // vorige periodes (leiding-app)
  // 'Nieuwe periode starten' enkel in de leiding-app.
  const npCard = document.getElementById('new-period-card');
  if (npCard) npCard.hidden = aspi;
  // Reset enkel voor de super-admin (Mauro) — onbestaand in de aspi-app.
  document.getElementById('admin-reset-card').hidden = !store.isSuperAdmin(await store.getCurrentUserId());
  show('admin');
}

async function doResetAll() {
  if (!window.confirm('Alles resetten?\n\nAlle registraties én voorraad worden definitief gewist — voor iedereen, alle maanden. Dit kan niet ongedaan gemaakt worden.')) return;
  if (!askCode('Code drankleiding om de reset te bevestigen:')) return;
  try {
    await store.resetAll();
    toast('Alles is gereset');
    await renderAdmin();
  } catch (e) {
    toast('Reset mislukt — internet nodig');
  }
}

// Tellingen per persoon corrigeren.
async function renderAdminPersonEdit() {
  const sel = document.getElementById('edit-person');
  const members = await store.getMembers();
  const prev = editPersonId;
  sel.innerHTML = '';
  for (const m of members) {
    const o = document.createElement('option');
    o.value = m.id; o.textContent = m.naam + (m.host ? ' · drankleiding' : '');
    sel.appendChild(o);
  }
  editPersonId = (prev && members.some((m) => m.id === prev)) ? prev : (members[0] && members[0].id);
  sel.value = editPersonId;
  await renderEditRows();
}

async function renderEditRows() {
  const wrap = document.getElementById('edit-rows');
  wrap.innerHTML = '';
  if (!editPersonId) return;
  const leiding = store.currentGroup() === 'leiding';
  const counts = leiding
    ? await store.getCountsForPersonPeriod(editPersonId)
    : await store.getCountsForPerson(editPersonId, adminDate);
  for (const d of DRINKS) {
    const n = counts[d.code] || 0;
    const row = document.createElement('div');
    row.className = 'edit-row';
    row.innerHTML = `<span class="edit-row__name">${rowSymHTML(d)}${d.naam}</span>`;
    const minus = document.createElement('button');
    minus.type = 'button'; minus.className = 'stepbtn'; minus.textContent = '−'; minus.disabled = n <= 0;
    minus.addEventListener('click', () => leiding
      ? store.hostRemoveOnePeriod(editPersonId, d.code)
      : store.hostRemoveOne(editPersonId, d.code, adminDate));
    const cnt = document.createElement('span');
    cnt.className = 'edit-row__count'; cnt.textContent = fmtAmount(n);
    const plus = document.createElement('button');
    plus.type = 'button'; plus.className = 'stepbtn'; plus.textContent = '+';
    plus.addEventListener('click', () => store.hostAddOne(editPersonId, d.code));
    row.append(minus, cnt, plus);
    wrap.appendChild(row);
  }
}

// Een Chiro-"dag"/"week" begint om 08:00, zodat een drankje om 01:00 's nachts
// nog bij de dag/week ervoor hoort. Truc: schuif het tijdstip 8u terug.
const WEEKDAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

function chiroDayStart(t) {
  const d = new Date(t.getTime() - 8 * 3600 * 1000);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8, 0, 0, 0);
}
function dayStartMs(t) { return chiroDayStart(t).getTime(); }
function weekStartMs(t) {
  const ds = chiroDayStart(t);
  const back = (ds.getDay() + 6) % 7; // maandag = 0
  return new Date(ds.getFullYear(), ds.getMonth(), ds.getDate() - back, 8, 0, 0, 0).getTime();
}
function dayLabel(ms) {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}
function weekLabel(ms) {
  const s = new Date(ms), e = new Date(ms + 6 * 86400000);
  return `Week ${s.getDate()} ${MONTHS[s.getMonth()].slice(0, 3)} – ${e.getDate()} ${MONTHS[e.getMonth()].slice(0, 3)}`;
}

// Aggregeer een groep per persoon+drank en toon de tijdstippen eronder:
// "Suzanne · Pint ×3 — 22:17 · 22:34 · 23:01". Verwijderde drankjes komen als
// aparte, doorstreepte regel (met 🗑) zodat je ziet wat er weg is.
// showName=false laat de naam weg (voor één-persoon-logs).
function buildLogGroup(label, entries, showName = true) {
  const agg = new Map();
  for (const e of entries) {
    const del = e.status === 'verwijderd';
    const k = `${e.personId}|${e.drinkCode}|${del ? 'd' : 'a'}`;
    if (!agg.has(k)) agg.set(k, { persoon: e.persoon, code: e.drinkCode, del, times: [], n: 0 });
    agg.get(k).times.push(e.tijdstip);
    agg.get(k).n += (e.aantal ?? 1); // drankspel telt als kommagetal mee
  }
  const rows = [...agg.values()].sort((a, b) =>
    a.persoon.localeCompare(b.persoon, 'nl') ||
    (a.del - b.del) ||
    (DRINK_BY_CODE[a.code].order - DRINK_BY_CODE[b.code].order));

  // De badge telt enkel wat blijft staan (verwijderde niet meegerekend).
  const blijft = fmtAmount(entries.filter((e) => e.status !== 'verwijderd').reduce((s, e) => s + (e.aantal ?? 1), 0));

  const li = document.createElement('li');
  const det = document.createElement('details');
  const sum = document.createElement('summary');
  sum.className = 'log-sum';
  sum.innerHTML = `<span>${label}</span><span class="log-sum__count">${blijft}</span>`;
  det.appendChild(sum);
  const inner = document.createElement('div');
  inner.className = 'log-agg';
  for (const r of rows) {
    const d = DRINK_BY_CODE[r.code];
    r.times.sort(); // ISO-tekst sorteert chronologisch
    // Unieke uren: een bak (24 pinten in 1 tik) toont zo "11:47" i.p.v. 24×.
    const tijden = [...new Set(r.times.map(fmtClock))].join(' · ');
    const line = document.createElement('div');
    line.className = 'log-aggrow' + (r.del ? ' is-del' : '');
    line.innerHTML =
      `<div class="log-aggrow__head">` +
        (r.del ? '<span class="log-aggrow__del">🗑</span>' : '') +
        (showName ? `<span class="log-aggrow__name">${r.persoon}</span>` : '') +
        `<span class="log-aggrow__drink">${d ? d.naam : r.code}</span>` +
        `<span class="log-aggrow__n">×${fmtAmount(r.n)}</span>` +
      `</div>` +
      `<div class="log-times">${tijden}</div>`;
    inner.appendChild(line);
  }
  det.appendChild(inner);
  li.appendChild(det);
  return li;
}

// Huidige week per dag, vorige weken per week. Inklapbaar.
function buildGroupedLog(entries, listEl, emptyEl, showName = true) {
  listEl.innerHTML = '';
  emptyEl.hidden = entries.length > 0;
  const curWeek = weekStartMs(new Date());
  const days = new Map();   // huidige week → per dag
  const weeks = new Map();  // vorige weken → per week
  for (const e of entries) {
    const t = new Date(e.tijdstip);
    if (weekStartMs(t) === curWeek) {
      const dk = dayStartMs(t);
      (days.get(dk) || days.set(dk, []).get(dk)).push(e);
    } else {
      const wk = weekStartMs(t);
      (weeks.get(wk) || weeks.set(wk, []).get(wk)).push(e);
    }
  }
  for (const dk of [...days.keys()].sort((a, b) => b - a)) {
    listEl.appendChild(buildLogGroup(dayLabel(dk), days.get(dk), showName));
  }
  for (const wk of [...weeks.keys()].sort((a, b) => b - a)) {
    listEl.appendChild(buildLogGroup(weekLabel(wk), weeks.get(wk), showName));
  }
}

// Log-regels van een maand (incl. verwijderde, voor het tijdstip-overzicht),
// enkel voor de groep van déze app, optioneel voor één persoon.
async function fullLog(date, personId) {
  const group = store.currentGroup();
  let log = (await store.getLogForMonth(date)).filter((e) => e.groep === group);
  if (personId) log = log.filter((e) => e.personId === personId);
  return log;
}

// Log voor het Beheer-scherm: leiding = huidige PERIODE, aspi = gekozen maand.
async function adminLog(personId) {
  const group = store.currentGroup();
  let log = group === 'leiding' ? await store.getLogForPeriod() : await store.getLogForMonth(adminDate);
  log = log.filter((e) => e.groep === group);
  if (personId) log = log.filter((e) => e.personId === personId);
  return log;
}

async function renderAdminLog() {
  buildGroupedLog(await adminLog(), document.getElementById('admin-log'),
    document.getElementById('admin-log-empty'), true);
}

// Host: log van één gekozen persoon (controle of die zijn drankjes intikte).
let logPersonId = '';
async function renderAdminPersonSelect() {
  const sel = document.getElementById('log-person');
  const members = await store.getMembers();
  const prev = logPersonId;
  sel.innerHTML = '<option value="">Kies een persoon…</option>';
  for (const m of members) {
    const o = document.createElement('option');
    o.value = m.id; o.textContent = m.naam;
    sel.appendChild(o);
  }
  logPersonId = members.some((m) => m.id === prev) ? prev : '';
  sel.value = logPersonId;
  await renderAdminPersonLog();
}
async function renderAdminPersonLog() {
  const listEl = document.getElementById('admin-person-log');
  const emptyEl = document.getElementById('admin-person-log-empty');
  if (!logPersonId) {
    listEl.innerHTML = '';
    emptyEl.hidden = false;
    emptyEl.textContent = 'Kies een persoon om hun log te zien.';
    return;
  }
  emptyEl.textContent = 'Niets getikt.';
  buildGroupedLog(await adminLog(logPersonId), listEl, emptyEl, false);
}

// Persoonlijke log (iedereen): de eigen drankjes deze maand.
async function renderMyLog() {
  const me = await store.getCurrentUserId();
  buildGroupedLog(await fullLog(new Date(), me), document.getElementById('mylog-list'),
    document.getElementById('mylog-empty'), false);
  show('mylog');
}

async function renderAdminRequests() {
  const reqs = await store.getPendingDeletes();
  // Hele kaart verbergen als er niets openstaat — scheelt ruis in beheer.
  document.getElementById('admin-requests-card').hidden = reqs.length === 0;
  const list = document.getElementById('admin-requests');
  list.innerHTML = '';
  for (const r of reqs) {
    const drink = DRINK_BY_CODE[r.drinkCode];
    const li = document.createElement('li');
    li.className = 'overview-row request-row';
    li.innerHTML = `<div class="request-row__main">1 ${drink ? drink.naam : r.drinkCode} op <b>${r.voor}</b>` +
      `<br><small>gezet door ${r.door} · ${fmtTime(r.tijdstip)}</small></div>`;
    const ok = document.createElement('button');
    ok.className = 'btn-ok'; ok.textContent = 'Verwijder';
    ok.addEventListener('click', async () => { await store.approveDeletion(r.id); toast('Verwijderd'); renderAdmin(); });
    const no = document.createElement('button');
    no.className = 'btn-no'; no.textContent = 'Behoud';
    no.addEventListener('click', async () => { await store.rejectDeletion(r.id); toast('Behouden'); renderAdmin(); });
    li.appendChild(ok); li.appendChild(no);
    list.appendChild(li);
  }
}

async function renderAdminStock() {
  const stock = await store.getStock('current'); // voorraad hoort bij de huidige periode
  const grid = document.getElementById('admin-stock');
  grid.innerHTML = '';
  for (const d of DRINKS) {
    const s = stock[d.code] || {};
    const row = document.createElement('div');
    row.className = 'stock-row';
    row.innerHTML = `<span class="stock-row__name">${rowSymHTML(d)}${d.naam}</span>`;
    for (const type of ['in', 'rest']) {
      const label = document.createElement('label');
      const val = Number.isFinite(s[type]) ? s[type] : '';
      label.innerHTML = `${type}`;
      const input = document.createElement('input');
      input.type = 'number'; input.inputMode = 'numeric'; input.min = '0';
      input.value = val;
      input.addEventListener('change', async () => {
        const n = input.value === '' ? null : parseInt(input.value, 10);
        if (n == null || Number.isNaN(n)) return;
        await store.setStock('current', d.code, type, n);
        renderAdminReport();
      });
      label.appendChild(input);
      row.appendChild(label);
    }
    grid.appendChild(row);
  }
}

async function renderAdminReport() {
  const group = store.currentGroup();

  // Aspi-app: cumulatieve openstaande schuld i.p.v. een maandafrekening.
  if (group === 'aspi') { await renderAspiDebts(); return; }

  // Leiding-app: afrekening van de HUIDIGE PERIODE (sinds de laatste afrekening).
  const cons = await store.getConsumptionsForPeriod();
  const stock = await store.getStock('current');

  // 'registered' telt ALLE registraties (leiding + aspi) — nodig voor de zwerf,
  // want de ene frigo wordt door beide groepen leeggedronken. De lijst/export
  // tonen we enkel voor de eigen groep van deze app. 'aantal' (drankspel kan
  // decimaal zijn) telt mee i.p.v. rijen tellen.
  const perPerson = {};
  const registered = {};
  for (const c of cons) {
    registered[c.drinkCode] = (registered[c.drinkCode] || 0) + (c.aantal ?? 1);
    if (store.memberGroup(c.personId) !== group) continue;
    perPerson[c.personId] = perPerson[c.personId] || {};
    perPerson[c.personId][c.drinkCode] = (perPerson[c.personId][c.drinkCode] || 0) + (c.aantal ?? 1);
  }

  const list = document.getElementById('admin-overview');
  list.innerHTML = '';
  const rows = [];
  for (const [pid, counts] of Object.entries(perPerson)) {
    const m = await store.getMemberById(pid);
    rows.push({ naam: m ? m.naam : '??', counts });
  }
  rows.sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
  for (const r of rows) {
    const li = document.createElement('li');
    li.className = 'overview-row';
    li.innerHTML = `<span class="overview-row__name">${r.naam}</span>` +
      `<span class="overview-row__counts">${formatCounts(r.counts)}</span>`;
    list.appendChild(li);
  }

  const zline = document.getElementById('admin-zwerf');
  zline.hidden = false;

  // zwerf per drank (alleen waar in én rest ingevuld zijn), o.b.v. álle registraties
  const zwerf = {};
  let warn = false, hasStock = false;
  for (const d of DRINKS) {
    const s = stock[d.code];
    if (s && Number.isFinite(s.in) && Number.isFinite(s.rest)) {
      hasStock = true;
      // Afronden op 2 decimalen: drankspel maakt 'registered' decimaal, dus dit
      // voorkomt zwevende-komma-ruis (bv. 0,0000001) in de zwerf.
      const z = Math.round(((s.in - s.rest) - (registered[d.code] || 0)) * 100) / 100;
      if (z !== 0) zwerf[d.code] = z;
      if (z < 0) warn = true;
    }
  }
  zline.classList.toggle('warn', warn);
  if (!hasStock) zline.textContent = 'zwerf: vul de voorraad in om dit te berekenen';
  else zline.textContent = `zwerf: ${formatCounts(zwerf) || '—'}` + (warn ? '  ⚠ negatief = telfout in de voorraad' : '');

  // exporttekst
  const lines = rows.map((r) => `${r.naam} ${formatCounts(r.counts)}`);
  if (Object.keys(zwerf).length) lines.push(`zwerf ${formatCounts(zwerf)}`);
  document.getElementById('export-text').value = lines.join('\n');
}

async function copyExport() {
  const text = document.getElementById('export-text').value;
  try { await navigator.clipboard.writeText(text); toast('Gekopieerd'); }
  catch { document.getElementById('export-text').select(); toast('Selecteer en kopieer'); }
}

// --- Periodes (leiding) ----------------------------------------------------

async function doStartPeriod() {
  if (!window.confirm(
    'Nieuwe periode starten?\n\n' +
    'De huidige periode wordt afgesloten en bewaard onder "Vorige periodes"; ' +
    'de tellingen én de voorraad gaan naar 0. Kopieer eerst de export hierboven.')) return;
  if (!askCode('Code drankleiding om de nieuwe periode te starten:')) return;
  const text = document.getElementById('export-text').value;
  await store.startNewPeriod(text);
  toast('Nieuwe periode gestart');
  await renderAdmin();
}

// Archief van afgesloten periodes: datum van–tot + de exporttekst eronder.
async function renderPeriods() {
  const card = document.getElementById('periods-card');
  if (!card) return; // bestaat enkel in de leiding-app
  card.hidden = store.currentGroup() === 'aspi';
  const periods = await store.getPeriods();
  const list = document.getElementById('periods-list');
  const empty = document.getElementById('periods-empty');
  list.innerHTML = '';
  empty.hidden = periods.length > 0;
  for (const p of periods) {
    const li = document.createElement('li');
    const det = document.createElement('details');
    const sum = document.createElement('summary');
    sum.className = 'log-sum';
    sum.innerHTML = `<span>${fmtDate(p.startAt)} – ${fmtDate(p.endAt)}</span>`;
    det.appendChild(sum);
    const pre = document.createElement('pre');
    pre.className = 'period-export';
    pre.textContent = p.exportText || '(geen export)';
    det.appendChild(pre);
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'bigbtn bigbtn--ghost';
    copy.textContent = 'Kopieer';
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(p.exportText || ''); toast('Gekopieerd'); }
      catch { toast('Kopiëren mislukt'); }
    });
    det.appendChild(copy);
    li.appendChild(det);
    list.appendChild(li);
  }
}

// --- Aspi-schulden (aspi-app) ----------------------------------------------

// 'YYYY-MM' -> 'juni 2026'.
function monthName(key) {
  const [y, m] = key.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

// Openstaande schuld PER MAAND (zodat elke maand-zwerf de schuld van díe maand
// kan gebruiken), met onderaan één afrekenknop voor álle aspi's samen.
async function renderAspiDebts() {
  const months = await store.getAspiDebtsByMonth();

  const list = document.getElementById('aspi-debts');
  const empty = document.getElementById('aspi-debts-empty');
  list.innerHTML = '';
  const hasDebt = months.some((m) => m.perPerson.length);
  empty.hidden = hasDebt;

  for (const m of months) {
    const li = document.createElement('li');
    const det = document.createElement('details');
    det.open = true;
    const sum = document.createElement('summary');
    sum.className = 'log-sum';
    sum.innerHTML = `<span>${monthName(m.maand)}</span><span class="log-sum__count">${formatCounts(m.total)}</span>`;
    det.appendChild(sum);
    const inner = document.createElement('div');
    inner.className = 'log-agg';
    for (const p of m.perPerson) {
      const row = document.createElement('div');
      row.className = 'debt-personrow';
      row.innerHTML =
        `<span class="debt-row__name">${p.naam}</span>` +
        `<span class="debt-row__counts">${formatCounts(p.counts)}</span>`;
      inner.appendChild(row);
    }
    det.appendChild(inner);
    li.appendChild(det);
    list.appendChild(li);
  }

  // Eén afrekenknop voor álle aspi's (of de lopende-verzoek-melding).
  const area = document.getElementById('aspi-settle-area');
  area.innerHTML = '';
  if (hasDebt) {
    if (store.getAspiSettlementState() === 'pending') {
      const p = document.createElement('p');
      p.className = 'debt-row__pending';
      p.textContent = '⏳ Afrekening aangevraagd — wacht op de drankleiding';
      area.appendChild(p);
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bigbtn bigbtn--danger';
      btn.textContent = "Alle aspi's afrekenen — op 0 zetten";
      btn.addEventListener('click', requestSettlement);
      area.appendChild(btn);
    }
  }

  // Export = openstaande schuld per maand, per persoon.
  const lines = [];
  for (const m of months) {
    lines.push(`== ${monthName(m.maand)} ==`);
    for (const p of m.perPerson) lines.push(`${p.naam} ${formatCounts(p.counts)}`);
  }
  document.getElementById('export-text').value = lines.join('\n');
}

async function requestSettlement() {
  if (!window.confirm(
    "Afrekening aanvragen voor ÁLLE aspi's?\n\n" +
    'De drankleiding moet dit goedkeuren. Pas daarna telt iedereen weer van 0.')) return;
  await store.requestAspiSettlement();
  toast('Aangevraagd — wacht op goedkeuring drankleiding');
  renderAdmin();
}

// --- Aspi-afrekeningen goedkeuren (leiding-app, drankleiding) -----------------

async function renderAspiSettlements() {
  const card = document.getElementById('admin-aspi-settlements-card');
  if (!card) return; // bestaat enkel in de leiding-app
  const me = await store.getCurrentUserId();
  if (!store.isSuperAdmin(me)) { card.hidden = true; return; }

  const reqs = await store.getPendingAspiSettlements();
  card.hidden = reqs.length === 0;
  const list = document.getElementById('admin-aspi-settlements');
  list.innerHTML = '';
  for (const r of reqs) {
    const snapshot = r.perPerson.length
      ? r.perPerson.map((p) => `${p.naam}: ${formatCounts(p.counts)}`).join('<br>')
      : '—';
    const li = document.createElement('li');
    li.className = 'overview-row request-row';
    li.innerHTML =
      `<div class="request-row__main"><b>Alle aspi's afrekenen</b>` +
      `<br><small>aangevraagd ${fmtTime(r.requestedAt)}</small>` +
      `<div class="settle-snapshot">${snapshot}</div></div>`;
    const ok = document.createElement('button');
    ok.className = 'btn-ok'; ok.textContent = 'Goedkeuren';
    ok.addEventListener('click', async () => {
      if (!window.confirm(
        "Afrekening van alle aspi's goedkeuren?\n\n" +
        'Alle openstaande schulden worden op 0 gezet. Doe dit enkel als het geld binnen is.')) return;
      // Snapshot bewaren voor het archief "Vorige aspi-afrekeningen".
      const snapshot = r.perPerson.map((p) => `${p.naam} ${formatCounts(p.counts)}`).join('\n');
      await store.approveAspiSettlement(r.id, snapshot); toast('Goedgekeurd — alles op 0 gezet'); renderAdmin();
    });
    const no = document.createElement('button');
    no.className = 'btn-no'; no.textContent = 'Weiger';
    no.addEventListener('click', async () => { await store.rejectAspiSettlement(r.id); toast('Geweigerd'); renderAdmin(); });
    li.appendChild(ok); li.appendChild(no);
    list.appendChild(li);
  }
}

// Archief van afgesloten aspi-afrekeningen (aspi-app): datum van–tot + snapshot
// van wie hoeveel open had bij de afrekening.
async function renderAspiArchive() {
  const card = document.getElementById('aspi-archive-card');
  if (!card) return; // bestaat enkel in de aspi-app
  const arch = await store.getAspiSettlementArchive();
  const list = document.getElementById('aspi-archive-list');
  const empty = document.getElementById('aspi-archive-empty');
  list.innerHTML = '';
  empty.hidden = arch.length > 0;
  for (const a of arch) {
    const li = document.createElement('li');
    const det = document.createElement('details');
    const sum = document.createElement('summary');
    sum.className = 'log-sum';
    sum.innerHTML = `<span>${a.from ? `${fmtDate(a.from)} – ` : 'tot '}${fmtDate(a.to)}</span>`;
    det.appendChild(sum);
    const pre = document.createElement('pre');
    pre.className = 'period-export';
    pre.textContent = a.snapshot || '(geen detail bewaard)';
    det.appendChild(pre);
    li.appendChild(det);
    list.appendChild(li);
  }
}

function changeMonth(delta) {
  adminDate = new Date(adminDate.getFullYear(), adminDate.getMonth() + delta, 1);
  store.syncStock(store.monthKey(adminDate)).finally(renderAdmin);
}

// --- Gedeelde status -------------------------------------------------------

function refreshSyncStatus() {
  const pill = document.getElementById('sync-status');
  if (!store.isConfigured()) { pill.hidden = true; return; }
  const pending = store.getPendingCount();
  if (pending > 0) { pill.textContent = `⟳ ${pending}`; pill.classList.add('syncpill--pending'); pill.hidden = false; }
  else { pill.hidden = true; pill.classList.remove('syncpill--pending'); }
}

function refreshBell() {
  const badge = document.getElementById('bell-badge');
  const n = store.getUnseenNotificationCount();
  if (n > 0) { badge.textContent = n; badge.hidden = false; }
  else { badge.hidden = true; }
}

// Eigen lopende teller op het hoofdscherm: leiding = huidige periode, aspi = deze
// maand. Directe feedback ("klopt mijn tik?") zonder naar "Mijn log" te gaan.
async function refreshSelfTotal() {
  const el = document.getElementById('self-total');
  if (!el) return;
  const me = await store.getCurrentUserId();
  const m = await store.getMemberById(me);
  if (!m || m.leidingOnly) { el.hidden = true; return; } // aspileiding heeft geen eigen teller
  const counts = store.currentGroup() === 'leiding'
    ? await store.getCountsForPersonPeriod(me)
    : await store.getCountsForPerson(me, new Date());
  const txt = formatCounts(counts);
  el.textContent = txt ? `Jouw teller: ${txt}` : 'Jouw teller: nog niets';
  el.hidden = false;
}

// Live verversen wanneer er data van anderen binnenkomt (zonder het rondje- of
// onboardingscherm te verstoren, en zonder voorraad-invoervelden te clobberen).
store.subscribe(() => {
  refreshSyncStatus();
  refreshBell();
  refreshGear();
  if (!screens.overview.hidden) renderOverview();
  if (!screens.postvak.hidden) renderPostvak();
  // Log niet live verversen: zo blijven opengeklapte groepen open.
  if (!screens.admin.hidden) { renderAdminRequests(); renderEditRows(); renderAdminReport(); renderAspiSettlements(); renderPeriods(); }
  // Aspileiding-hoofdscherm: de live log van alle aspi's wél bijwerken.
  const hlw = document.getElementById('host-log-wrap');
  if (!screens.main.hidden && hlw && !hlw.hidden) renderHostLog();
  // Eigen teller live bijwerken op het hoofdscherm.
  if (!screens.main.hidden) refreshSelfTotal();
});

// --- Bedrading -------------------------------------------------------------

document.getElementById('undo-btn').addEventListener('click', undoLast);
document.getElementById('who-am-i').addEventListener('click', renderSettings);
document.getElementById('go-overview').addEventListener('click', renderOverview);
document.getElementById('go-mylog').addEventListener('click', renderMyLog);
document.getElementById('mylog-back').addEventListener('click', renderMain);
document.getElementById('log-person').addEventListener('change', (e) => { logPersonId = e.target.value; renderAdminPersonLog(); });
document.getElementById('back-main').addEventListener('click', renderMain);
document.getElementById('go-others').addEventListener('click', renderOthers);
document.getElementById('others-back').addEventListener('click', renderMain);
document.getElementById('others-confirm').addEventListener('click', confirmOthers);
document.getElementById('drankspel-back').addEventListener('click', drankspelBack);
document.getElementById('drankspel-confirm').addEventListener('click', drankspelPrimary);
document.getElementById('ds-minus').addEventListener('click', () => changeDsTotal(-1));
document.getElementById('ds-plus').addEventListener('click', () => changeDsTotal(1));
document.getElementById('ds-mode-equal').addEventListener('click', () => setDsMode('equal'));
document.getElementById('ds-mode-each').addEventListener('click', () => setDsMode('each'));
document.getElementById('go-postvak').addEventListener('click', async () => { await renderPostvak(); await store.markNotificationsSeen(); });
document.getElementById('postvak-back').addEventListener('click', renderMain);
document.getElementById('go-admin').addEventListener('click', openAdmin);
document.getElementById('admin-back').addEventListener('click', renderMain);
document.getElementById('copy-export').addEventListener('click', copyExport);
document.getElementById('month-prev').addEventListener('click', () => changeMonth(-1));
document.getElementById('month-next').addEventListener('click', () => changeMonth(1));
document.getElementById('settings-back').addEventListener('click', renderMain);
document.getElementById('settings-switch').addEventListener('click', settingsSwitch);
document.getElementById('settings-hostlogin').addEventListener('click', settingsHostLogin);
document.getElementById('settings-hostlogout').addEventListener('click', settingsHostLogout);
document.getElementById('settings-changepin').addEventListener('click', settingsChangePin);
document.getElementById('settings-changeaspipin').addEventListener('click', settingsChangeAspiPin);
document.getElementById('edit-person').addEventListener('change', (e) => { editPersonId = e.target.value; renderEditRows(); });
document.getElementById('reset-all').addEventListener('click', doResetAll);
const startPeriodBtn = document.getElementById('start-period'); // enkel in de leiding-app
if (startPeriodBtn) startPeriodBtn.addEventListener('click', doStartPeriod);

async function init() {
  // Vraag persistente opslag aan: vermindert dat iOS de offline-wachtrij en de
  // bewaarde naam wist als de app ~7 dagen niet geopend wordt.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  store.init();
  refreshSyncStatus();
  const id = await store.getCurrentUserId();
  if (id && (await store.getMemberById(id))) await renderMain();
  else await renderOnboarding();
}

init();

// Service worker (PWA/offline). Op localhost bewust uit: daar wil je bij het
// ontwikkelen altijd verse bestanden, geen caching die oude code vasthoudt.
const isLocalhost = ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator) {
  if (isLocalhost) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
  } else {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
