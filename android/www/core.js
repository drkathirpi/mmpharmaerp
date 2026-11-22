/* MM Pharma app - core: API, router, sheets, helpers. Talks to the ERPNext REST API only. */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = n => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const inr0 = n => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');
const cmp = n => { n = Number(n || 0); const a = Math.abs(n); return a >= 1e7 ? '₹' + (n / 1e7).toFixed(2) + ' Cr' : a >= 1e5 ? '₹' + (n / 1e5).toFixed(2) + ' L' : inr0(n); };
const num = n => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const today = () => iso(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const daysBetween = (a, b) => Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 864e5);
const fmtDate = s => { if (!s) return ''; const d = new Date(s + 'T00:00:00'); return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }); };
const debounce = (f, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const view = $('#view'), bar = $('#bar');
let S = {};
try { S = JSON.parse(localStorage.getItem('mm') || '{}'); } catch (e) { S = {}; }
const save = () => localStorage.setItem('mm', JSON.stringify(S));
const cacheGet = k => { try { return JSON.parse(localStorage.getItem('mmc_' + k)); } catch (e) { return null; } };
const cacheSet = (k, v) => { try { localStorage.setItem('mmc_' + k, JSON.stringify(v)); } catch (e) { /* full */ } };

/* theme */
function applyTheme() { document.documentElement.dataset.theme = S.theme || 'auto'; }
applyTheme();

/* icons (24px grid, 1.8 stroke) */
const P = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4V7zM3 7l9 4 9-4M12 11v10',
  users: 'M16 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 20v-1a4 4 0 00-3-3.9M16 4.1a3.5 3.5 0 010 6.8',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  plus: 'M12 5v14M5 12h14', search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5',
  back: 'M15 5l-7 7 7 7', chev: 'M9 5l7 7-7 7', x: 'M6 6l12 12M18 6L6 18',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z',
  chat: 'M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z', refresh: 'M20 12a8 8 0 10-2.3 5.7M20 4v6h-6',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2', trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  rupee: 'M7 5h10M7 9h10M7 5c5 0 7 2 7 4s-2 4-7 4l7 6', share: 'M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13',
  check: 'M5 12l5 5 9-10', moon: 'M20 14A8 8 0 1110 4a7 7 0 0010 10z', lock: 'M6 11h12v9H6zM8 11V8a4 4 0 018 0v3',
  out: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9', cart: 'M3 4h2l2.4 11h10l2-8H6M9 20a1 1 0 100-2 1 1 0 000 2zM17 20a1 1 0 100-2 1 1 0 000 2z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2', layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5', truck: 'M2 6h11v10H2zM13 9h4l3 3v4h-7M6 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  pill: 'M10.5 20.5a5 5 0 01-7-7l10-10a5 5 0 017 7l-10 10zM8.5 8.5l7 7', file: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
};
const ic = (n, s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[n]}"/></svg>`;

function toast(m, ms = 3000) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), ms); }
const skeleton = (n = 4) => `<div class="sec" aria-busy="true">${Array.from({ length: n }, () => '<div class="row"><div class="grow"><div class="sk" style="height:16px;width:62%;margin-bottom:8px"></div><div class="sk" style="height:12px;width:38%"></div></div><div class="sk" style="height:18px;width:64px"></div></div>').join('')}</div>`;
const empty = (t, s) => `<div class="empty"><b>${esc(t)}</b>${esc(s || '')}</div>`;
const errBox = e => `<div class="err"><b>${esc(e.title || 'Could not load this')}</b>${esc(e.message)}<div style="margin-top:12px"><button class="btn sm sec2" onclick="route()">Try again</button></div></div>`;

/* ---------- API ---------- */
async function api(path, o = {}) {
  const h = { Accept: 'application/json' };
  if (S.key && S.secret) h.Authorization = 'token ' + S.key + ':' + S.secret;
  let body;
  if (o.body !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(o.body); }
  let r;
  try { r = await fetch(S.url + path, { method: o.method || (body ? 'POST' : 'GET'), headers: h, body, credentials: 'include' }); }
  catch (e) { throw Object.assign(new Error('Check your internet connection and try again.'), { title: 'Cannot reach the server' }); }
  let j = {};
  try { j = await r.json(); } catch (e) { /* empty body */ }
  if (r.status === 401 || (r.status === 403 && !o.noauthcheck && !(await alive()))) throw Object.assign(new Error('Sign in again to continue.'), { auth: true, title: 'Session ended' });
  if (!r.ok) {
    let m = j.exception || j._error_message || r.statusText;
    try { m = JSON.parse(JSON.parse(j._server_messages)[0]).message || m; } catch (e) { /* keep */ }
    throw new Error(String(m).replace(/<[^>]+>/g, '').slice(0, 300));
  }
  return j.message !== undefined ? j.message : j.data !== undefined ? j.data : j;
}
async function alive() { try { const m = await api('/api/method/frappe.auth.get_logged_user', { noauthcheck: true }); return !!m && m !== 'Guest'; } catch (e) { return false; } }
const q = o => Object.entries(o).map(([k, v]) => k + '=' + encodeURIComponent(typeof v === 'string' ? v : JSON.stringify(v))).join('&');
const list = (doctype, p = {}) => api('/api/method/frappe.client.get_list?' + q({ doctype, limit_page_length: 50, ...p }));
const method = (m, p = {}) => api('/api/method/' + m + '?' + q(p));
const getDoc = (dt, name) => api('/api/resource/' + encodeURIComponent(dt) + '/' + encodeURIComponent(name));

/* ---------- sheets (bottom sheets that respect the back button) ---------- */
let sheetOpen = false;
function openSheet(title, html, mount) {
  closeSheet(true);
  const root = $('#sheetroot');
  root.innerHTML = `<div class="scrim"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="grab"></div><div class="sh-h"><h3>${esc(title)}</h3><button class="ib" aria-label="Close" data-close>${ic('x')}</button></div><div class="sh-b">${html}</div></div>`;
  requestAnimationFrame(() => { $('.scrim', root).classList.add('on'); $('.sheet', root).classList.add('on'); });
  $('.scrim', root).onclick = () => closeSheet();
  $('[data-close]', root).onclick = () => closeSheet();
  history.pushState({ sheet: 1 }, ''); sheetOpen = true;
  if (mount) mount($('.sh-b', root));
}
function hideSheet() { const root = $('#sheetroot'); sheetOpen = false; const s = $('.sheet', root); if (!s) return; s.classList.remove('on'); $('.scrim', root).classList.remove('on'); setTimeout(() => { if (!sheetOpen) root.innerHTML = ''; }, 250); }
function closeSheet(silent) { if (!sheetOpen) return; if (silent) { hideSheet(); history.back(); return; } history.back(); }
window.addEventListener('popstate', () => { if (sheetOpen) hideSheet(); });

/* ---------- router ---------- */
const routes = [];
const on = (re, fn, o = {}) => routes.push({ re, fn, ...o });
let current = null;
function go(path) { if (location.hash === '#' + path) route(); else location.hash = path; }
/* own back stack, so Back never closes the app from a sub screen */
const TOPRE = /^\/(home|stock|party|orders|more)(\/overdue)?$/;
let trail = [], popping = false;
function track() {
  const p = (location.hash || '#/home').slice(1);
  if (popping) { popping = false; return; }
  if (TOPRE.test(p)) trail = p === '/home' ? ['/home'] : ['/home', p];
  else if (trail[trail.length - 1] !== p) trail.push(p);
}
function back() {
  if (trail.length > 1) {
    trail.pop(); const p = trail[trail.length - 1];
    if (location.hash === '#' + p) route(); else { popping = true; location.hash = p; }
  } else if ((location.hash || '#/home') !== '#/home') { trail = ['/home']; popping = true; location.hash = '/home'; }
}
function hwBack() {
  if (sheetOpen) return closeSheet();
  if (!$('#lock').hidden) return;
  if (trail.length > 1 || (location.hash || '#/home') !== '#/home') return back();
  const A = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App; if (A) A.exitApp();
}
try { const A = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App; if (A) A.addListener('backButton', hwBack); } catch (e) { /* browser */ }
track();
window.addEventListener('hashchange', () => { if (sheetOpen) { sheetOpen = false; $('#sheetroot').innerHTML = ''; } track(); route(); });
async function route() {
  if (!S.url || !S.me) return loginView();
  const path = (location.hash || '#/home').slice(1);
  for (const r of routes) {
    const m = path.match(r.re);
    if (!m) continue;
    current = r;
    const top = !!r.tab;
    document.body.dataset.tab = r.tab || '';
    $('#tabs').hidden = !top; $('#fab').hidden = !(top && r.fab);
    if (r.fab) $('#fab').innerHTML = ic('plus', 22) + '<span>' + esc(r.fab) + '</span>';
    setBar(r.title || '', !top, r.action);
    drawTabs(r.tab);
    view.innerHTML = r.skel ? r.skel() : skeleton(5);
    window.scrollTo(0, 0);
    try { await r.fn(...m.slice(1).map(decodeURIComponent)); } catch (e) { if (e.auth) return loginView(e.message); view.innerHTML = errBox(e); }
    return;
  }
  go('/home');
}
function setBar(title, sub, action) {
  bar.className = sub ? 'sub' : '';
  bar.innerHTML = (sub ? `<button class="ib" aria-label="Back" id="bk">${ic('back')}</button>` : '') + `<h1 id="ttl">${esc(title)}</h1>` + (action || '') + `<button class="ib" aria-label="Refresh" id="rf">${ic('refresh', 20)}</button>`;
  if (sub) $('#bk').onclick = back;
  $('#rf').onclick = () => { memo.clear(); route(); };
}
const setTitle = t => { const e = $('#ttl'); if (e) e.textContent = t; };
const TABS = [['home', 'Home', 'home'], ['stock', 'Stock', 'box'], ['party', 'Parties', 'users'], ['orders', 'Orders', 'receipt'], ['more', 'More', 'grid']];
function drawTabs(active) {
  const badge = S.badge || {};
  $('#tabs').innerHTML = TABS.map(([k, l, i]) => `<button data-t="${k}" class="${k === active ? 'on' : ''}" aria-label="${l}" ${k === active ? 'aria-current="page"' : ''}><span class="pill">${ic(i)}</span>${l}${badge[k] ? `<span class="dot">${badge[k]}</span>` : ''}</button>`).join('');
  $$('#tabs button').forEach(b => b.onclick = () => go('/' + b.dataset.t));
}
function memoFn() {
  const m = new Map();
  const f = async (k, fn, ttl = 120000) => { const e = m.get(k); if (e && Date.now() - e.t < ttl) return e.v; const v = await fn(); m.set(k, { t: Date.now(), v }); return v; };
  f.clear = () => m.clear(); return f;
}
const memo = memoFn();

/* pull to refresh */
(() => {
  let y0 = null, dy = 0;
  document.addEventListener('touchstart', e => { y0 = window.scrollY <= 0 && !sheetOpen && current && current.tab ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
  document.addEventListener('touchmove', e => { if (y0 === null) return; dy = e.touches[0].clientY - y0; }, { passive: true });
  document.addEventListener('touchend', () => { if (y0 !== null && dy > 110) { toast('Refreshing…', 900); memo.clear(); route(); } y0 = null; });
})();

/* ---------- PIN lock ---------- */
const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('mmp:' + s)))].map(b => b.toString(16).padStart(2, '0')).join('');
function showLock() {
  if (!S.pin) return;
  const L = $('#lock'); L.hidden = false; let v = '';
  const draw = () => { L.innerHTML = `<div class="logo"></div><div class="mid">Enter PIN</div><div class="dots">${[0, 1, 2, 3].map(i => `<i class="${i < v.length ? 'f' : ''}"></i>`).join('')}</div><div class="pad9">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => k === '' ? '<span></span>' : `<button data-k="${k}">${k}</button>`).join('')}</div>`; $$('[data-k]', L).forEach(b => b.onclick = async () => { const k = b.dataset.k; if (k === '⌫') v = v.slice(0, -1); else if (v.length < 4) v += k; draw(); if (v.length === 4) { if (await sha(v) === S.pin) { L.hidden = true; } else { v = ''; toast('Wrong PIN'); draw(); } } }); };
  draw();
}
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => { if (document.hidden) hiddenAt = Date.now(); else if (S.pin && Date.now() - hiddenAt > 30000) showLock(); });

/* ---------- login ---------- */
function loginView(msg) {
  $('#tabs').hidden = true; $('#fab').hidden = true; bar.className = ''; bar.innerHTML = '';
  view.innerHTML = `<div class="login"><div class="logo"></div><h1>MM Pharma</h1><div class="mut" style="margin-bottom:24px">Sign in with your ERPNext account.</div>
    <label class="field" style="margin:0 0 12px"><input id="u" placeholder="Server address" value="${esc(S.url || 'https://erp.drkathiravan.uk')}" autocapitalize="none" inputmode="url" aria-label="Server address"></label>
    <label class="field" style="margin:0 0 12px"><input id="n" placeholder="Username or email" value="${esc(S.user || '')}" autocapitalize="none" autocomplete="username" aria-label="Username"></label>
    <label class="field" style="margin:0 0 8px"><input id="p" type="password" placeholder="Password" autocomplete="current-password" aria-label="Password"></label>
    <div class="red" id="lm" style="min-height:22px;margin-bottom:8px">${esc(msg || '')}</div>
    <button class="btn" id="go">Sign in</button>
    <details style="margin-top:20px"><summary class="mut" style="padding:8px 0">Sign in with an API key instead</summary>
      <label class="field" style="margin:8px 0"><input id="k" placeholder="API key" autocapitalize="none" aria-label="API key"></label>
      <label class="field" style="margin:0 0 12px"><input id="s" placeholder="API secret" autocapitalize="none" aria-label="API secret"></label>
      <button class="btn sec2" id="gk">Use API key</button></details></div>`;
  const fin = async () => {
    try { S.me = await method('frappe.auth.get_logged_user'); S.user = S.user || S.me; save(); await boot(); }
    catch (e) { $('#lm').textContent = 'Sign-in failed. ' + e.message; }
  };
  $('#go').onclick = async () => {
    S.url = $('#u').value.trim().replace(/\/+$/, ''); S.user = $('#n').value.trim(); S.key = S.secret = '';
    $('#go').disabled = true;
    try { await api('/api/method/login', { method: 'POST', body: { usr: S.user, pwd: $('#p').value } }); await fin(); }
    catch (e) { $('#lm').textContent = e.message; }
    if ($('#go')) $('#go').disabled = false;
  };
  $('#gk').onclick = async () => { S.url = $('#u').value.trim().replace(/\/+$/, ''); S.key = $('#k').value.trim(); S.secret = $('#s').value.trim(); await fin(); };
}
async function boot() {
  const c = await list('Company', { fields: ['name', 'abbr'], limit_page_length: 1 });
  S.company = c[0].name; S.abbr = c[0].abbr; save();
  route();
}
window.logout = () => { S.key = S.secret = ''; S.me = ''; save(); memo.clear(); fetch(S.url + '/api/method/logout').catch(() => 0); loginView(); };

/* ---------- shared widgets ---------- */
function stamp(exp, warehouse) {
  if (!exp) return '<span class="stamp na">No expiry</span>';
  const d = daysBetween(exp, today()), dt = new Date(exp + 'T00:00:00');
  const lab = 'Exp ' + String(dt.getMonth() + 1).padStart(2, '0') + '/' + String(dt.getFullYear()).slice(2);
  return `<span class="stamp ${d < 0 ? 'exp' : d <= 30 ? 'n30' : d <= 90 ? 'n90' : 'ok'}" title="${d} days">${lab}</span>`;
}
const BUCKETS = [['Not due', 'a0'], ['1–30 days', 'a1'], ['31–60 days', 'a2'], ['61–90 days', 'a3'], ['Over 90', 'a4']];
const bucketOf = (due, t) => { const d = daysBetween(t, due); return d <= 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4; };
function ageBar(b, total) { total = total || b.reduce((a, x) => a + x, 0) || 1; return `<div class="age" role="img" aria-label="Aging">${b.map((v, i) => v > 0 ? `<i class="a${i}" style="flex:${v / total}"></i>` : '').join('')}</div>`; }
const stepper = (id, v) => `<div class="step"><button data-st="${id}:-1" aria-label="Less">−</button><input id="${id}" type="number" inputmode="decimal" value="${v}" aria-label="Quantity"><button data-st="${id}:1" aria-label="More">+</button></div>`;
function wireSteppers(root) { $$('[data-st]', root).forEach(b => b.onclick = () => { const [id, d] = b.dataset.st.split(':'); const i = $('#' + id, root); i.value = Math.max(0, (parseFloat(i.value) || 0) + +d); i.dispatchEvent(new Event('input')); }); }
function waLink(phone, text) { let p = String(phone || '').replace(/\D/g, ''); if (p.length === 10) p = '91' + p; return 'https://wa.me/' + p + '?text=' + encodeURIComponent(text); }

/* ---------- data helpers (client-side aggregation; volumes are small) ---------- */
const invoicesBetween = (a, b) => list('Sales Invoice', { fields: ['name', 'customer', 'customer_name', 'posting_date', 'base_grand_total', 'base_net_total'], filters: [['docstatus', '=', 1], ['posting_date', '>=', a], ['posting_date', '<=', b], ['is_return', '=', 0]], limit_page_length: 5000, order_by: 'posting_date asc' });
async function invoiceLines(names) {
  const out = [];
  for (const c of chunk(names, 120)) out.push(...await list('Sales Invoice Item', { parent: 'Sales Invoice', fields: ['parent', 'item_code', 'item_name', 'qty', 'stock_qty', 'amount', 'base_net_amount', 'incoming_rate'], filters: [['parent', 'in', c]], limit_page_length: 20000 }));
  return out;
}
const receivables = () => memo('recv', () => list('Sales Invoice', { fields: ['name', 'customer', 'customer_name', 'posting_date', 'due_date', 'outstanding_amount'], filters: [['docstatus', '=', 1], ['outstanding_amount', '>', 0]], limit_page_length: 10000 }));
function ageParties(rows) {
  const t = today(), m = {};
  rows.forEach(r => { const p = m[r.customer] || (m[r.customer] = { customer: r.customer, name: r.customer_name || r.customer, total: 0, b: [0, 0, 0, 0, 0], oldest: r.due_date, bills: 0 }); const k = bucketOf(r.due_date, t); p.b[k] += r.outstanding_amount; p.total += r.outstanding_amount; p.bills++; if (r.due_date < p.oldest) p.oldest = r.due_date; });
  return Object.values(m).map(p => ({ ...p, overdue: p.b.slice(1).reduce((a, x) => a + x, 0), worst: p.b[4] > 0 ? 4 : p.b[3] > 0 ? 3 : p.b[2] > 0 ? 2 : p.b[1] > 0 ? 1 : 0 })).sort((a, b) => b.total - a.total);
}
const expiryRows = (days, wh = '%') => memo('exp' + days + wh, async () => (await api('/api/method/frappe.desk.query_report.run?' + q({ report_name: 'Expiry Register', filters: { within_days: days, warehouse: wh } }))).result.filter(x => x && x.batch));
async function sales30() {
  return memo('s30', async () => {
    const t = today(), inv = await invoicesBetween(addDays(t, -29), t);
    const lines = inv.length ? await invoiceLines(inv.map(i => i.name)) : [];
    const sold = {}; lines.forEach(l => { const s = sold[l.item_code] || (sold[l.item_code] = { code: l.item_code, name: l.item_name, qty: 0 }); s.qty += l.stock_qty || l.qty; });
    return sold;
  }, 600000);
}
async function stockByItem(codes) {
  const m = {};
  for (const c of chunk(codes, 80)) (await list('Bin', { fields: ['item_code', 'sum(actual_qty) as q', 'avg(valuation_rate) as v'], filters: [['item_code', 'in', c], ['warehouse', 'like', 'Stores%']], group_by: 'item_code', limit_page_length: 200 })).forEach(b => m[b.item_code] = b);
  return m;
}
async function reorderList() {
  return memo('reorder', async () => {
    const sold = await sales30(), codes = Object.keys(sold), st = codes.length ? await stockByItem(codes) : {};
    return codes.map(c => { const s = sold[c], stock = st[c] ? st[c].q : 0, perDay = s.qty / 30, cover = perDay > 0 ? stock / perDay : 999; return { code: c, name: s.name, sold: s.qty, stock, cover, need: Math.max(0, Math.ceil(perDay * 30 - stock)) }; }).filter(r => r.cover < 15 && r.sold >= 3).sort((a, b) => a.cover - b.cover);
  }, 600000);
}
const searchItems = v => list('Item', { fields: ['name', 'item_name', 'stock_uom', 'salt_composition', 'manufacturer_company', 'drug_schedule'], filters: [['disabled', '=', 0]], limit_page_length: 25, order_by: 'item_name asc', or_filters: [['item_name', 'like', '%' + v + '%'], ['item_code', 'like', '%' + v + '%'], ['salt_composition', 'like', '%' + v + '%'], ['manufacturer_company', 'like', '%' + v + '%']] });
async function lastSoldRate(customer, item) {
  const inv = await list('Sales Invoice', { fields: ['name', 'posting_date'], filters: [['customer', '=', customer], ['docstatus', '=', 1]], order_by: 'posting_date desc', limit_page_length: 40 });
  if (!inv.length) return null;
  const ls = await list('Sales Invoice Item', { parent: 'Sales Invoice', fields: ['parent', 'rate', 'qty'], filters: [['parent', 'in', inv.map(i => i.name)], ['item_code', '=', item]], limit_page_length: 100 });
  for (const i of inv) { const l = ls.find(x => x.parent === i.name); if (l) return { rate: l.rate, date: i.posting_date, qty: l.qty }; }
  return null;
}

/* ---------- PDF of a bill: download, then hand to the phone's share sheet ---------- */
async function sharePdf(dt, name, fmt) {
  toast('Preparing the PDF…', 20000);
  try {
    const url = S.url + '/api/method/frappe.utils.print_format.download_pdf?' + q({ doctype: dt, name, format: fmt, no_letterhead: 0 });
    const P = window.Capacitor && window.Capacitor.Plugins, file = name.replace(/[^A-Za-z0-9_-]+/g, '_') + '.pdf';
    const headers = {}; if (S.key && S.secret) headers.Authorization = 'token ' + S.key + ':' + S.secret;
    if (P && P.Filesystem && P.Share && P.CapacitorHttp) {
      const r = await P.CapacitorHttp.get({ url, headers, responseType: 'blob', webFetchExtra: { credentials: 'include' } });
      if (r.status !== 200 || typeof r.data !== 'string' || !r.data.startsWith('JVBER')) throw new Error(r.status === 401 || r.status === 403 ? 'Sign in again to continue.' : 'The server could not make the PDF. Check that the print format exists.');
      const w = await P.Filesystem.writeFile({ path: file, data: r.data, directory: 'CACHE' });
      toast('', 1);
      await P.Share.share({ title: name, text: name, url: w.uri, dialogTitle: 'Share bill ' + name });
    } else {
      const r = await fetch(url, { headers, credentials: 'include' }); if (!r.ok) throw new Error('The server could not make the PDF.');
      const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = file; a.click(); toast('', 1);
    }
  } catch (e) { if (!/cancel/i.test(e.message)) toast(e.message || 'Could not share the PDF', 6000); else toast('', 1); }
}

/* tap-to-pay link: opens the customer's UPI app with the amount filled in */
const UPI_ID = 'Vyapar.172141833373@hdfcbank', UPI_NAME = 'MM PHARMA DISTRIBUTORS', PAY_PAGE = 'https://drkathirpi.github.io/mmpharmaerp/pay.html';
const payLink = (amt, note) => PAY_PAGE + '?pa=' + encodeURIComponent(UPI_ID).replace(/%40/g, '@') + '&pn=' + encodeURIComponent(UPI_NAME) + '&due=' + (+amt).toFixed(2) + '&cu=INR&tn=' + encodeURIComponent(String(note).slice(0, 50));
