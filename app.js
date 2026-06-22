// Controller: schermwissels + alle interacties. Alle opslag loopt via store.js.

import { DRINKS, DRINK_BY_CODE } from './members.js';
import { HOST_PIN } from './config.js';
import * as store from './store.js';

const UNDO_MS = 60_000; // venster om zelf te corrigeren zonder host

const screens = {
  onboarding: document.getElementById('screen-onboarding'),
  main: document.getElementById('screen-main'),
  overview: document.getElementById('screen-overview'),
  others: document.getElementById('screen-others'),
  postvak: document.getElementById('screen-postvak'),
  admin: document.getElementById('screen-admin'),
  settings: document.getElementById('screen-settings'),
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

// Compacte telling zoals in de export: "3p 1f 2s" (vaste volgorde, nul weg).
function formatCounts(counts) {
  return DRINKS.filter((d) => counts[d.code]).map((d) => `${counts[d.code]}${d.code}`).join(' ');
}

function fmtTime(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
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
      btn.textContent = m.naam;
      btn.addEventListener('click', () => chooseMember(m.id));
      li.appendChild(btn);
      list.appendChild(li);
    }
  }

  search.value = '';
  search.oninput = () => draw(search.value);
  draw();
  show('onboarding');
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

  const grid = document.getElementById('drink-grid');
  grid.innerHTML = '';
  for (const d of DRINKS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'drink-btn';
    btn.style.background = d.kleur;
    btn.dataset.code = d.code;
    btn.innerHTML = `<span class="drink-btn__emoji">${d.emoji}</span><span>${d.naam}</span>`;
    btn.addEventListener('click', () => registerDrink(d, btn));
    grid.appendChild(btn);
  }

  hideUndo();
  refreshBell();
  refreshSyncStatus();
  refreshGear();
  show('main');
}

function refreshGear() {
  document.getElementById('go-admin').hidden = !store.isHostUnlocked();
}

// --- Instellingen (naam tikken) --------------------------------------------

async function renderSettings() {
  const me = await store.getMemberById(await store.getCurrentUserId());
  document.getElementById('settings-name').textContent = me ? me.naam : '—';
  const host = store.isHostUnlocked();
  document.getElementById('settings-hostlogin').hidden = host;
  document.getElementById('settings-hostlogout').hidden = !host;
  show('settings');
}

function askCode(reden) {
  const pin = window.prompt(reden);
  if (pin == null) return false;
  if (pin !== HOST_PIN) { toast('Foute code'); return false; }
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

async function registerDrink(drink, btn) {
  const me = await store.getCurrentUserId();
  const entry = await store.addConsumption({ personId: me, drinkCode: drink.code });
  btn.classList.remove('flash');
  void btn.offsetWidth;
  btn.classList.add('flash');
  showUndo(`✓ +1 ${drink.naam}`, entry.id);
}

function showUndo(text, consumptionId) {
  const bar = document.getElementById('undo-bar');
  document.getElementById('undo-text').textContent = text;
  bar.hidden = false;
  if (lastAction?.timer) clearTimeout(lastAction.timer);
  lastAction = { id: consumptionId, timer: setTimeout(hideUndo, UNDO_MS) };
}

function hideUndo() {
  if (lastAction?.timer) clearTimeout(lastAction.timer);
  lastAction = null;
  document.getElementById('undo-bar').hidden = true;
}

async function undoLast() {
  if (!lastAction) return;
  await store.removeConsumption(lastAction.id);
  hideUndo();
  toast('Ongedaan gemaakt');
}

// --- Overzicht (iedereen) --------------------------------------------------

async function renderOverview() {
  const now = new Date();
  document.getElementById('overview-title').textContent = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  const totals = await store.getTotalsForMonth(now);
  const meId = await store.getCurrentUserId();
  const list = document.getElementById('overview-list');
  const empty = document.getElementById('overview-empty');
  list.innerHTML = '';

  const rows = [];
  for (const [personId, counts] of Object.entries(totals)) {
    const m = await store.getMemberById(personId);
    rows.push({ naam: m ? m.naam : '??', personId, counts });
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
    b.innerHTML = `<span class="tick">✓</span><span>${m.naam}</span>`;
    b.addEventListener('click', () => {
      if (othersPeople.has(m.id)) { othersPeople.delete(m.id); b.classList.remove('is-picked'); }
      else { othersPeople.add(m.id); b.classList.add('is-picked'); }
      updateOthersSummary();
    });
    const li = document.createElement('li');
    li.appendChild(b);
    list.appendChild(li);
  }

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
    const top = `<div class="notif__top">` +
      (n.seen ? '' : '<span class="unseen-dot"></span>') +
      `<span class="notif__main">${n.door} zette 1 ${drink ? drink.naam : n.drinkCode} op jouw naam</span>` +
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
  await store.syncStock(store.monthKey(adminDate));
  await renderAdmin();
}

async function renderAdmin() {
  document.getElementById('admin-month').textContent = `${MONTHS[adminDate.getMonth()]} ${adminDate.getFullYear()}`;
  await renderAdminRequests();
  await renderAdminPersonEdit();
  await renderAdminStock();
  await renderAdminReport();
  await renderAdminLog();
  show('admin');
}

// Tellingen per persoon corrigeren.
async function renderAdminPersonEdit() {
  const sel = document.getElementById('edit-person');
  const members = await store.getMembers();
  const prev = editPersonId;
  sel.innerHTML = '';
  for (const m of members) {
    const o = document.createElement('option');
    o.value = m.id; o.textContent = m.naam;
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
  const counts = await store.getCountsForPerson(editPersonId, adminDate);
  for (const d of DRINKS) {
    const n = counts[d.code] || 0;
    const row = document.createElement('div');
    row.className = 'edit-row';
    row.innerHTML = `<span class="edit-row__name">${d.emoji} ${d.naam}</span>`;
    const minus = document.createElement('button');
    minus.type = 'button'; minus.className = 'stepbtn'; minus.textContent = '−'; minus.disabled = n === 0;
    minus.addEventListener('click', () => store.hostRemoveOne(editPersonId, d.code, adminDate));
    const cnt = document.createElement('span');
    cnt.className = 'edit-row__count'; cnt.textContent = n;
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

// Aggregeer een groep tot één regel per persoon+drank: "Suzanne · Pint ×23".
function buildLogGroup(label, entries) {
  const agg = new Map();
  for (const e of entries) {
    const k = `${e.personId}|${e.drinkCode}`;
    if (!agg.has(k)) agg.set(k, { persoon: e.persoon, code: e.drinkCode, n: 0 });
    agg.get(k).n++;
  }
  const rows = [...agg.values()].sort((a, b) =>
    a.persoon.localeCompare(b.persoon, 'nl') ||
    (DRINK_BY_CODE[a.code].order - DRINK_BY_CODE[b.code].order));

  const li = document.createElement('li');
  const det = document.createElement('details');
  const sum = document.createElement('summary');
  sum.className = 'log-sum';
  sum.innerHTML = `<span>${label}</span><span class="log-sum__count">${entries.length}</span>`;
  det.appendChild(sum);
  const inner = document.createElement('div');
  inner.className = 'log-agg';
  for (const r of rows) {
    const d = DRINK_BY_CODE[r.code];
    const line = document.createElement('div');
    line.className = 'log-aggrow';
    line.innerHTML =
      `<span class="log-aggrow__name">${r.persoon}</span>` +
      `<span class="log-aggrow__drink">${d ? d.naam : r.code}</span>` +
      `<span class="log-aggrow__n">×${r.n}</span>`;
    inner.appendChild(line);
  }
  det.appendChild(inner);
  li.appendChild(det);
  return li;
}

// Logboek: huidige week per dag, vorige weken per week. Inklapbaar.
async function renderAdminLog() {
  const entries = (await store.getLogForMonth(adminDate)).filter((e) => e.status === 'actief');
  const list = document.getElementById('admin-log');
  const empty = document.getElementById('admin-log-empty');
  list.innerHTML = '';
  empty.hidden = entries.length > 0;

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
    list.appendChild(buildLogGroup(dayLabel(dk), days.get(dk)));
  }
  for (const wk of [...weeks.keys()].sort((a, b) => b - a)) {
    list.appendChild(buildLogGroup(weekLabel(wk), weeks.get(wk)));
  }
}

async function renderAdminRequests() {
  const reqs = await store.getPendingDeletes();
  const list = document.getElementById('admin-requests');
  const empty = document.getElementById('admin-requests-empty');
  list.innerHTML = '';
  empty.hidden = reqs.length > 0;
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
  const maand = store.monthKey(adminDate);
  const stock = await store.getStock(maand);
  const grid = document.getElementById('admin-stock');
  grid.innerHTML = '';
  for (const d of DRINKS) {
    const s = stock[d.code] || {};
    const row = document.createElement('div');
    row.className = 'stock-row';
    row.innerHTML = `<span class="stock-row__name">${d.emoji} ${d.naam}</span>`;
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
        await store.setStock(maand, d.code, type, n);
        renderAdminReport();
      });
      label.appendChild(input);
      row.appendChild(label);
    }
    grid.appendChild(row);
  }
}

async function renderAdminReport() {
  const cons = await store.getConsumptionsForMonth(adminDate);
  const maand = store.monthKey(adminDate);
  const stock = await store.getStock(maand);

  // per persoon + totaal geregistreerd per drank
  const perPerson = {};
  const registered = {};
  for (const c of cons) {
    perPerson[c.personId] = perPerson[c.personId] || {};
    perPerson[c.personId][c.drinkCode] = (perPerson[c.personId][c.drinkCode] || 0) + 1;
    registered[c.drinkCode] = (registered[c.drinkCode] || 0) + 1;
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

  // zwerf per drank (alleen waar in én rest ingevuld zijn)
  const zwerf = {};
  let warn = false, hasStock = false;
  for (const d of DRINKS) {
    const s = stock[d.code];
    if (s && Number.isFinite(s.in) && Number.isFinite(s.rest)) {
      hasStock = true;
      const z = (s.in - s.rest) - (registered[d.code] || 0);
      if (z !== 0) zwerf[d.code] = z;
      if (z < 0) warn = true;
    }
  }

  const zline = document.getElementById('admin-zwerf');
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

// Live verversen wanneer er data van anderen binnenkomt (zonder het rondje- of
// onboardingscherm te verstoren, en zonder voorraad-invoervelden te clobberen).
store.subscribe(() => {
  refreshSyncStatus();
  refreshBell();
  refreshGear();
  if (!screens.overview.hidden) renderOverview();
  if (!screens.postvak.hidden) renderPostvak();
  // Log niet live verversen: zo blijven opengeklapte groepen open.
  if (!screens.admin.hidden) { renderAdminRequests(); renderEditRows(); renderAdminReport(); }
});

// --- Bedrading -------------------------------------------------------------

document.getElementById('undo-btn').addEventListener('click', undoLast);
document.getElementById('who-am-i').addEventListener('click', renderSettings);
document.getElementById('go-overview').addEventListener('click', renderOverview);
document.getElementById('back-main').addEventListener('click', renderMain);
document.getElementById('go-others').addEventListener('click', renderOthers);
document.getElementById('others-back').addEventListener('click', renderMain);
document.getElementById('others-confirm').addEventListener('click', confirmOthers);
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
document.getElementById('edit-person').addEventListener('change', (e) => { editPersonId = e.target.value; renderEditRows(); });

async function init() {
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
