/* reports.js: report hub, turnover, ledger, books, GST, stock reports, shortcuts and quick actions */

/* ---------- date ranges ---------- */
const fyOf = d => { const y = +d.slice(0, 4), m = +d.slice(5, 7), s = m >= 4 ? y : y - 1; return { from: s + '-04-01', to: (s + 1) + '-03-31', name: s + '-' + (s + 1) }; };
function rangeFor(k) {
  const t = today(), d = new Date(t + 'T00:00:00'), y = d.getFullYear(), m = d.getMonth(), fy = fyOf(t), last = n => iso(new Date(y, n + 1, 0));
  return { today: [t, t], month: [t.slice(0, 8) + '01', t], last: [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))], quarter: [iso(new Date(y, Math.floor(m / 3) * 3, 1)), t], fy: [fy.from, t], fyfull: [fy.from, fy.to], lastfy: [fyOf(addDays(fy.from, -1)).from, fyOf(addDays(fy.from, -1)).to] }[k];
}
const RR = {};
const rangeBar = (key, def) => { const r = RR[key] || (RR[key] = { k: def, from: rangeFor(def)[0], to: rangeFor(def)[1] }); return `<div class="chips" id="rg">${[['today', 'Today'], ['month', 'This month'], ['last', 'Last month'], ['quarter', 'Quarter'], ['fy', 'This year'], ['lastfy', 'Last year']].map(([k, l]) => `<button class="chip ${r.k === k ? 'on' : ''}" data-r="${k}">${l}</button>`).join('')}</div><div class="two" style="padding:0 12px 4px"><input class="in" id="rf1" type="date" value="${r.from}" aria-label="From date"><input class="in" id="rt1" type="date" value="${r.to}" aria-label="To date"></div>`; };
function wireRange(key, run) {
  const r = RR[key];
  $$('#rg .chip').forEach(b => b.onclick = () => { r.k = b.dataset.r; [r.from, r.to] = rangeFor(r.k); $('#rf1').value = r.from; $('#rt1').value = r.to; $$('#rg .chip').forEach(x => x.classList.toggle('on', x === b)); run(); });
  $('#rf1').onchange = $('#rt1').onchange = () => { r.k = ''; r.from = $('#rf1').value; r.to = $('#rt1').value; $$('#rg .chip').forEach(x => x.classList.remove('on')); run(); };
}

/* ---------- generic table from any ERPNext report ---------- */
function normCols(cs) { return cs.map(c => typeof c === 'string' ? (([l, t, w]) => ({ label: l, fieldname: l, type: (t || '').split('/')[0], hidden: w === '0' }))(c.split(':')) : { label: c.label || c.fieldname, fieldname: c.fieldname, type: c.fieldtype, hidden: !!c.hidden || c.width === 0 }); }
function tableData(res) {
  const cols = normCols(res.columns || []).filter(c => !c.hidden && !/^(currency|parent_account|from_date|to_date|gl_entry|account_currency|is_group.*|indent)$/.test(c.fieldname) && !/^(Currency)$/.test(c.type));
  const rows = (res.result || []).filter(r => r && typeof r === 'object').map(r => cols.map(c => { if (Array.isArray(r)) return r[(res.columns || []).findIndex(x => (typeof x === 'string' ? x.split(':')[0] : x.fieldname) === c.fieldname)]; return r[c.fieldname]; }));
  const ind = (res.result || []).filter(r => r && typeof r === 'object').map(r => (!Array.isArray(r) && r.indent) || 0);
  return { cols, rows, ind };
}
const cellFmt = (c, v) => v == null || v === '' ? '' : /Currency|Float|Percent/.test(c.type) && typeof v === 'number' ? num(v) : c.type === 'Int' && typeof v === 'number' ? String(v) : c.type === 'Date' && /^\d{4}-\d{2}-\d{2}/.test(v) ? fmtDate(String(v).slice(0, 10)) : typeof v === 'number' ? num(v) : String(v);
function tableHtml(t, limit = 300) {
  if (!t.rows.length) return empty('Nothing to show', 'No entries for these dates.');
  const num1 = c => /Currency|Float|Int|Percent/.test(c.type);
  return `<div class="rtw"><table class="rt"><thead><tr>${t.cols.map(c => `<th class="${num1(c) ? 'r' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${t.rows.slice(0, limit).map((r, ri) => `<tr>${r.map((v, i) => `<td class="${num1(t.cols[i]) ? 'r' : ''}${typeof v === 'number' && v < 0 ? ' red' : ''}"${i === 0 && t.ind[ri] ? ` style="padding-left:${6 + t.ind[ri] * 12}px"` : ''}>${esc(cellFmt(t.cols[i], v))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${t.rows.length > limit ? `<div class="pad t2">Showing the first ${limit} of ${t.rows.length}. Use Excel to see all.</div>` : ''}`;
}
const tableXlsxRows = (t, head) => [...head, t.cols.map(c => c.label), ...t.rows.map(r => r.map((v, i) => v == null ? '' : /Date/.test(t.cols[i].type) ? String(v).slice(0, 10) : v))];

const REP = {
  sales: { t: 'Gross sales', n: 'Sales Register', def: 'month', f: r => ({ company: S.company, from_date: r.from, to_date: r.to }) },
  purch: { t: 'Gross purchase', n: 'Purchase Register', def: 'month', f: r => ({ company: S.company, from_date: r.from, to_date: r.to }) },
  tb: { t: 'Trial balance', n: 'Trial Balance', def: 'fyfull', f: r => ({ company: S.company, fiscal_year: fyOf(r.from).name, from_date: r.from, to_date: r.to, show_zero_values: 0, show_group_accounts: 1 }) },
  pl: { t: 'Profit and loss', n: 'Profit and Loss Statement', def: 'fyfull', f: r => ({ company: S.company, filter_based_on: 'Date Range', period_start_date: r.from, period_end_date: r.to, periodicity: 'Yearly', accumulated_values: 1 }) },
  bs: { t: 'Balance sheet', n: 'Balance Sheet', def: 'fyfull', f: r => ({ company: S.company, filter_based_on: 'Date Range', period_start_date: r.from, period_end_date: r.to, periodicity: 'Yearly', accumulated_values: 1 }) },
  stock: { t: 'Current stock', n: 'Stock Balance', def: 'fy', f: r => ({ company: S.company, from_date: r.from, to_date: r.to, warehouse: WH() }) },
  batch: { t: 'Batch wise stock', n: 'Batch-Wise Balance History', def: 'fy', f: r => ({ company: S.company, from_date: r.from, to_date: r.to, warehouse: WH() }) },
  gstbal: { t: 'GST balance', n: 'GST Balance', def: 'month', f: r => ({ company: S.company, company_gstin: S.gstin, from_date: r.from, to_date: r.to }) },
  hsn: { t: 'HSN summary', n: 'GSTR-1', def: 'last', f: r => ({ company: S.company, company_gstin: S.gstin, from_date: r.from, to_date: r.to, type_of_business: 'HSN' }) },
};
async function gstin() { if (!S.gstin) { const c = await list('Company', { fields: ['gstin'], limit_page_length: 1 }); S.gstin = c[0] && c[0].gstin; save(); } return S.gstin; }
on(/^\/rep\/(\w+)$/, async key => {
  const R = REP[key]; if (!R) return go('/rpt');
  setTitle(R.t); await gstin();
  view.innerHTML = `${rangeBar(key, R.def)}<div id="out">${skeleton(5)}</div><div class="acts" id="ex" hidden><button class="btn out" id="xl">Excel</button></div>`;
  let T = null;
  const run = async () => {
    $('#out').innerHTML = skeleton(5); $('#ex').hidden = true;
    try {
      const r = RR[key], res = await api('/api/method/frappe.desk.query_report.run?' + q({ report_name: R.n, filters: R.f(r) }));
      T = tableData(res); $('#out').innerHTML = tableHtml(T); $('#ex').hidden = !T.rows.length;
    } catch (e) { $('#out').innerHTML = errBox(e); }
  };
  wireRange(key, run); $('#xl').onclick = () => T && shareXlsx(tableXlsxRows(T, [[S.company], [R.t, RR[key].from + ' to ' + RR[key].to], []]), R.t.replace(/ /g, '_') + '_' + RR[key].to);
  run();
}, { title: '' });

/* ---------- turnover: monthly, item wise, company wise, party wise ---------- */
let TO = 'month';
on(/^\/turnover(?:\/(\w+))?$/, async by => {
  if (by) TO = by;
  view.innerHTML = `${rangeBar('turn', 'fy')}<div class="seg" id="by">${[['month', 'Monthly'], ['item', 'Items'], ['company', 'Companies'], ['party', 'Parties']].map(([k, l]) => `<button data-b="${k}" class="${TO === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="out">${skeleton(5)}</div><div class="acts" id="ex" hidden><button class="btn out" id="xl">Excel</button></div>`;
  let XR = [];
  const run = async () => {
    $('#out').innerHTML = skeleton(5); $('#ex').hidden = true;
    try {
      const r = RR.turn, key = 'to' + TO + r.from + r.to;
      const sales = await memo(key + 's', () => list('Sales Invoice', { fields: ['name', 'customer', 'customer_name', 'posting_date', 'base_net_total', 'base_grand_total', 'is_return'], filters: [['docstatus', '=', 1], ['posting_date', '>=', r.from], ['posting_date', '<=', r.to]], limit_page_length: 20000, order_by: 'posting_date asc' }), 120000);
      let rows = [], head = [];
      if (TO === 'month') {
        const pur = await memo(key + 'p', () => list('Purchase Invoice', { fields: ['name', 'posting_date', 'base_net_total', 'base_grand_total'], filters: [['docstatus', '=', 1], ['posting_date', '>=', r.from], ['posting_date', '<=', r.to]], limit_page_length: 20000 }), 120000);
        const m = {}; sales.forEach(i => { const k = i.posting_date.slice(0, 7), o = m[k] || (m[k] = { s: 0, sg: 0, p: 0, pg: 0, n: 0 }); o.s += i.base_net_total; o.sg += i.base_grand_total; if (!i.is_return) o.n++; }); pur.forEach(i => { const k = i.posting_date.slice(0, 7), o = m[k] || (m[k] = { s: 0, sg: 0, p: 0, pg: 0, n: 0 }); o.p += i.base_net_total; o.pg += i.base_grand_total; });
        const ks = Object.keys(m).sort(), mx = Math.max(1, ...ks.map(k => m[k].s)), tS = ks.reduce((a, k) => a + m[k].s, 0), tP = ks.reduce((a, k) => a + m[k].p, 0), mon = k => new Date(k + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
        head = ['Month', 'Bills', 'Sales (before GST)', 'Sales (with GST)', 'Purchases (before GST)', 'Purchases (with GST)'];
        rows = ks.map(k => [mon(k), m[k].n, +m[k].s.toFixed(2), +m[k].sg.toFixed(2), +m[k].p.toFixed(2), +m[k].pg.toFixed(2)]);
        $('#out').innerHTML = ks.length ? `<section class="sec"><div class="ld" style="padding-top:12px"><span>Sales before GST</span><i></i><b>${inr0(tS)}</b></div><div class="ld"><span>Purchases before GST</span><i></i><b>${inr0(tP)}</b></div><div style="height:8px"></div></section><section class="sec">${ks.map(k => `<div class="row" style="display:block"><div class="row" style="padding:0;border:0;min-height:0"><div class="grow t1">${mon(k)}</div><b>${inr0(m[k].s)}</b></div><div class="hbar"><i style="width:${Math.max(1, m[k].s / mx * 100)}%"></i></div><div class="t2" style="margin-top:4px">${m[k].n} bills · bought ${inr0(m[k].p)}</div></div>`).join('')}</section>` : empty('No sales in this period', '');
      } else if (TO === 'party') {
        const g = {}; sales.forEach(i => { const o = g[i.customer] || (g[i.customer] = { n: i.customer_name, a: 0, b: 0 }); o.a += i.base_net_total; if (!i.is_return) o.b++; });
        const L = Object.values(g).sort((a, b) => b.a - a.a), tot = L.reduce((a, x) => a + x.a, 0), top = L[0] ? L[0].a : 1;
        head = ['Party', 'Bills', 'Sales (before GST)', 'Share %']; rows = L.map(x => [x.n, x.b, +x.a.toFixed(2), +(x.a / (tot || 1) * 100).toFixed(2)]);
        $('#out').innerHTML = rankHtml(L.map(x => ({ n: x.n, a: x.a, s: `${x.b} bills · ${num(x.a / (tot || 1) * 100)}%` })), tot, top);
      } else {
        const lines = await memo(key + 'l', () => invoiceLines(sales.map(i => i.name)), 120000); let meta = {};
        if (TO === 'company') { const codes = [...new Set(lines.map(l => l.item_code))]; for (const c of chunk(codes, 100)) (await list('Item', { fields: ['name', 'manufacturer_company'], filters: [['name', 'in', c]], limit_page_length: 200 })).forEach(i => meta[i.name] = i.manufacturer_company || 'Not set'); }
        const g = {}; lines.forEach(l => { const k = TO === 'item' ? l.item_code : meta[l.item_code], o = g[k] || (g[k] = { n: TO === 'item' ? l.item_name : k, a: 0, q: 0 }); o.a += l.base_net_amount; o.q += l.qty; });
        const L = Object.values(g).sort((a, b) => b.a - a.a), tot = L.reduce((a, x) => a + x.a, 0), top = L[0] ? L[0].a : 1;
        head = [TO === 'item' ? 'Item' : 'Company', 'Quantity', 'Sales (before GST)', 'Share %']; rows = L.map(x => [x.n, +x.q.toFixed(2), +x.a.toFixed(2), +(x.a / (tot || 1) * 100).toFixed(2)]);
        $('#out').innerHTML = rankHtml(L.slice(0, 100).map(x => ({ n: x.n, a: x.a, s: `${num(x.q)} sold · ${num(x.a / (tot || 1) * 100)}%` })), tot, top);
      }
      XR = [[S.company], ['Turnover by ' + TO, r.from + ' to ' + r.to], [], head, ...rows]; $('#ex').hidden = !rows.length;
    } catch (e) { $('#out').innerHTML = errBox(e); }
  };
  wireRange('turn', run); $$('#by button').forEach(b => b.onclick = () => { TO = b.dataset.b; $$('#by button').forEach(x => x.classList.toggle('on', x === b)); run(); });
  $('#xl').onclick = () => shareXlsx(XR, 'Turnover_' + TO);
  run();
}, { title: 'Turnover' });
const rankHtml = (L, tot, top) => L.length ? `<section class="sec"><div class="ld" style="padding-top:12px"><span>Total before GST</span><i></i><b>${inr0(tot)}</b></div><div style="height:8px"></div></section><section class="sec">${L.map(x => `<div class="row" style="display:block"><div class="row" style="padding:0;border:0;min-height:0"><div class="grow t1">${esc(x.n)}</div><b>${inr0(x.a)}</b></div><div class="hbar"><i style="width:${Math.max(1, x.a / top * 100)}%"></i></div><div class="t2" style="margin-top:4px">${esc(x.s)}</div></div>`).join('')}</section>` : empty('No sales in this period', '');

/* ---------- debtor and supplier ledger ---------- */
on(/^\/ledger$/, () => { view.innerHTML = `<div class="seg" id="ty"><button data-t="Customer" class="on">Debtors</button><button data-t="Supplier">Suppliers</button></div><div id="o"></div>`; let ty = 'Customer'; const ask = () => { $('#o').innerHTML = empty('Choose a party', 'Tap below to pick the party whose ledger you want.') + `<div class="acts"><button class="btn" id="pp">Choose ${ty === 'Customer' ? 'customer' : 'supplier'}</button></div>`; $('#pp').onclick = () => pickParty(ty, c => go('/ledger/' + ty + '/' + encodeURIComponent(c))); }; $$('#ty button').forEach(b => b.onclick = () => { ty = b.dataset.t; $$('#ty button').forEach(x => x.classList.toggle('on', x === b)); ask(); }); ask(); }, { title: 'Ledger' });
on(/^\/ledger\/(Customer|Supplier)\/(.+)$/, async (type, party) => {
  setTitle(party);
  view.innerHTML = `${rangeBar('led', 'fy')}<div id="out">${skeleton(5)}</div><div class="acts" id="ex" hidden><button class="btn out" id="xl">Excel</button><a class="btn out" id="wa" href="#">${ic('chat', 20)}Share</a></div>`;
  let T = null, bal = 0, rowsX = [];
  const run = async () => {
    $('#out').innerHTML = skeleton(5);
    try {
      const r = RR.led, res = await api('/api/method/frappe.desk.query_report.run?' + q({ report_name: 'General Ledger', filters: { company: S.company, from_date: r.from, to_date: r.to, party_type: type, party: [party], group_by: 'Group by Voucher (Consolidated)', include_dimensions: 0 } }));
      const L = (res.result || []).filter(x => x && x.account), open = L.find(x => /Opening/.test(x.account)), tot = L.find(x => /Total/.test(x.account)), close = L.find(x => /Closing/.test(x.account)), ent = L.filter(x => x.posting_date);
      bal = close ? close.balance : 0; const dr = tot ? tot.debit : 0, cr = tot ? tot.credit : 0, sign = type === 'Customer' ? 1 : -1;
      rowsX = [[S.company], [type + ' ledger: ' + party, r.from + ' to ' + r.to], [], ['Date', 'Voucher', 'Debit', 'Credit', 'Balance'], ...(open ? [['', 'Opening', open.debit, open.credit, open.balance]] : []), ...ent.map(x => [String(x.posting_date).slice(0, 10), (x.voucher_type || '') + ' ' + (x.voucher_no || ''), x.debit, x.credit, x.balance]), ...(close ? [['', 'Closing', close.debit, close.credit, close.balance]] : [])];
      $('#out').innerHTML = `<section class="sec"><div class="pad"><div class="t2">${type === 'Customer' ? 'They owe you' : 'You owe them'} at ${fmtDate(r.to)}</div><div class="big">${inr0(Math.abs(bal))}${bal * sign < 0 ? ' <span class="t2">(in advance)</span>' : ''}</div></div><div class="ld"><span>Opening</span><i></i><b>${inr0(open ? open.balance : 0)}</b></div><div class="ld"><span>Debit</span><i></i><b>${inr0(dr)}</b></div><div class="ld"><span>Credit</span><i></i><b>${inr0(cr)}</b></div><div style="height:8px"></div></section>
        <section class="sec">${ent.map(x => `<div class="row"><div class="grow"><div class="t1">${esc(x.voucher_type || '')} ${esc(x.voucher_no || '')}</div><div class="t2">${fmtDate(String(x.posting_date).slice(0, 10))}</div></div><div class="r">${x.debit ? `<b>${inr0(x.debit)} Dr</b>` : `<b class="green">${inr0(x.credit)} Cr</b>`}<div class="t2">${inr0(x.balance)}</div></div></div>`).join('') || empty('No entries', 'Nothing was posted in these dates.')}</section>`;
      $('#ex').hidden = false;
      $('#wa').href = waLink('', `${type === 'Customer' ? 'Statement' : 'Ledger'} of ${party} (${fmtDate(r.from)} to ${fmtDate(r.to)})\n` + ent.slice(-25).map(x => `${fmtDate(String(x.posting_date).slice(0, 10))} ${x.voucher_no} ${x.debit ? 'Dr ' + inr0(x.debit) : 'Cr ' + inr0(x.credit)}`).join('\n') + `\n\nBalance ${inr0(Math.abs(bal))} ${bal * sign >= 0 ? 'due' : 'advance'}\n${S.company}`);
    } catch (e) { $('#out').innerHTML = errBox(e); }
  };
  wireRange('led', run); $('#xl').onclick = () => shareXlsx(rowsX, 'Ledger_' + party);
  run();
}, { title: '' });

/* ---------- GSTR-1 ---------- */
let G1 = 'B2B';
on(/^\/gst1$/, async () => {
  await gstin();
  view.innerHTML = `${rangeBar('g1', 'last')}<div class="chips" id="ty">${[['B2B', 'B2B'], ['B2C Large', 'B2C large'], ['B2C Small', 'B2C small'], ['CDNR', 'Credit notes (reg.)'], ['CDNUR', 'Credit notes (unreg.)'], ['NIL_EXEMPT', 'Nil and exempt'], ['HSN', 'HSN summary']].map(([k, l]) => `<button class="chip ${G1 === k ? 'on' : ''}" data-t="${k}">${l}</button>`).join('')}</div><div id="out">${skeleton(5)}</div><div class="acts" id="ex" hidden><button class="btn out" id="xl">Excel</button></div>`;
  let T = null;
  const run = async () => {
    $('#out').innerHTML = skeleton(5); $('#ex').hidden = true;
    try { const r = RR.g1, res = await api('/api/method/frappe.desk.query_report.run?' + q({ report_name: 'GSTR-1', filters: { company: S.company, company_gstin: S.gstin, from_date: r.from, to_date: r.to, type_of_business: G1 } })); T = tableData(res); $('#out').innerHTML = tableHtml(T); $('#ex').hidden = !T.rows.length; }
    catch (e) { $('#out').innerHTML = errBox(e); }
  };
  wireRange('g1', run); $$('#ty .chip').forEach(b => b.onclick = () => { G1 = b.dataset.t; $$('#ty .chip').forEach(x => x.classList.toggle('on', x === b)); run(); });
  $('#xl').onclick = () => T && shareXlsx(tableXlsxRows(T, [[S.company, 'GSTIN ' + S.gstin], ['GSTR-1 ' + G1, RR.g1.from + ' to ' + RR.g1.to], []]), 'GSTR1_' + G1 + '_' + RR.g1.to);
  run();
}, { title: 'GSTR-1' });

/* ---------- GSTR-3B summary worked out from your bills ---------- */
on(/^\/gst3b$/, async () => {
  view.innerHTML = `${rangeBar('g3', 'last')}<div id="out">${skeleton(6)}</div><div class="acts" id="ex" hidden><button class="btn out" id="xl">Excel</button></div>`;
  let XR = [];
  const heads = acc => /IGST/i.test(acc) ? 'igst' : /CGST/i.test(acc) ? 'cgst' : /SGST|UTGST/i.test(acc) ? 'sgst' : /CESS/i.test(acc) ? 'cess' : null;
  const run = async () => {
    $('#out').innerHTML = skeleton(6); $('#ex').hidden = true;
    try {
      const r = RR.g3, f = [['docstatus', '=', 1], ['posting_date', '>=', r.from], ['posting_date', '<=', r.to]];
      const [si, pi] = await Promise.all([list('Sales Invoice', { fields: ['name', 'base_net_total'], filters: f, limit_page_length: 20000 }), list('Purchase Invoice', { fields: ['name', 'base_net_total', 'is_reverse_charge'], filters: f, limit_page_length: 20000 })]);
      const tax = async (dt, child, names) => { const t = { igst: 0, cgst: 0, sgst: 0, cess: 0 }; for (const c of chunk(names, 120)) (await list(child, { parent: dt, fields: ['account_head', 'tax_amount'], filters: [['parent', 'in', c]], limit_page_length: 20000 })).forEach(x => { const h = heads(x.account_head || ''); if (h) t[h] += x.tax_amount || 0; }); return t; };
      const lines = []; for (const c of chunk(si.map(x => x.name), 120)) lines.push(...await list('Sales Invoice Item', { parent: 'Sales Invoice', fields: ['gst_treatment', 'base_net_amount'], filters: [['parent', 'in', c]], limit_page_length: 20000 }));
      const [ot, it] = await Promise.all([tax('Sales Invoice', 'Sales Taxes and Charges', si.map(x => x.name)), tax('Purchase Invoice', 'Purchase Taxes and Charges', pi.filter(x => !x.is_reverse_charge).map(x => x.name))]);
      const by = t => lines.filter(l => l.gst_treatment === t).reduce((a, l) => a + l.base_net_amount, 0), taxable = by('Taxable'), nil = by('Nil-Rated') + by('Exempted'), nong = by('Non-GST');
      const net = { igst: ot.igst - it.igst, cgst: ot.cgst - it.cgst, sgst: ot.sgst - it.sgst, cess: ot.cess - it.cess };
      const row = (l, o) => `<div class="ld"><span>${l}</span><i></i><b>${inr(o)}</b></div>`, blk = (t, o) => `<section class="sec"><h2>${t}</h2>${row('Integrated tax (IGST)', o.igst)}${row('Central tax (CGST)', o.cgst)}${row('State tax (SGST)', o.sgst)}${o.cess ? row('Cess', o.cess) : ''}<div style="height:8px"></div></section>`;
      $('#out').innerHTML = `<section class="sec"><h2>3.1 Outward supplies</h2>${row('Taxable value', taxable)}${row('Nil rated and exempt', nil)}${nong ? row('Non-GST', nong) : ''}<div style="height:8px"></div></section>${blk('Tax on outward supplies', ot)}${blk('4. Input tax credit from purchases', it)}${blk(net.igst + net.cgst + net.sgst >= 0 ? 'Tax to pay (output less credit)' : 'Credit to carry forward', net)}<div class="pad t2">Worked out from your submitted bills and returns in these dates: ${si.length} sales and ${pi.length} purchase bills. Credit is not matched against your supplier's GSTR-2B here, and tax paid on reverse charge is left out. Check these figures against the GST portal before filing.</div>`;
      XR = [[S.company, 'GSTIN ' + S.gstin], ['GSTR-3B summary', r.from + ' to ' + r.to], [], ['Section', 'IGST', 'CGST', 'SGST', 'Cess'], ['Taxable value', taxable], ['Nil and exempt', nil], ['Non-GST', nong], ['Output tax', ot.igst, ot.cgst, ot.sgst, ot.cess], ['Input tax credit', it.igst, it.cgst, it.sgst, it.cess], ['Net payable', net.igst, net.cgst, net.sgst, net.cess]]; $('#ex').hidden = false;
    } catch (e) { $('#out').innerHTML = errBox(e); }
  };
  wireRange('g3', run); $('#xl').onclick = () => shareXlsx(XR, 'GSTR3B_' + RR.g3.to); run();
}, { title: 'GSTR-3B summary' });

/* ---------- report hub ---------- */
on(/^\/rpt$/, async () => {
  const row = (i, t, s, g) => `<div class="row tap" data-go="${g}" role="button"><span class="alert" style="padding:0;border:0"><span class="ico amber" style="background:var(--sunk);color:var(--ink)">${ic(i, 20)}</span></span><div class="grow"><div class="t1">${t}</div><div class="t2">${s}</div></div>${ic('chev', 18)}</div>`;
  view.innerHTML = `<section class="sec"><h2>Turnover</h2>${row('chart', 'Monthly turnover', 'Sales and purchases month by month', '/turnover/month')}${row('chart', 'Item wise turnover', 'What sold most, with quantity', '/turnover/item')}${row('chart', 'Company wise turnover', 'Sales by manufacturer', '/turnover/company')}${row('chart', 'Party wise turnover', 'Who buys most', '/turnover/party')}${row('trend', 'Sales and margin', 'Profit by party, item, company, salesman', '/reports')}</section>
  <section class="sec"><h2>Registers</h2>${row('receipt', 'Gross sales report', 'Every bill with taxes', '/rep/sales')}${row('cart', 'Gross purchase report', 'Every purchase with taxes', '/rep/purch')}</section>
  <section class="sec"><h2>Ledgers</h2>${row('users', 'Debtor ledger', 'Statement for one customer', '/ledger')}${row('rupee', 'Receivable aging', 'Who owes what, by how late', '/aging')}${row('truck', 'Payable to suppliers', 'What you owe', '/payables')}</section>
  <section class="sec"><h2>Books</h2>${row('layers', 'Trial balance', 'All accounts', '/rep/tb')}${row('trend', 'Profit and loss', 'Income less expenses', '/rep/pl')}${row('file', 'Balance sheet', 'Assets and liabilities', '/rep/bs')}</section>
  <section class="sec"><h2>GST</h2>${row('file', 'GSTR-1', 'B2B, B2C, credit notes, HSN', '/gst1')}${row('file', 'GSTR-3B summary', 'Tax payable after input credit', '/gst3b')}${row('rupee', 'GST balance', 'GST account balances', '/rep/gstbal')}${row('file', 'HSN summary', 'Sales by HSN code', '/rep/hsn')}</section>
  <section class="sec"><h2>Stock</h2>${row('box', 'Current stock', 'Quantity and value of every item', '/rep/stock')}${row('layers', 'Batch wise stock', 'Every batch in hand', '/rep/batch')}${row('clock', 'Short expiry', 'Expiring in the next 90 days', '/expiry/90')}${row('pill', 'Expired products', 'Past expiry, still in stock', '/expiry/0')}${row('cart', 'Reorder suggestions', 'Fast movers running low', '/reorder')}</section>`;
  $$('[data-go]').forEach(e => e.onclick = () => go(e.dataset.go));
}, { title: 'Reports' });

/* ---------- shortcuts: the buttons on Home ---------- */
const ACTS = [['bill', 'New bill', 'receipt', '/bill/new'], ['pur', 'Purchase bill', 'cart', '/pur/new'], ['rec', 'Receipt', 'rupee', '/receipt'], ['pay', 'Pay supplier', 'truck', '/pay'], ['sret', 'Sales return', 'refresh', '/bill/return'], ['pret', 'Purchase return', 'refresh', '/pur/return'], ['adj', 'Stock adjust', 'layers', '/adjust'], ['ord', 'New order', 'receipt', '/order/new'], ['bills', 'Find a bill', 'search', '/bills'], ['item', 'New item', 'box', '/new/item'], ['cust', 'New customer', 'users', '/new/customer'], ['turn', 'Turnover', 'chart', '/turnover/month'], ['led', 'Ledger', 'file', '/ledger'], ['g1', 'GSTR-1', 'file', '/gst1'], ['g3', 'GSTR-3B', 'file', '/gst3b'], ['exp', 'Short expiry', 'clock', '/expiry/90'], ['stk', 'Stock', 'box', '/stock'], ['rpt', 'All reports', 'chart', '/rpt']];
const SC_DEF = ['bill', 'rec', 'pur', 'bills'];
const myShortcuts = () => (S.sc && S.sc.length ? S.sc : SC_DEF).map(id => ACTS.find(a => a[0] === id)).filter(Boolean);
function shortcutsHtml() { const l = myShortcuts(); return l.length ? `<section class="sec"><div class="sc">${l.map(a => `<button class="scb" data-go="${a[3]}"><span class="ico">${ic(a[2], 22)}</span>${esc(a[1])}</button>`).join('')}</div></section>` : ''; }
on(/^\/shortcuts$/, () => {
  const cur = () => new Set(S.sc && S.sc.length ? S.sc : SC_DEF);
  const draw = () => { const c = cur(); view.innerHTML = `<div class="pad t2" style="padding-top:0">Tick the buttons you want at the top of Home. Tap a ticked one again to remove it.</div><section class="sec">${ACTS.map(a => `<div class="row tap" data-k="${a[0]}"><span class="ico amber" style="background:var(--sunk);color:var(--ink);width:36px;height:36px;border-radius:10px;display:grid;place-items:center">${ic(a[2], 20)}</span><div class="grow t1">${esc(a[1])}</div>${c.has(a[0]) ? `<span class="green">${ic('check', 22)}</span>` : ''}</div>`).join('')}</section>`; $$('[data-k]').forEach(e => e.onclick = () => { const c2 = cur(); c2.has(e.dataset.k) ? c2.delete(e.dataset.k) : c2.add(e.dataset.k); S.sc = ACTS.map(a => a[0]).filter(k => c2.has(k)); save(); draw(); }); };
  draw();
}, { title: 'Shortcuts' });
document.addEventListener('click', e => { const b = e.target.closest('.scb'); if (b) go(b.dataset.go); });
/* shortcut keys for a keyboard: Alt plus N, P, R, S, B, L, T */
window.addEventListener('keydown', e => { if (!e.altKey || e.ctrlKey || e.metaKey) return; const m = { n: '/bill/new', p: '/pur/new', r: '/receipt', y: '/pay', s: '/stock', b: '/bills', l: '/ledger', t: '/turnover/month', i: '/new/item' }[e.key.toLowerCase()]; if (m) { e.preventDefault(); go(m); } });

function quickActions() {
  openSheet('Quick actions', `<div class="qa"><button class="p" data-g="/bill/new"><span class="ico">${ic('receipt')}</span>New bill</button><button data-g="/receipt"><span class="ico">${ic('rupee')}</span>Receipt</button><button data-g="/pur/new"><span class="ico">${ic('cart')}</span>Purchase bill</button><button data-g="/pay"><span class="ico">${ic('truck')}</span>Pay supplier</button><button data-g="/order/new"><span class="ico">${ic('receipt')}</span>New order</button><button data-g="/bill/return"><span class="ico">${ic('refresh')}</span>Sales return</button><button data-g="/new/item"><span class="ico">${ic('box')}</span>New item</button><button data-g="/adjust"><span class="ico">${ic('layers')}</span>Stock adjust</button></div>`, root => {
    $$('[data-g]', root).forEach(b => b.onclick = () => { const g = b.dataset.g; hideSheet(); history.back(); setTimeout(() => go(g), 80); });
  });
}
