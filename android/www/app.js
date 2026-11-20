/* MM Pharma - mobile front end for ERPNext. Talks to the ERPNext REST API only; no server changes needed. */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = n => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
const num = n => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const view = $('#view');
let S = {};
try { S = JSON.parse(localStorage.getItem('mm') || '{}'); } catch (e) { S = {}; }
const save = () => localStorage.setItem('mm', JSON.stringify(S));
let tab = 'home';
let order = { customer: null, items: [] };
const debounce = (f, ms = 350) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };

function toast(m, ms = 2600) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), ms); }

/* ---------- API ---------- */
async function api(path, o = {}) {
  const h = { Accept: 'application/json' };
  if (S.key && S.secret) h.Authorization = 'token ' + S.key + ':' + S.secret;
  let body;
  if (o.body !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(o.body); }
  let r;
  try { r = await fetch(S.url + path, { method: o.method || (body ? 'POST' : 'GET'), headers: h, body, credentials: 'include' }); }
  catch (e) { throw new Error('Cannot reach the server. Check internet.'); }
  let j = {};
  try { j = await r.json(); } catch (e) { /* empty */ }
  if (r.status === 401 || (r.status === 403 && !o.noauthcheck && !(await alive()))) { const e = new Error('Session expired'); e.auth = true; throw e; }
  if (!r.ok) {
    let m = j.exception || j._error_message || r.statusText;
    try { m = JSON.parse(JSON.parse(j._server_messages)[0]).message || m; } catch (e) { /* keep */ }
    throw new Error(String(m).replace(/<[^>]+>/g, '').slice(0, 300));
  }
  return j.message !== undefined ? j.message : j;
}
async function alive() {
  try { const m = await api('/api/method/frappe.auth.get_logged_user', { noauthcheck: true }); return !!m && m !== 'Guest'; } catch (e) { return false; }
}
const q = o => Object.entries(o).map(([k, v]) => k + '=' + encodeURIComponent(typeof v === 'string' ? v : JSON.stringify(v))).join('&');
const list = (doctype, p = {}) => api('/api/method/frappe.client.get_list?' + q({ doctype, limit_page_length: 50, ...p }));
const method = (m, p = {}) => api('/api/method/' + m + '?' + q(p));

/* ---------- login ---------- */
function loginView(msg) {
  $('#tabs').hidden = true;
  view.innerHTML = `<div class="card"><h2>Sign in</h2>
    <input id="u" placeholder="Server (https://erp.drkathiravan.uk)" value="${esc(S.url || 'https://erp.drkathiravan.uk')}" autocapitalize="none">
    <input id="n" placeholder="Username or email" value="${esc(S.user || '')}" autocapitalize="none" autocomplete="username">
    <input id="p" type="password" placeholder="Password" autocomplete="current-password">
    <div class="mut" style="margin:-2px 0 10px">${esc(msg || '')}</div>
    <button class="btn" id="go">Sign in</button>
    <details style="margin-top:12px"><summary class="mut">Use an API key instead</summary>
      <input id="k" placeholder="API key" autocapitalize="none"><input id="s" placeholder="API secret" autocapitalize="none">
      <button class="btn sec" id="gk">Use key</button></details></div>`;
  const fin = async () => {
    try {
      const me = await method('frappe.auth.get_logged_user');
      S.me = me; S.user = S.user || me; save(); await boot();
    } catch (e) { toast('Sign-in failed: ' + e.message, 4000); }
  };
  $('#go').onclick = async () => {
    S.url = $('#u').value.trim().replace(/\/+$/, ''); S.user = $('#n').value.trim(); S.key = S.secret = '';
    $('#go').disabled = true;
    try {
      await api('/api/method/login', { method: 'POST', body: { usr: S.user, pwd: $('#p').value } });
      await fin();
    } catch (e) { toast(e.message, 4000); }
    if ($('#go')) $('#go').disabled = false;
  };
  $('#gk').onclick = async () => { S.url = $('#u').value.trim().replace(/\/+$/, ''); S.key = $('#k').value.trim(); S.secret = $('#s').value.trim(); await fin(); };
}

async function boot() {
  const c = await list('Company', { fields: ['name', 'abbr', 'default_currency'], limit_page_length: 1 });
  S.company = c[0].name; S.abbr = c[0].abbr; save();
  $('#tabs').hidden = false;
  go(tab);
}

/* ---------- navigation ---------- */
function go(t, arg) {
  tab = t;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  view.innerHTML = '<div class="mut" style="padding:20px;text-align:center">Loading…</div>';
  ({ home, stock, party, order: orderView, expiry })[t](arg).catch(fail);
  window.scrollTo(0, 0);
}
function fail(e) {
  if (e.auth) return loginView('Please sign in again.');
  view.innerHTML = `<div class="card"><h3 class="bad">Something went wrong</h3><div class="mut">${esc(e.message)}</div><br><button class="btn sec" onclick="go(tab)">Try again</button></div>`;
}
window.go = go;
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => go(b.dataset.tab));
$('#refresh').onclick = () => S.url && go(tab);

/* ---------- Home ---------- */
async function home() {
  const t = today(), m = t.slice(0, 8) + '01';
  const sum = (dt, f, fl) => list(dt, { fields: [`sum(${f}) as v`, 'count(name) as n'], filters: fl });
  const [sd, sm, ar, od, ap, ex, ex30, stv] = await Promise.all([
    sum('Sales Invoice', 'base_grand_total', [['docstatus', '=', 1], ['posting_date', '=', t]]),
    sum('Sales Invoice', 'base_grand_total', [['docstatus', '=', 1], ['posting_date', '>=', m]]),
    sum('Sales Invoice', 'outstanding_amount', [['docstatus', '=', 1], ['outstanding_amount', '>', 0]]),
    sum('Sales Invoice', 'outstanding_amount', [['docstatus', '=', 1], ['outstanding_amount', '>', 0], ['due_date', '<', t]]),
    sum('Purchase Invoice', 'outstanding_amount', [['docstatus', '=', 1], ['outstanding_amount', '>', 0]]),
    expiryRows(0, '%'), expiryRows(30, 'Stores%'),
    list('Bin', { fields: ['sum(stock_value) as v'], filters: [['warehouse', 'like', 'Stores%']] }),
  ]);
  const sumv = rows => rows.reduce((a, r) => a + (r.cost_value || 0), 0);
  view.innerHTML = `<div class="grid">
    <div class="kpi"><span>Sales today (${sd[0].n || 0} bills)</span><b>${inr(sd[0].v)}</b></div>
    <div class="kpi"><span>Sales this month</span><b>${inr(sm[0].v)}</b></div>
    <div class="kpi" onclick="go('party')"><span>To collect</span><b>${inr(ar[0].v)}</b></div>
    <div class="kpi" onclick="go('party','overdue')"><span>Overdue</span><b class="bad">${inr(od[0].v)}</b></div>
    <div class="kpi"><span>To pay suppliers</span><b>${inr(ap[0].v)}</b></div>
    <div class="kpi"><span>Stock value (saleable)</span><b>${inr(stv[0].v)}</b></div>
    <div class="kpi" onclick="go('expiry',30)"><span>Expiring in 30 days</span><b class="warn">${inr(sumv(ex30))}</b><span>${ex30.length} batch(es)</span></div>
    <div class="kpi" onclick="go('expiry',0)"><span>Expired (to return / write off)</span><b class="bad">${inr(sumv(ex))}</b><span>${ex.length} batch(es)</span></div>
  </div>
  <div style="height:10px"></div>
  <button class="btn" onclick="go('order')">+ New order</button>
  <div class="mut" style="text-align:center;margin-top:14px">${esc(S.company)} · ${esc(S.user || '')} · <a href="#" onclick="logout();return false">sign out</a></div>`;
}
window.logout = () => { S.key = S.secret = ''; save(); fetch(S.url + '/api/method/logout').catch(() => 0); loginView(); };

/* ---------- Stock ---------- */
async function stock() {
  view.innerHTML = `<input id="s" placeholder="Search item, salt or company…" autocomplete="off"><div id="res"></div>`;
  const run = debounce(async () => {
    const v = $('#s').value.trim();
    if (v.length < 2) { $('#res').innerHTML = '<div class="mut">Type at least 2 letters.</div>'; return; }
    $('#res').innerHTML = '<div class="mut">Searching…</div>';
    try {
      const items = await searchItems(v);
      const qty = {};
      if (items.length) (await list('Bin', { fields: ['item_code', 'sum(actual_qty) as q'], filters: [['item_code', 'in', items.map(i => i.name)], ['warehouse', 'like', 'Stores%']], group_by: 'item_code', limit_page_length: 100 })).forEach(b => qty[b.item_code] = b.q);
      $('#res').innerHTML = `<div class="card">${items.map(i => `<div class="item" data-i="${esc(i.name)}"><div class="row"><b>${esc(i.item_name)}</b><span class="num ${qty[i.name] > 0 ? 'ok' : 'bad'}">${num(qty[i.name] || 0)}</span></div>
        <div class="mut">${esc(i.salt_composition || '')} ${i.manufacturer_company ? '· ' + esc(i.manufacturer_company) : ''} ${i.drug_schedule ? '<span class="pill warn">Sch ' + esc(i.drug_schedule) + '</span>' : ''}</div></div>`).join('') || '<div class="mut">Nothing found.</div>'}</div>`;
      document.querySelectorAll('#res .item').forEach(e => e.onclick = () => itemDetail(e.dataset.i));
    } catch (e) { fail(e); }
  });
  $('#s').oninput = run; $('#s').focus();
}
const searchItems = v => list('Item', {
  fields: ['name', 'item_name', 'stock_uom', 'salt_composition', 'manufacturer_company', 'drug_schedule'],
  filters: [['disabled', '=', 0]], limit_page_length: 25, order_by: 'item_name asc',
  or_filters: [['item_name', 'like', '%' + v + '%'], ['item_code', 'like', '%' + v + '%'], ['salt_composition', 'like', '%' + v + '%'], ['manufacturer_company', 'like', '%' + v + '%']],
});

async function itemDetail(code) {
  view.innerHTML = '<div class="mut" style="padding:20px;text-align:center">Loading…</div>';
  const [it, bq, bd, pr] = await Promise.all([
    list('Item', { fields: ['name', 'item_name', 'stock_uom', 'salt_composition', 'manufacturer_company', 'drug_schedule', 'gst_hsn_code'], filters: [['name', '=', code]] }),
    method('erpnext.stock.doctype.batch.batch.get_batch_qty', { item_code: code }),
    list('Batch', { fields: ['name', 'expiry_date', 'batch_mrp'], filters: [['item', '=', code]], limit_page_length: 200 }),
    list('Item Price', { fields: ['price_list', 'price_list_rate', 'customer'], filters: [['item_code', '=', code], ['selling', '=', 1]], limit_page_length: 20 }),
  ]);
  const meta = {}; bd.forEach(b => meta[b.name] = b);
  const rows = (bq || []).filter(b => b.qty > 0).map(b => ({ ...b, ...meta[b.batch_no] })).sort((a, b) => (a.expiry_date || '9999').localeCompare(b.expiry_date || '9999'));
  const t = today();
  const tot = rows.filter(r => !String(r.warehouse).startsWith('Expired')).reduce((a, r) => a + r.qty, 0);
  const x = it[0];
  view.innerHTML = `<button class="back" id="bk">‹ Back</button>
  <div class="card"><h3>${esc(x.item_name)}</h3><div class="mut">${esc(x.salt_composition || '')}</div><div class="mut">${esc(x.manufacturer_company || '')} · HSN ${esc(x.gst_hsn_code || '-')}</div>
  <div style="margin-top:8px"><b class="num">${num(tot)}</b> ${esc(x.stock_uom)} saleable</div></div>
  <div class="card"><h3>Batches (earliest expiry first)</h3>${rows.map(r => {
    const d = r.expiry_date ? Math.round((new Date(r.expiry_date) - new Date(t)) / 864e5) : null;
    const cls = d === null ? '' : d < 0 ? 'bad' : d <= 90 ? 'warn' : 'ok';
    return `<div class="item"><div class="row"><b>${esc(r.batch_no)}</b><span class="num">${num(r.qty)}</span></div>
      <div class="mut">${r.expiry_date ? `<span class="pill ${cls}">${esc(r.expiry_date)}${d < 0 ? ' expired' : ' · ' + d + 'd'}</span>` : ''} MRP ${inr(r.batch_mrp)} ${String(r.warehouse).startsWith('Expired') ? '<span class="pill bad">Expired stock</span>' : ''}</div></div>`;
  }).join('') || '<div class="mut">No stock.</div>'}</div>
  ${pr.length ? `<div class="card"><h3>Selling rates</h3>${pr.map(p => `<div class="row item"><span>${esc(p.price_list)}${p.customer ? ' · ' + esc(p.customer) : ''}</span><b class="num">${inr(p.price_list_rate)}</b></div>`).join('')}</div>` : ''}
  <button class="btn" id="add">Add to order</button>`;
  $('#bk').onclick = () => go('stock');
  $('#add').onclick = async () => { await addToOrder(code); go('order'); };
}

/* ---------- Parties ---------- */
async function party(arg) {
  view.innerHTML = `<input id="s" placeholder="Search party name…" autocomplete="off"><div id="res"></div>`;
  const run = debounce(async () => {
    const v = $('#s').value.trim();
    if (v.length < 2) { $('#res').innerHTML = ''; return; }
    const cs = await list('Customer', { fields: ['name', 'customer_name', 'mobile_no', 'area', 'salesman'], filters: [['disabled', '=', 0]], or_filters: [['customer_name', 'like', '%' + v + '%'], ['name', 'like', '%' + v + '%']], limit_page_length: 25, order_by: 'customer_name asc' });
    $('#res').innerHTML = `<div class="card">${cs.map(c => `<div class="item" data-c="${esc(c.name)}"><b>${esc(c.customer_name)}</b><div class="mut">${esc(c.area || '')} ${c.salesman ? '· ' + esc(c.salesman) : ''}</div></div>`).join('') || '<div class="mut">Nothing found.</div>'}</div>`;
    document.querySelectorAll('#res .item').forEach(e => e.onclick = () => partyDetail(e.dataset.c));
  });
  $('#s').oninput = run;
  if (arg === 'overdue' || !arg) await partyBoard(arg === 'overdue');
}
async function partyBoard(overdueOnly) {
  const t = today();
  const f = [['docstatus', '=', 1], ['outstanding_amount', '>', 0]];
  if (overdueOnly) f.push(['due_date', '<', t]);
  const r = await list('Sales Invoice', { fields: ['customer', 'customer_name', 'sum(outstanding_amount) as v', 'min(due_date) as oldest'], filters: f, group_by: 'customer', order_by: 'v desc', limit_page_length: 30 });
  $('#res').innerHTML = `<h2>${overdueOnly ? 'Most overdue' : 'Biggest outstanding'}</h2><div class="card">${r.map(c => `<div class="item" data-c="${esc(c.customer)}"><div class="row"><b>${esc(c.customer_name || c.customer)}</b><b class="num bad">${inr(c.v)}</b></div><div class="mut">oldest due ${esc(c.oldest || '')}</div></div>`).join('') || '<div class="mut">None.</div>'}</div>`;
  document.querySelectorAll('#res .item').forEach(e => e.onclick = () => partyDetail(e.dataset.c));
}
async function partyDetail(name) {
  view.innerHTML = '<div class="mut" style="padding:20px;text-align:center">Loading…</div>';
  const t = today();
  const [c, inv] = await Promise.all([
    list('Customer', { fields: ['name', 'customer_name', 'mobile_no', 'area', 'salesman', 'drug_licence_1', 'drug_licence_2', 'allow_overdue_billing'], filters: [['name', '=', name]] }),
    list('Sales Invoice', { fields: ['name', 'posting_date', 'due_date', 'outstanding_amount', 'grand_total'], filters: [['customer', '=', name], ['docstatus', '=', 1], ['outstanding_amount', '>', 0]], order_by: 'due_date asc', limit_page_length: 200 }),
  ]);
  const x = c[0], total = inv.reduce((a, i) => a + i.outstanding_amount, 0), od = inv.filter(i => i.due_date < t).reduce((a, i) => a + i.outstanding_amount, 0);
  view.innerHTML = `<button class="back" id="bk">‹ Back</button>
  <div class="card"><h3>${esc(x.customer_name)}</h3><div class="mut">${esc(x.area || '')} ${x.salesman ? '· ' + esc(x.salesman) : ''}</div>
  <div class="mut">DL: ${esc(x.drug_licence_1 || '-')} ${x.drug_licence_2 ? ' / ' + esc(x.drug_licence_2) : ''}</div>
  <div class="grid" style="margin-top:10px"><div class="kpi"><span>Outstanding</span><b>${inr(total)}</b></div><div class="kpi"><span>Overdue</span><b class="bad">${inr(od)}</b></div></div>
  ${x.allow_overdue_billing ? '<div class="pill ok" style="margin-top:8px">Billing allowed even if overdue</div>' : ''}
  <div style="display:flex;gap:8px;margin-top:10px">${x.mobile_no ? `<a class="btn sec" style="text-decoration:none;text-align:center" href="tel:${esc(x.mobile_no)}">Call</a>` : ''}<button class="btn" id="ord">New order</button></div></div>
  <div class="card"><h3>Unpaid bills (oldest first)</h3>${inv.map(i => `<div class="item"><div class="row"><b>${esc(i.name)}</b><b class="num">${inr(i.outstanding_amount)}</b></div><div class="mut">${esc(i.posting_date)} · due ${esc(i.due_date)} ${i.due_date < t ? '<span class="pill bad">' + Math.round((new Date(t) - new Date(i.due_date)) / 864e5) + 'd overdue</span>' : ''}</div></div>`).join('') || '<div class="mut">Nothing outstanding.</div>'}</div>`;
  $('#bk').onclick = () => go('party');
  $('#ord').onclick = () => { order.customer = { name: x.name, customer_name: x.customer_name }; go('order'); };
}

/* ---------- Order ---------- */
async function rateFor(code, qty) {
  try {
    const r = await method('erpnext.stock.get_item_details.get_item_details', {
      args: { item_code: code, customer: order.customer?.name, company: S.company, doctype: 'Sales Order', currency: 'INR', price_list: 'Standard Selling', selling_price_list: 'Standard Selling', qty, transaction_date: today(), conversion_rate: 1, plc_conversion_rate: 1, ignore_pricing_rule: 0, transaction_type: 'selling' },
    });
    return { rate: r.price_list_rate ? (r.rate || r.price_list_rate) : (r.rate || 0), name: r.item_name, uom: r.uom || r.stock_uom };
  } catch (e) { return { rate: 0 }; }
}
async function addToOrder(code) {
  const x = (await list('Item', { fields: ['name', 'item_name', 'stock_uom'], filters: [['name', '=', code]] }))[0];
  const r = await rateFor(code, 1);
  const ex = order.items.find(i => i.item_code === code);
  if (ex) ex.qty += 1; else order.items.push({ item_code: code, item_name: x.item_name, uom: x.stock_uom, qty: 1, rate: r.rate || 0 });
}
async function orderView() {
  const total = order.items.reduce((a, i) => a + i.qty * i.rate, 0);
  view.innerHTML = `<h2>New order</h2>
  <div class="card"><div class="row"><div><div class="mut">Party</div><b>${order.customer ? esc(order.customer.customer_name) : '— not chosen —'}</b></div><button class="btn sm sec" id="pc">${order.customer ? 'Change' : 'Choose'}</button></div><div id="pcres"></div></div>
  <div class="card"><div class="row"><h3>Items</h3><button class="btn sm" id="ai">+ Add item</button></div><div id="ires"></div>
  ${order.items.map((i, n) => `<div class="item"><div><b>${esc(i.item_name)}</b></div><div class="row" style="margin-top:6px"><span class="mut">qty</span><input class="qty" type="number" inputmode="decimal" min="0" value="${i.qty}" data-q="${n}"><span class="mut">rate</span><input class="rate" type="number" inputmode="decimal" value="${i.rate}" data-r="${n}"><button class="btn sm sec" data-d="${n}">✕</button></div></div>`).join('') || '<div class="mut">No items yet.</div>'}
  </div>
  <div class="card row"><b>Total (before tax)</b><b class="num" id="tot">${inr(total)}</b></div>
  <button class="btn" id="sv" ${order.customer && order.items.length ? '' : 'disabled'}>Save as draft order</button>
  <div class="mut" style="margin-top:8px">Saved as a draft Sales Order in ERPNext. Schemes, free goods and the overdue check apply when you make the bill.</div>`;
  const recalc = () => { $('#tot').textContent = inr(order.items.reduce((a, i) => a + i.qty * i.rate, 0)); };
  document.querySelectorAll('[data-q]').forEach(e => e.oninput = () => { order.items[e.dataset.q].qty = parseFloat(e.value) || 0; recalc(); });
  document.querySelectorAll('[data-r]').forEach(e => e.oninput = () => { order.items[e.dataset.r].rate = parseFloat(e.value) || 0; recalc(); });
  document.querySelectorAll('[data-d]').forEach(e => e.onclick = () => { order.items.splice(e.dataset.d, 1); orderView(); });
  $('#pc').onclick = () => {
    $('#pcres').innerHTML = '<input id="ps" placeholder="Search party…" style="margin-top:10px"><div id="pl"></div>'; $('#ps').focus();
    $('#ps').oninput = debounce(async () => {
      const v = $('#ps').value.trim(); if (v.length < 2) return;
      const cs = await list('Customer', { fields: ['name', 'customer_name', 'area'], filters: [['disabled', '=', 0]], or_filters: [['customer_name', 'like', '%' + v + '%'], ['name', 'like', '%' + v + '%']], limit_page_length: 15 });
      $('#pl').innerHTML = cs.map(c => `<div class="item" data-c='${esc(JSON.stringify({ name: c.name, customer_name: c.customer_name }))}'><b>${esc(c.customer_name)}</b> <span class="mut">${esc(c.area || '')}</span></div>`).join('');
      document.querySelectorAll('#pl .item').forEach(e => e.onclick = () => { order.customer = JSON.parse(e.dataset.c); orderView(); });
    });
  };
  $('#ai').onclick = () => {
    $('#ires').innerHTML = '<input id="is" placeholder="Search item…"><div id="il"></div>'; $('#is').focus();
    $('#is').oninput = debounce(async () => {
      const v = $('#is').value.trim(); if (v.length < 2) return;
      const it = await searchItems(v);
      $('#il').innerHTML = it.map(i => `<div class="item" data-i="${esc(i.name)}"><b>${esc(i.item_name)}</b></div>`).join('');
      document.querySelectorAll('#il .item').forEach(e => e.onclick = async () => { await addToOrder(e.dataset.i); orderView(); });
    });
  };
  $('#sv').onclick = async () => {
    $('#sv').disabled = true;
    try {
      const d = new Date(Date.now() + 864e5 * 0).toISOString().slice(0, 10);
      const r = await api('/api/resource/Sales Order', { method: 'POST', body: { customer: order.customer.name, company: S.company, transaction_date: today(), delivery_date: d, items: order.items.filter(i => i.qty > 0).map(i => ({ item_code: i.item_code, qty: i.qty, rate: i.rate, delivery_date: d })) } });
      toast('Saved ' + (r.data ? r.data.name : r.name) + ' (draft)', 4000);
      order = { customer: null, items: [] }; go('home');
    } catch (e) { toast(e.message, 5000); $('#sv').disabled = false; }
  };
}

/* ---------- Expiry ---------- */
async function expiryRows(days, wh) {
  const r = await api('/api/method/frappe.desk.query_report.run?' + q({ report_name: 'Expiry Register', filters: { within_days: days, warehouse: wh } }));
  return (r.result || []).filter(x => x && x.batch);
}
async function expiry(arg) {
  let days = arg === undefined ? 90 : arg;
  view.innerHTML = `<select id="d"><option value="0">Already expired</option><option value="30">Expiring in 30 days</option><option value="60">Expiring in 60 days</option><option value="90">Expiring in 90 days</option><option value="180">Expiring in 180 days</option></select>
  <input id="f" placeholder="Filter by item…"><div id="res"></div>`;
  $('#d').value = String(days);
  let rows = [];
  const draw = () => {
    const f = $('#f').value.trim().toLowerCase();
    const r = rows.filter(x => !f || (x.item || '').toLowerCase().includes(f)).slice(0, 300);
    const tot = r.reduce((a, x) => a + (x.cost_value || 0), 0);
    $('#res').innerHTML = `<div class="mut" style="margin:0 4px 8px">${r.length} batches · cost ${inr(tot)}</div><div class="card">${r.map(x => `<div class="item"><div class="row"><b>${esc(x.item)}</b><span class="num">${num(x.qty)}</span></div><div class="mut">${esc(x.batch)} · <span class="pill ${x.days_left < 0 ? 'bad' : 'warn'}">${esc(x.expiry)}${x.days_left < 0 ? ' expired' : ' · ' + x.days_left + 'd'}</span> MRP ${inr(x.mrp)} · cost ${inr(x.cost_value)}</div></div>`).join('') || '<div class="mut">Nothing.</div>'}</div>`;
  };
  const load = async () => {
    $('#res').innerHTML = '<div class="mut">Loading…</div>';
    rows = await expiryRows(parseInt($('#d').value, 10), '%');
    draw();
  };
  $('#d').onchange = load; $('#f').oninput = debounce(draw, 200);
  await load();
}

/* ---------- start ---------- */
(async () => {
  if (!S.url) return loginView();
  try { await boot(); } catch (e) { e.auth || !S.company ? loginView(e.auth ? 'Please sign in again.' : e.message) : fail(e); }
})();
