'use strict';
/* MM Pharma app - screens */
let order = { customer: null, items: [] };
$('#fab').onclick = () => current && current.fabAct && current.fabAct();

/* ---------- Home ---------- */
on(/^\/home$/, async () => {
  const draw = (d, stale) => {
    const t = new Date(), hr = t.getHours(), gr = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    const mx = Math.max(...d.days.map(x => x.v), 1);
    view.innerHTML = `<div class="pad" style="padding-top:0"><div class="mut">${t.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div><div class="mid">${gr}</div></div>
    ${typeof shortcutsHtml === 'function' ? shortcutsHtml() : ''}
    <section class="sec"><h2>Today’s day sheet</h2>
      <div class="ld"><span>Sales</span><i></i><b>${inr0(d.salesToday)}</b></div>
      <div class="ld"><span>Bills made</span><i></i><b>${d.billsToday}</b></div>
      <div class="ld"><span>Money collected</span><i></i><b>${inr0(d.collected)}</b></div>
      <div class="ld"><span>Sales this month</span><i></i><b>${cmp(d.salesMonth)}</b></div>
      <div class="ld sum"><span>To collect from parties</span><i></i><b>${cmp(d.recv)}</b></div>
      <div class="ld"><span class="red">of which overdue</span><i></i><b class="red">${cmp(d.overdue)}</b></div>
      <div class="ld"><span>To pay suppliers</span><i></i><b>${cmp(d.pay)}</b></div>
      <div class="ld" style="padding-bottom:14px"><span>Stock value</span><i></i><b>${cmp(d.stockVal)}</b></div>
    </section>
    <section class="sec"><h2>Sales, last 14 days</h2><div class="bars" role="img" aria-label="Daily sales">${d.days.map((x, i) => `<i class="${i === d.days.length - 1 ? 't' : ''}" style="height:${Math.max(3, x.v / mx * 100)}%" title="${fmtDate(x.d)} ${inr0(x.v)}"></i>`).join('')}</div><div class="axis"><span>${fmtDate(d.days[0].d)}</span><span>Today</span></div></section>
    <section class="sec"><h2>Needs attention</h2><div id="alerts">${alertsHtml(d)}</div></section>`;
    $$('[data-go]').forEach(e => e.onclick = () => go(e.dataset.go));
  };
  const c = cacheGet('home'); if (c) draw(c);
  const t = today(), m = t.slice(0, 8) + '01';
  const [inv, pe, rec, ap, stv, ex, ex30] = await Promise.all([
    invoicesBetween(addDays(t, -13), t),
    list('Payment Entry', { fields: ['sum(base_paid_amount) as v'], filters: [['docstatus', '=', 1], ['payment_type', '=', 'Receive'], ['posting_date', '=', t]] }),
    receivables(),
    list('Purchase Invoice', { fields: ['sum(outstanding_amount) as v'], filters: [['docstatus', '=', 1], ['outstanding_amount', '>', 0]] }),
    list('Bin', { fields: ['sum(stock_value) as v'], filters: [['warehouse', 'like', 'Stores%']] }),
    expiryRows(0), expiryRows(30, 'Stores%'),
  ]);
  const monthInv = (await memo('m' + m, () => invoicesBetween(m, t)));
  const days = Array.from({ length: 14 }, (_, i) => { const d = addDays(t, i - 13); return { d, v: inv.filter(x => x.posting_date === d).reduce((a, x) => a + x.base_grand_total, 0) }; });
  const parties = ageParties(rec);
  const d = { days, salesToday: days[13].v, billsToday: inv.filter(x => x.posting_date === t).length, collected: pe[0] ? pe[0].v : 0, salesMonth: monthInv.reduce((a, x) => a + x.base_grand_total, 0),
    recv: rec.reduce((a, x) => a + x.outstanding_amount, 0), overdue: parties.reduce((a, p) => a + p.overdue, 0), pay: ap[0].v || 0, stockVal: stv[0].v || 0,
    nOver: parties.filter(p => p.overdue > 0).length, n90: parties.filter(p => p.b[4] > 0).length, top: parties.filter(p => p.overdue > 0).sort((a, b) => b.overdue - a.overdue).slice(0, 2).map(p => p.name),
    expN: ex.length, expV: ex.reduce((a, x) => a + (x.cost_value || 0), 0), n30: ex30.length, v30: ex30.reduce((a, x) => a + (x.cost_value || 0), 0) };
  cacheSet('home', d); draw(d);
  S.badge = { party: d.n90 || 0 }; drawTabs('home');
  reorderList().then(r => { d.low = r.length; $('#alerts') && ($('#alerts').innerHTML = alertsHtml(d)); $$('[data-go]').forEach(e => e.onclick = () => go(e.dataset.go)); S.badge = { party: d.n90 || 0, more: r.length || 0 }; if (current && current.tab) drawTabs(current.tab); }).catch(() => 0);
}, { tab: 'home', title: 'MM Pharma', fab: 'New', fabAct: () => quickActions(), skel: () => skeleton(6) });
function alertsHtml(d) {
  const a = [];
  if (d.nOver) a.push(['alert', 'red', `${d.nOver} parties are overdue`, `${cmp(d.overdue)} to chase${d.top.length ? ', starting with ' + d.top.join(' and ') : ''}`, '/party/overdue']);
  if (d.expN) a.push(['pill', 'red', `Expired stock: ${cmp(d.expV)}`, `${d.expN} batches to return or write off`, '/expiry/0']);
  if (d.n30) a.push(['clock', 'amber', `Expiring within 30 days: ${cmp(d.v30)}`, `${d.n30} batches, sell or return soon`, '/expiry/30']);
  if (d.low) a.push(['cart', 'amber', `${d.low} fast-moving items running low`, 'Under 15 days of stock left', '/reorder']);
  if (!a.length) return empty('All clear', 'Nothing needs your attention right now.');
  return a.map(([i, c, t, s, g]) => `<div class="alert" data-go="${g}" role="button" tabindex="0"><span class="ico ${c}">${ic(i, 20)}</span><div class="grow"><div class="t1">${esc(t)}</div><div class="t2">${esc(s)}</div></div>${ic('chev', 18)}</div>`).join('');
}
function quickActions() {
  openSheet('Quick actions', `<div class="qa"><button class="p" data-a="order"><span class="ico">${ic('receipt')}</span>New order</button><button data-a="collect"><span class="ico">${ic('rupee')}</span>Collect payment</button><button data-a="stock"><span class="ico">${ic('search')}</span>Check stock</button><button data-a="exp"><span class="ico">${ic('clock')}</span>Expiring soon</button></div>`, root => {
    $$('[data-a]', root).forEach(b => b.onclick = () => { const a = b.dataset.a; hideSheet(); history.back(); setTimeout(() => { if (a === 'order') go('/order/new'); else if (a === 'collect') partyPicker(p => collectSheet(p)); else if (a === 'stock') go('/stock'); else go('/expiry/30'); }, 60); });
  });
}

/* ---------- Stock ---------- */
let stockMode = 'top';
on(/^\/stock$/, async () => {
  view.innerHTML = `<label class="field s">${ic('search', 20)}<input id="s" placeholder="Search item, salt or company" autocomplete="off" enterkeyhint="search" aria-label="Search stock"></label>
    <div class="chips" id="modes">${[['top', 'Top sellers'], ['low', 'Running low'], ['exp', 'Expiring']].map(([k, l]) => `<button class="chip ${stockMode === k ? 'on' : ''}" data-m="${k}">${l}</button>`).join('')}</div><div id="res">${skeleton(5)}</div>`;
  const show = async () => {
    const v = $('#s').value.trim(), res = $('#res');
    try {
      if (v.length >= 2) {
        const items = await searchItems(v), st = items.length ? await stockByItem(items.map(i => i.name)) : {};
        res.innerHTML = items.length ? `<div class="sec">${items.map(i => stockRow(i.name, i.item_name, (i.salt_composition || '') + (i.drug_schedule ? '  Sch ' + i.drug_schedule : ''), st[i.name] ? st[i.name].q : 0)).join('')}</div>` : empty('No match', 'Try the salt name or the first letters of the item.');
      } else if (stockMode === 'top') {
        const sold = await sales30(), top = Object.values(sold).sort((a, b) => b.qty - a.qty).slice(0, 25), st = top.length ? await stockByItem(top.map(i => i.code)) : {};
        res.innerHTML = top.length ? `<div class="sec"><h2>Sold most in the last 30 days</h2>${top.map(i => stockRow(i.code, i.name, num(i.qty) + ' sold', st[i.code] ? st[i.code].q : 0)).join('')}</div>` : empty('No sales yet', 'Items you bill will appear here.');
      } else if (stockMode === 'low') {
        const r = await reorderList();
        res.innerHTML = r.length ? `<div class="sec"><h2>Under 15 days of stock</h2>${r.map(i => stockRow(i.code, i.name, `${num(i.sold)} sold in 30 days, about ${Math.floor(i.cover)} days left`, i.stock)).join('')}</div>` : empty('Stock looks healthy', 'No fast-moving item is running low.');
      } else {
        const r = (await expiryRows(90, 'Stores%')).slice(0, 80);
        res.innerHTML = r.length ? `<div class="sec"><h2>Expiring within 90 days</h2>${r.map(x => `<div class="row tap" data-i="${esc(x.item)}"><div class="grow"><div class="t1">${esc(x.item)}</div><div class="t2">${esc(x.batch)}</div></div>${stamp(x.expiry)}<b class="nw" style="min-width:40px;text-align:right">${num(x.qty)}</b></div>`).join('')}</div>` : empty('Nothing close to expiry', 'No batch expires in the next 90 days.');
      }
      $$('#res .row').forEach(e => e.onclick = () => go('/item/' + encodeURIComponent(e.dataset.i)));
    } catch (e) { if (e.auth) return loginView(e.message); res.innerHTML = errBox(e); }
  };
  $('#s').oninput = debounce(show, 350);
  $$('#modes .chip').forEach(b => b.onclick = () => { stockMode = b.dataset.m; $('#s').value = ''; $$('#modes .chip').forEach(x => x.classList.toggle('on', x === b)); show(); });
  show();
}, { tab: 'stock', title: 'Stock' });
const stockRow = (code, name, sub, q) => `<div class="row tap" data-i="${esc(code)}" role="button"><div class="grow"><div class="t1">${esc(name)}</div><div class="t2">${esc(sub)}</div></div><div class="r"><b class="${q > 0 ? '' : 'red'}">${num(q)}</b><div class="t2">in stock</div></div></div>`;

on(/^\/item\/(.+)$/, async code => {
  const [it, bq, bd, pr, bin, sold] = await Promise.all([
    list('Item', { fields: ['name', 'item_name', 'stock_uom', 'salt_composition', 'manufacturer_company', 'drug_schedule', 'gst_hsn_code'], filters: [['name', '=', code]] }),
    method('erpnext.stock.doctype.batch.batch.get_batch_qty', { item_code: code }),
    list('Batch', { fields: ['name', 'expiry_date', 'batch_mrp'], filters: [['item', '=', code]], limit_page_length: 300 }),
    list('Item Price', { fields: ['price_list', 'price_list_rate', 'customer'], filters: [['item_code', '=', code], ['selling', '=', 1]], limit_page_length: 20 }),
    stockByItem([code]), sales30().catch(() => ({})),
  ]);
  const x = it[0]; setTitle(x.item_name);
  const meta = {}; bd.forEach(b => meta[b.name] = b);
  const rows = (bq || []).filter(b => b.qty > 0).map(b => ({ ...b, ...meta[b.batch_no] })).sort((a, b) => (a.expiry_date || '9999').localeCompare(b.expiry_date || '9999'));
  const ok = rows.filter(r => !String(r.warehouse).startsWith('Expired')), tot = ok.reduce((a, r) => a + r.qty, 0);
  const s30 = sold[code] ? sold[code].qty : 0, cover = s30 > 0 ? Math.floor(tot / (s30 / 30)) : null, cost = bin[code] ? bin[code].v : 0;
  const ptr = pr.find(p => /ptr/i.test(p.price_list) && !p.customer);
  view.innerHTML = `<div class="pad" style="padding-top:0"><div class="t2">${esc(x.salt_composition || 'Composition not set')}</div><div class="t2">${esc(x.manufacturer_company || '')}${x.gst_hsn_code ? ' · HSN ' + esc(x.gst_hsn_code) : ''}${x.drug_schedule ? ' · Schedule ' + esc(x.drug_schedule) : ''}</div></div>
  <section class="sec"><div class="ld" style="padding-top:12px"><span>In stock</span><i></i><b class="${tot > 0 ? '' : 'red'}">${num(tot)} ${esc(x.stock_uom)}</b></div>
    <div class="ld"><span>Sold in 30 days</span><i></i><b>${num(s30)}</b></div>
    <div class="ld"><span>Stock will last</span><i></i><b class="${cover !== null && cover < 15 ? 'amber' : ''}">${cover === null ? 'no recent sales' : cover + ' days'}</b></div>
    ${cost ? `<div class="ld"><span>Average cost</span><i></i><b>${inr(cost)}</b></div>` : ''}
    ${cost && ptr ? `<div class="ld" style="padding-bottom:12px"><span>Margin at PTR</span><i></i><b class="${ptr.price_list_rate > cost ? 'green' : 'red'}">${((ptr.price_list_rate - cost) / ptr.price_list_rate * 100).toFixed(1)}%</b></div>` : '<div style="height:8px"></div>'}</section>
  <section class="sec"><h2>Batches, earliest expiry first</h2>${rows.map(r => `<div class="row"><div class="grow"><div class="t1">${esc(r.batch_no)}</div><div class="t2">MRP ${inr(r.batch_mrp)}${String(r.warehouse).startsWith('Expired') ? ' · expired stock room' : ''}</div></div>${stamp(r.expiry_date)}<b class="nw" style="min-width:44px;text-align:right">${num(r.qty)}</b></div>`).join('') || empty('No stock', 'This item has no batch with stock.')}</section>
  ${pr.length ? `<section class="sec"><h2>Selling rates</h2>${pr.map(p => `<div class="row"><div class="grow">${esc(p.price_list)}${p.customer ? `<div class="t2">${esc(p.customer)}</div>` : ''}</div><b>${inr(p.price_list_rate)}</b></div>`).join('')}</section>` : ''}
  <div class="acts"><button class="btn" id="add">${ic('plus', 20)}Add to order</button></div>`;
  $('#add').onclick = () => { order.pending = code; go('/order/new'); };
}, { title: '' });

/* ---------- Parties ---------- */
let partyMode = 'all';
on(/^\/party(?:\/(overdue))?$/, async arg => {
  if (arg) partyMode = 'overdue';
  const rec = await receivables(), all = ageParties(rec), tot = all.reduce((a, p) => a + p.total, 0), bt = [0, 1, 2, 3, 4].map(i => all.reduce((a, p) => a + p.b[i], 0));
  view.innerHTML = `<label class="field s">${ic('search', 20)}<input id="s" placeholder="Search any party" autocomplete="off" aria-label="Search parties"></label>
    <section class="sec"><div class="pad"><div class="t2">Total to collect</div><div class="big">${inr0(tot)}</div><div style="margin-top:12px">${ageBar(bt, tot)}</div></div><div class="legend">${BUCKETS.map(([l], i) => `<span style="--c:var(--${['a0', 'a1', 'a2', 'a3', 'a4'][i] === 'a0' ? 'ink2' : 'x'})" class="lg${i}">${l} ${cmp(bt[i])}</span>`).join('')}</div></section>
    <div class="chips" id="modes">${[['all', 'All'], ['overdue', 'Overdue'], ['d90', 'Over 90 days']].map(([k, l]) => `<button class="chip ${partyMode === k ? 'on' : ''}" data-m="${k}">${l}</button>`).join('')}</div><div id="res"></div>`;
  $$('.legend span').forEach((s, i) => s.style.setProperty('--c', ['#9AA7BA', 'var(--saffron)', '#E0731A', 'var(--red)', '#7A130E'][i]));
  const board = () => {
    let r = all; if (partyMode === 'overdue') r = all.filter(p => p.overdue > 0).sort((a, b) => b.overdue - a.overdue); if (partyMode === 'd90') r = all.filter(p => p.b[4] > 0).sort((a, b) => b.b[4] - a.b[4]);
    $('#res').innerHTML = r.length ? `<div class="sec">${r.slice(0, 80).map(p => partyRow(p)).join('')}</div>` : empty('No parties here', 'Nobody falls in this group.');
    $$('#res .row').forEach(e => e.onclick = () => go('/p/' + encodeURIComponent(e.dataset.c)));
  };
  board();
  $$('#modes .chip').forEach(b => b.onclick = () => { partyMode = b.dataset.m; $$('#modes .chip').forEach(x => x.classList.toggle('on', x === b)); $('#s').value = ''; board(); });
  $('#s').oninput = debounce(async () => {
    const v = $('#s').value.trim(); if (v.length < 2) return board();
    const cs = await list('Customer', { fields: ['name', 'customer_name', 'area', 'salesman'], filters: [['disabled', '=', 0]], or_filters: [['customer_name', 'like', '%' + v + '%'], ['name', 'like', '%' + v + '%']], limit_page_length: 25, order_by: 'customer_name asc' });
    const byC = Object.fromEntries(all.map(p => [p.customer, p]));
    $('#res').innerHTML = cs.length ? `<div class="sec">${cs.map(c => byC[c.name] ? partyRow(byC[c.name]) : `<div class="row tap" data-c="${esc(c.name)}"><span class="stripe"></span><div class="grow"><div class="t1">${esc(c.customer_name)}</div><div class="t2">${esc([c.area, c.salesman].filter(Boolean).join(' · ') || 'Nothing outstanding')}</div></div>${ic('chev', 18)}</div>`).join('')}</div>` : empty('No match', 'Check the spelling or try fewer letters.');
    $$('#res .row').forEach(e => e.onclick = () => go('/p/' + encodeURIComponent(e.dataset.c)));
  });
}, { tab: 'party', title: 'Parties', fab: 'Collect', fabAct: () => partyPicker(p => collectSheet(p)) });
const partyRow = p => `<div class="row tap" data-c="${esc(p.customer)}" role="button"><span class="stripe ${p.worst >= 3 ? 's2' : p.worst >= 1 ? 's1' : ''}"></span><div class="grow"><div class="t1">${esc(p.name)}</div><div class="t2">${p.bills} bill${p.bills > 1 ? 's' : ''}, oldest due ${fmtDate(p.oldest)}</div><div style="margin-top:8px">${ageBar(p.b, p.total)}</div></div><div class="r"><b>${inr0(p.total)}</b>${p.overdue > 0 ? `<div class="t2 red">${inr0(p.overdue)} overdue</div>` : '<div class="t2 green">not due</div>'}</div></div>`;

on(/^\/p\/(.+)$/, async name => {
  const [c, inv, pays, sales] = await Promise.all([
    list('Customer', { fields: ['name', 'customer_name', 'mobile_no', 'area', 'salesman', 'drug_licence_1', 'drug_licence_2', 'allow_overdue_billing'], filters: [['name', '=', name]] }),
    list('Sales Invoice', { fields: ['name', 'posting_date', 'due_date', 'outstanding_amount', 'grand_total'], filters: [['customer', '=', name], ['docstatus', '=', 1], ['outstanding_amount', '>', 0]], order_by: 'due_date asc', limit_page_length: 300 }),
    list('Payment Entry', { fields: ['name', 'posting_date', 'paid_amount', 'mode_of_payment', 'docstatus'], filters: [['party', '=', name], ['payment_type', '=', 'Receive'], ['docstatus', '<', 2]], order_by: 'posting_date desc', limit_page_length: 5 }),
    list('Sales Invoice', { fields: ['name', 'posting_date', 'grand_total'], filters: [['customer', '=', name], ['docstatus', '=', 1]], order_by: 'posting_date desc', limit_page_length: 15 }),
  ]);
  const x = c[0]; setTitle(x.customer_name);
  const t = today(), b = [0, 0, 0, 0, 0]; inv.forEach(i => b[bucketOf(i.due_date, t)] += i.outstanding_amount);
  const total = b.reduce((a, v) => a + v, 0), od = total - b[0];
  view.innerHTML = `<div class="pad" style="padding-top:0"><div class="t2">${esc([x.area, x.salesman].filter(Boolean).join(' · '))}</div><div class="t2">Drug licence ${esc(x.drug_licence_1 || 'not set')}${x.drug_licence_2 ? ' / ' + esc(x.drug_licence_2) : ''}</div>${x.allow_overdue_billing ? '<div class="stamp ok" style="margin-top:6px">Billing allowed even if overdue</div>' : ''}</div>
  <section class="sec"><div class="pad"><div class="t2">Outstanding</div><div class="big">${inr0(total)}</div>${od > 0 ? `<div class="red" style="margin-top:2px">${inr0(od)} overdue</div>` : '<div class="green" style="margin-top:2px">Nothing overdue</div>'}<div style="margin-top:12px">${ageBar(b, total)}</div></div>
  <div class="legend">${BUCKETS.map(([l], i) => b[i] > 0 ? `<span class="lg" data-i="${i}">${l} ${inr0(b[i])}</span>` : '').join('')}</div>
  <div class="acts">${total > 0 ? `<button class="btn sa" id="col">${ic('rupee', 20)}Collect</button>` : ''}<button class="btn" id="ord">${ic('receipt', 20)}Order</button></div>
  <div class="acts" style="padding-top:0">${x.mobile_no ? `<a class="btn out" href="tel:${esc(x.mobile_no)}">${ic('phone', 20)}Call</a>` : ''}${total > 0 ? `<a class="btn out" id="wa" href="#">${ic('chat', 20)}Remind</a>` : ''}</div>
  <div class="acts" style="padding-top:0"><button class="btn out" id="lg">${ic('file', 20)}Ledger</button><button class="btn out" id="nb">${ic('plus', 20)}New bill</button></div></section>
  <section class="sec"><h2>Unpaid bills, oldest first</h2>${inv.map(i => { const d = daysBetween(t, i.due_date); return `<div class="row tap" data-b="${esc(i.name)}" role="button"><div class="grow"><div class="t1">${esc(i.name)}</div><div class="t2">Billed ${fmtDate(i.posting_date)}, due ${fmtDate(i.due_date)}</div></div><div class="r"><b>${inr0(i.outstanding_amount)}</b>${d > 0 ? `<div class="t2 ${d > 60 ? 'red' : 'amber'}">${d} days late</div>` : ''}</div></div>`; }).join('') || empty('All paid up', 'No unpaid bills for this party.')}</section>
  ${pays.length ? `<section class="sec"><h2>Recent payments</h2>${pays.map(p => `<div class="row"><div class="grow"><div class="t1">${inr0(p.paid_amount)}</div><div class="t2">${fmtDate(p.posting_date)}${p.mode_of_payment ? ' · ' + esc(p.mode_of_payment) : ''}</div></div>${p.docstatus === 0 ? '<span class="stamp n90">Draft</span>' : ''}</div>`).join('')}</section>` : ''}
  ${sales.length ? `<section class="sec"><h2>Recent bills</h2>${sales.map(p => `<div class="row tap" data-b="${esc(p.name)}" role="button"><div class="grow"><div class="t1">${esc(p.name)}</div><div class="t2">${fmtDate(p.posting_date)}</div></div><b>${inr0(p.grand_total)}</b></div>`).join('')}</section>` : ''}`;
  $$('.legend .lg').forEach(s => s.style.setProperty('--c', ['#9AA7BA', 'var(--saffron)', '#E0731A', 'var(--red)', '#7A130E'][s.dataset.i]));
  $$('[data-b]').forEach(e => e.onclick = () => go('/inv/' + encodeURIComponent(e.dataset.b)));
  $('#lg').onclick = () => go('/ledger/Customer/' + encodeURIComponent(x.name));
  $('#nb').onclick = () => { ED = edNew('sales'); ED.party = { name: x.name, title: x.customer_name }; go('/bill/new'); };
  $('#ord').onclick = () => { order.customer = { name: x.name, customer_name: x.customer_name }; go('/order/new'); };
  if ($('#col')) $('#col').onclick = () => collectSheet(x.name, inv);
  if ($('#wa')) $('#wa').href = waLink(x.mobile_no, `Dear ${x.customer_name},\nYour outstanding with ${S.company} is ${inr0(total)}${od > 0 ? ` (${inr0(od)} overdue)` : ''}.\n\n` + inv.slice(0, 12).map(i => `${i.name}  ${fmtDate(i.posting_date)}  ${inr0(i.outstanding_amount)}`).join('\n') + (inv.length > 12 ? `\n…and ${inv.length - 12} more bills` : '') + '\n\nKindly arrange the payment. Thank you.');
}, { title: '' });

function partyPicker(cb) {
  openSheet('Choose party', `<label class="field s" style="margin-top:8px">${ic('search', 20)}<input id="pp" placeholder="Search party name" autocomplete="off" aria-label="Search party"></label><div id="ppl"></div>`, root => {
    $('#pp', root).focus();
    $('#pp', root).oninput = debounce(async () => {
      const v = $('#pp', root).value.trim(); if (v.length < 2) return;
      const cs = await list('Customer', { fields: ['name', 'customer_name', 'area'], filters: [['disabled', '=', 0]], or_filters: [['customer_name', 'like', '%' + v + '%'], ['name', 'like', '%' + v + '%']], limit_page_length: 15 });
      $('#ppl', root).innerHTML = cs.map(c => `<div class="row tap" data-c="${esc(c.name)}" data-n="${esc(c.customer_name)}"><div class="grow"><div class="t1">${esc(c.customer_name)}</div><div class="t2">${esc(c.area || '')}</div></div></div>`).join('') || empty('No match', '');
      $$('#ppl .row', root).forEach(e => e.onclick = () => { hideSheet(); history.back(); setTimeout(() => cb(e.dataset.c, null, e.dataset.n), 60); });
    });
  });
}
async function collectSheet(party, inv) {
  try {
    inv = inv || await list('Sales Invoice', { fields: ['name', 'due_date', 'outstanding_amount'], filters: [['customer', '=', party], ['docstatus', '=', 1], ['outstanding_amount', '>', 0]], order_by: 'due_date asc', limit_page_length: 300 });
    const modes = await list('Mode of Payment', { fields: ['name'], limit_page_length: 20 }), total = inv.reduce((a, i) => a + i.outstanding_amount, 0);
    openSheet('Collect payment', `<div class="pad"><div class="t2">${esc(party)}</div><div class="mid">${inr0(total)} outstanding</div></div>
      <label class="field"><input id="am" type="number" inputmode="decimal" placeholder="Amount received" value="${total || ''}" aria-label="Amount received"></label>
      <label class="field"><select id="md" class="in" aria-label="Mode of payment">${modes.map(m => `<option ${m.name === 'Cash' ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
      <label class="field"><input id="rf" placeholder="Reference or cheque number (optional)" aria-label="Reference"></label>
      <div class="pad t2" id="al"></div><div class="acts"><button class="btn sa" id="sv">Save receipt</button></div><div class="pad t2" style="padding-top:0">Saved as a draft receipt. Submit it in ERPNext to post it to the books.</div>`, root => {
      const alloc = () => { let r = parseFloat($('#am', root).value) || 0; const a = []; for (const i of inv) { if (r <= 0) break; const x = Math.min(r, i.outstanding_amount); a.push({ reference_doctype: 'Sales Invoice', reference_name: i.name, allocated_amount: +x.toFixed(2) }); r -= x; } return { a, extra: r }; };
      const upd = () => { const { a, extra } = alloc(); $('#al', root).textContent = a.length ? `Clears ${a.length} bill${a.length > 1 ? 's' : ''}, oldest first${extra > 0.009 ? `; ${inr(extra)} stays as advance` : ''}.` : ''; };
      $('#am', root).oninput = upd; upd();
      $('#sv', root).onclick = async () => {
        const amt = parseFloat($('#am', root).value) || 0; if (amt <= 0) return toast('Enter the amount received');
        $('#sv', root).disabled = true;
        try {
          const mode = $('#md', root).value;
          const [from, to] = await Promise.all([method('erpnext.accounts.party.get_party_account', { party_type: 'Customer', party, company: S.company }), method('erpnext.accounts.doctype.sales_invoice.sales_invoice.get_bank_cash_account', { mode_of_payment: mode, company: S.company })]);
          const r = await api('/api/resource/Payment Entry', { method: 'POST', body: { payment_type: 'Receive', company: S.company, posting_date: today(), party_type: 'Customer', party, mode_of_payment: mode, paid_from: from, paid_to: to.account, paid_from_account_currency: 'INR', paid_to_account_currency: 'INR', paid_amount: amt, received_amount: amt, source_exchange_rate: 1, target_exchange_rate: 1, reference_no: $('#rf', root).value.trim() || undefined, reference_date: today(), references: alloc().a } });
          hideSheet(); history.back(); toast('Receipt ' + r.name + ' saved as draft', 4500); memo.clear(); setTimeout(route, 80);
        } catch (e) { toast(e.message, 6000); $('#sv', root).disabled = false; }
      };
    });
  } catch (e) { toast(e.message, 5000); }
}

/* ---------- Orders ---------- */
let orderTab = 'all';
on(/^\/orders$/, async () => {
  const so = await list('Sales Order', { fields: ['name', 'customer_name', 'transaction_date', 'grand_total', 'status', 'docstatus'], filters: orderTab === 'draft' ? [['docstatus', '=', 0]] : [['docstatus', '<', 2]], order_by: 'creation desc', limit_page_length: 40 });
  view.innerHTML = `<div class="chips">${[['all', 'All'], ['draft', 'Drafts']].map(([k, l]) => `<button class="chip ${orderTab === k ? 'on' : ''}" data-m="${k}">${l}</button>`).join('')}</div>
    ${so.length ? `<div class="sec">${so.map(o => `<div class="row tap" data-o="${esc(o.name)}" role="button"><div class="grow"><div class="t1">${esc(o.customer_name)}</div><div class="t2">${esc(o.name)} · ${fmtDate(o.transaction_date)}</div></div><div class="r"><b>${inr0(o.grand_total)}</b><div class="t2">${o.docstatus === 0 ? 'Draft' : esc(o.status)}</div></div></div>`).join('')}</div>` : empty('No orders yet', 'Tap New order to take the first one.')}`;
  $$('.chip').forEach(b => b.onclick = () => { orderTab = b.dataset.m; route(); });
  $$('[data-o]').forEach(e => e.onclick = () => go('/so/' + encodeURIComponent(e.dataset.o)));
}, { tab: 'orders', title: 'Orders', fab: 'New order', fabAct: () => go('/order/new') });

function itemRows(d) {
  if (d.marg_items) return d.marg_items.split('\n').map(l => { const f = l.split('|'), p = +f[1] || 0, fr = +f[2] || 0, r = +f[3] || 0; return `<div class="row"><div class="grow"><div class="t1">${esc(f[0])}</div><div class="t2">${num(p)}${fr ? ' + ' + num(fr) + ' free' : ''} × ${inr(r)}${f[5] ? ' · batch ' + esc(f[5]) : ''}${f[4] ? ' · exp ' + esc(f[4]) : ''}</div></div><b>${inr(p * r)}</b></div>`; }).join('');
  if (d.items.length === 1 && /^Opening Invoice/i.test(d.items[0].item_name)) return `<div class="row"><div class="grow"><div class="t1">Opening balance brought from Marg</div><div class="t2">The drug list for this older bill was not available.</div></div></div>`;
  return d.items.map(i => `<div class="row"><div class="grow"><div class="t1">${esc(i.item_name)}</div><div class="t2">${num(i.qty)} × ${inr(i.rate)}${i.batch_no ? ' · batch ' + esc(i.batch_no) : ''}${i.discount_percentage ? ' · ' + num(i.discount_percentage) + '% off' : ''}</div></div><b>${inr(i.amount)}</b></div>`).join('');
}
on(/^\/inv\/(.+)$/, async name => {
  const d = await getDoc('Sales Invoice', name); setTitle(d.name);
  const cu = (await list('Customer', { fields: ['mobile_no'], filters: [['name', '=', d.customer]] }))[0], t = today();
  const late = d.outstanding_amount > 0 ? daysBetween(t, d.due_date) : 0;
  view.innerHTML = `<div class="pad" style="padding-top:0"><div class="mid">${esc(d.customer_name)}</div><div class="t2">Billed ${fmtDate(d.posting_date)} · due ${fmtDate(d.due_date)}</div>
    <div style="margin-top:8px">${d.docstatus === 2 ? '<span class="stamp exp">Cancelled</span>' : d.outstanding_amount > 0 ? `<span class="stamp ${late > 0 ? 'exp' : 'n30'}">${inr0(d.outstanding_amount)} unpaid${late > 0 ? ', ' + late + ' days late' : ''}</span>` : '<span class="stamp ok">Paid</span>'}</div></div>
  <div class="acts"><button class="btn" id="pdf">${ic('share', 20)}Share PDF</button><a class="btn out" id="wa" href="#">${ic('chat', 20)}Send as text</a></div>
  ${typeof billActions === 'function' ? billActions(d) : ''}
  <section class="sec"><h2>Items</h2>${itemRows(d)}
    <div class="ld" style="padding-top:12px"><span>Total before tax</span><i></i><b>${inr(d.net_total)}</b></div>
    ${(d.taxes || []).filter(x => x.tax_amount).map(x => `<div class="ld"><span>${esc(String(x.description).replace(/ - MPD$/, ''))}</span><i></i><b>${inr(x.tax_amount)}</b></div>`).join('')}
    ${d.rounding_adjustment ? `<div class="ld"><span>Round off</span><i></i><b>${inr(d.rounding_adjustment)}</b></div>` : ''}
    <div class="ld sum"><span>Bill total</span><i></i><b>${inr(d.rounded_total || d.grand_total)}</b></div><div style="height:8px"></div></section>
  <div class="acts"><a class="btn out" href="${esc(S.url)}/app/sales-invoice/${encodeURIComponent(d.name)}">Open in ERPNext</a></div>`;
  $('#pdf').onclick = () => sharePdf('Sales Invoice', d.name, 'MM Pharma Tax Invoice');
  if (typeof wireBill === 'function') wireBill(d);
  $('#wa').href = waLink(cu && cu.mobile_no, `Bill ${d.name} dated ${fmtDate(d.posting_date)}\n${d.customer_name}\nTotal ${inr(d.rounded_total || d.grand_total)}${d.outstanding_amount > 0 ? `\nUnpaid ${inr(d.outstanding_amount)}, due ${fmtDate(d.due_date)}` : ''}\n${S.company}`);
}, { title: '' });
on(/^\/so\/(.+)$/, async name => {
  const d = await getDoc('Sales Order', name); setTitle(d.name);
  view.innerHTML = `<div class="pad" style="padding-top:0"><div class="mid">${esc(d.customer_name)}</div><div class="t2">${fmtDate(d.transaction_date)} · ${d.docstatus === 0 ? 'Draft, not yet billed' : esc(d.status)}</div></div>
  <section class="sec">${d.items.map(i => `<div class="row"><div class="grow"><div class="t1">${esc(i.item_name)}</div><div class="t2">${num(i.qty)} × ${inr(i.rate)}</div></div><b>${inr(i.amount)}</b></div>`).join('')}<div class="ld sum"><span>Total</span><i></i><b>${inr(d.grand_total)}</b></div><div style="height:8px"></div></section>
  <div class="acts"><a class="btn out" href="${esc(S.url)}/app/sales-order/${encodeURIComponent(d.name)}">Open in ERPNext</a><a class="btn out" id="wa" href="#">${ic('chat', 20)}Text</a><button class="btn" id="pdf">${ic('share', 20)}PDF</button></div>`;
  $('#pdf').onclick = () => sharePdf('Sales Order', d.name, 'Standard');
  const ph = (await list('Customer', { fields: ['mobile_no'], filters: [['name', '=', d.customer]] }))[0];
  $('#wa').href = waLink(ph && ph.mobile_no, `Order for ${d.customer_name}\n` + d.items.map(i => `${num(i.qty)} × ${i.item_name} @ ${inr(i.rate)}`).join('\n') + `\n\nTotal ${inr(d.grand_total)} + GST\n${S.company}`);
}, { title: '' });

on(/^\/order\/new$/, async () => {
  const draw = () => {
    const total = order.items.reduce((a, i) => a + i.qty * i.rate, 0);
    view.innerHTML = `<section class="sec"><div class="row tap" id="pc" role="button"><div class="grow"><div class="t2">Party</div><div class="t1" style="font-size:17px">${order.customer ? esc(order.customer.customer_name) : 'Choose a party'}</div></div>${ic('chev', 18)}</div></section>
    <section class="sec"><h2>Items<button class="link" id="ai">+ Add item</button></h2>${order.items.map((i, n) => `<div class="row"><div class="grow"><div class="t1">${esc(i.item_name)}</div><div class="t2">${num(i.qty)} × ${inr(i.rate)}</div></div><b>${inr0(i.qty * i.rate)}</b><button class="ib" data-d="${n}" aria-label="Remove ${esc(i.item_name)}">${ic('x', 18)}</button></div>`).join('') || empty('No items yet', 'Tap Add item to start the order.')}
    ${order.items.length ? `<div class="ld sum"><span>Total before GST</span><i></i><b>${inr0(total)}</b></div><div style="height:8px"></div>` : ''}</section>
    <div class="acts"><button class="btn out" id="sv" ${order.customer && order.items.length ? '' : 'disabled'}>Save draft</button><button class="btn" id="sw" ${order.customer && order.items.length ? '' : 'disabled'}>${ic('chat', 20)}Save and share</button></div>
    <div class="pad t2">Saved as a draft Sales Order. Schemes, free goods and the overdue check apply when you make the bill in ERPNext.</div>`;
    $('#pc').onclick = () => partyPicker((c, _, n) => { order.customer = { name: c, customer_name: n }; draw(); });
    $('#ai').onclick = () => itemPicker(draw);
    $$('[data-d]').forEach(b => b.onclick = () => { order.items.splice(b.dataset.d, 1); draw(); });
    const save = async share => {
      $('#sv').disabled = $('#sw').disabled = true;
      try {
        const d = today(), r = await api('/api/resource/Sales Order', { method: 'POST', body: { customer: order.customer.name, company: S.company, transaction_date: d, delivery_date: d, items: order.items.filter(i => i.qty > 0).map(i => ({ item_code: i.item_code, qty: i.qty, rate: i.rate, delivery_date: d })) } });
        const text = `Order for ${order.customer.customer_name}\n` + order.items.map(i => `${num(i.qty)} × ${i.item_name} @ ${inr(i.rate)}`).join('\n') + `\n\nTotal ${inr(total)} + GST\n${S.company}`;
        const ph = share ? (await list('Customer', { fields: ['mobile_no'], filters: [['name', '=', order.customer.name]] }))[0] : null;
        order = { customer: null, items: [] }; toast(r.name + ' saved as draft', 3500); go('/so/' + encodeURIComponent(r.name));
        if (share) setTimeout(() => { location.href = waLink(ph && ph.mobile_no, text); }, 400);
      } catch (e) { toast(e.message, 6000); $('#sv').disabled = $('#sw').disabled = false; }
    };
    $('#sv').onclick = () => save(false); $('#sw').onclick = () => save(true);
  };
  draw();
  if (order.pending) { const c = order.pending; delete order.pending; itemPicker(draw, c); }
}, { title: 'New order', skel: () => skeleton(2) });
function itemPicker(done, preset) {
  const pick = async (code, name) => {
    const it = (await list('Item', { fields: ['name', 'item_name', 'stock_uom'], filters: [['name', '=', code]] }))[0];
    const st = (await stockByItem([code]))[code];
    openSheet(it.item_name, `<div class="pad"><div class="t2">In stock ${num(st ? st.q : 0)} ${esc(it.stock_uom)}</div></div>
      <div class="pad" style="display:flex;gap:12px;align-items:center;justify-content:space-between"><span>Quantity</span>${stepper('qy', 1)}</div>
      <label class="field" style="margin-top:4px"><input id="rt" type="number" inputmode="decimal" placeholder="Rate" aria-label="Rate"></label><div class="pad t2" id="hint" style="padding-top:0">Looking up the rate…</div>
      <div class="acts"><button class="btn" id="ok">Add to order</button></div>`, async root => {
      wireSteppers(root);
      const [rd, last] = await Promise.all([method('erpnext.stock.get_item_details.get_item_details', { args: { item_code: code, customer: order.customer && order.customer.name, company: S.company, doctype: 'Sales Order', currency: 'INR', price_list: 'Standard Selling', selling_price_list: 'Standard Selling', qty: 1, transaction_date: today(), conversion_rate: 1, plc_conversion_rate: 1, ignore_pricing_rule: 0, transaction_type: 'selling' } }).catch(() => ({})), order.customer ? lastSoldRate(order.customer.name, code).catch(() => null) : null]);
      const rate = rd.rate || rd.price_list_rate || 0; $('#rt', root).value = rate || '';
      $('#hint', root).innerHTML = (rate ? `ERPNext rate ${inr(rate)}. ` : 'No rate set for this item. ') + (last ? `Last sold to this party at <b>${inr(last.rate)}</b> on ${fmtDate(last.date)}. <button class="link" id="ul">Use it</button>` : order.customer ? 'Not sold to this party before.' : 'Choose a party to see the last rate.');
      if ($('#ul', root)) $('#ul', root).onclick = () => { $('#rt', root).value = last.rate; };
      $('#ok', root).onclick = () => {
        const qty = parseFloat($('#qy', root).value) || 0; if (qty <= 0) return toast('Enter a quantity');
        const ex = order.items.find(i => i.item_code === code), r = parseFloat($('#rt', root).value) || 0;
        if (ex) { ex.qty += qty; ex.rate = r; } else order.items.push({ item_code: code, item_name: it.item_name, qty, rate: r });
        hideSheet(); history.back(); setTimeout(done, 60);
      };
    });
  };
  if (preset) return pick(preset);
  openSheet('Add item', `<label class="field s" style="margin-top:8px">${ic('search', 20)}<input id="is" placeholder="Search item or salt" autocomplete="off" aria-label="Search item"></label><div id="il"></div>`, root => {
    $('#is', root).focus();
    $('#is', root).oninput = debounce(async () => {
      const v = $('#is', root).value.trim(); if (v.length < 2) return;
      const it = await searchItems(v), st = it.length ? await stockByItem(it.map(i => i.name)) : {};
      $('#il', root).innerHTML = it.map(i => `<div class="row tap" data-i="${esc(i.name)}"><div class="grow"><div class="t1">${esc(i.item_name)}</div><div class="t2">${esc(i.salt_composition || '')}</div></div><div class="r"><b class="${st[i.name] && st[i.name].q > 0 ? '' : 'red'}">${num(st[i.name] ? st[i.name].q : 0)}</b></div></div>`).join('') || empty('No match', '');
      $$('#il .row', root).forEach(e => e.onclick = () => { hideSheet(); history.back(); setTimeout(() => pick(e.dataset.i), 80); });
    });
  });
}

/* ---------- More, reports and lists ---------- */
on(/^\/more$/, async () => {
  const low = (S.badge && S.badge.more) || 0;
  const row = (i, t, s, g, b) => `<div class="row tap" data-go="${g}" role="button"><span class="alert" style="padding:0;border:0"><span class="ico amber" style="background:var(--sunk);color:var(--ink)">${ic(i, 20)}</span></span><div class="grow"><div class="t1">${t}</div><div class="t2">${s}</div></div>${b ? `<span class="stamp n30">${b}</span>` : ''}${ic('chev', 18)}</div>`;
  view.innerHTML = `<section class="sec"><h2>Make an entry</h2>${row('receipt', 'New bill', 'Sale with batch, free goods and GST', '/bill/new')}${row('cart', 'Purchase bill', 'Stock in from a supplier', '/pur/new')}${row('rupee', 'Customer receipt', 'Money received, with e-receipt', '/receipt')}${row('truck', 'Supplier payment', 'Money paid out', '/pay')}${row('refresh', 'Sales return', 'Goods back from a customer', '/bill/return')}${row('refresh', 'Purchase return', 'Goods or expired stock back to a supplier', '/pur/return')}${row('layers', 'Stock adjustment', 'Add or remove stock', '/adjust')}</section>
  <section class="sec"><h2>Find and change</h2>${row('receipt', 'Sales bills', 'Search, edit, return, PDF, Excel, e-way bill', '/bills')}${row('cart', 'Purchase bills', 'Search, edit, return', '/purchases')}</section>
  <section class="sec"><h2>Create new</h2>${row('box', 'Item', 'With HSN, GST rate and salt', '/new/item')}${row('users', 'Customer', 'With address, GSTIN and licence', '/new/customer')}${row('truck', 'Supplier', 'With address and GSTIN', '/new/supplier')}${row('file', 'HSN code', '', '/new/hsn')}${row('pill', 'Salt', '', '/new/salt')}</section>
  <section class="sec"><h2>Reports</h2>${row('chart', 'All reports', 'Turnover, ledgers, books, GST, stock', '/rpt')}${row('chart', 'Sales and margin', 'By party, item, company and salesman', '/reports')}${row('rupee', 'Receivable aging', 'Who owes what, by how late', '/aging')}${row('truck', 'Payable to suppliers', 'What you owe', '/payables')}</section>
  <section class="sec"><h2>Stock</h2>${row('cart', 'Reorder suggestions', 'Fast movers running low', '/reorder', low || '')}${row('clock', 'Expiry register', 'Expired and expiring batches', '/expiry/90')}${row('file', 'Schedule drug register', 'Schedule H, H1, X and narcotic sales', '/schedule')}</section>
  <section class="sec"><h2>App</h2>${row('grid', 'Shortcuts', 'Choose the buttons shown on Home', '/shortcuts')}${row('lock', 'Settings', 'Theme, PIN lock, sign out', '/settings')}</section>
  <div class="pad t2" style="text-align:center">${esc(S.company || '')}<br>Signed in as ${esc(S.user || '')}</div>`;
  $$('[data-go]').forEach(e => e.onclick = () => go(e.dataset.go));
}, { tab: 'more', title: 'More' });

on(/^\/settings$/, async () => {
  view.innerHTML = `<section class="sec"><h2>Theme</h2><div class="seg" style="margin:8px 16px 16px">${[['auto', 'Match phone'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button data-th="${k}" class="${(S.theme || 'auto') === k ? 'on' : ''}">${l}</button>`).join('')}</div></section>
  <section class="sec"><h2>PIN lock</h2><div class="pad t2" style="padding-top:0">Ask for a 4-digit PIN when you return to the app.</div><div class="acts">${S.pin ? '<button class="btn out" id="pr">Remove PIN</button>' : '<button class="btn" id="ps">Set a PIN</button>'}</div></section>
  <section class="sec"><h2>Account</h2><div class="row"><div class="grow"><div class="t1">${esc(S.user || '')}</div><div class="t2">${esc(S.url || '')}</div></div></div><div class="acts"><button class="btn out" id="lo">${ic('out', 20)}Sign out</button></div></section>`;
  $$('[data-th]').forEach(b => b.onclick = () => { S.theme = b.dataset.th; save(); applyTheme(); route(); });
  if ($('#ps')) $('#ps').onclick = () => openSheet('Set a PIN', `<label class="field" style="margin-top:8px"><input id="pn" type="password" inputmode="numeric" maxlength="4" placeholder="4 digits" aria-label="PIN"></label><div class="acts"><button class="btn" id="pk">Save PIN</button></div>`, root => { $('#pk', root).onclick = async () => { const v = $('#pn', root).value; if (!/^\d{4}$/.test(v)) return toast('Use exactly 4 digits'); S.pin = await sha(v); save(); hideSheet(); history.back(); setTimeout(route, 60); toast('PIN set'); }; });
  if ($('#pr')) $('#pr').onclick = () => { S.pin = ''; save(); route(); };
  $('#lo').onclick = () => logout();
}, { title: 'Settings' });

on(/^\/aging$/, async () => {
  const all = ageParties(await receivables()), bt = [0, 1, 2, 3, 4].map(i => all.reduce((a, p) => a + p.b[i], 0)), tot = bt.reduce((a, v) => a + v, 0);
  const od = all.filter(p => p.overdue > 0).sort((a, b) => b.overdue - a.overdue);
  view.innerHTML = `<section class="sec"><div class="pad"><div class="t2">Total to collect</div><div class="big">${inr0(tot)}</div></div>${BUCKETS.map(([l], i) => `<div class="row"><span class="stripe" style="background:${['#9AA7BA', 'var(--saffron)', '#E0731A', 'var(--red)', '#7A130E'][i]}"></span><div class="grow">${l}</div><b>${inr0(bt[i])}</b><span class="t2" style="width:44px;text-align:right">${tot ? Math.round(bt[i] / tot * 100) : 0}%</span></div>`).join('')}</section>
  <section class="sec"><h2>Chase these first</h2>${od.slice(0, 40).map(p => partyRow(p)).join('') || empty('Nothing overdue', 'Every party is within terms.')}</section>
  <div class="acts"><a class="btn out" id="wa" href="#">${ic('share', 20)}Share overdue list</a></div>`;
  $$('.row[data-c]').forEach(e => e.onclick = () => go('/p/' + encodeURIComponent(e.dataset.c)));
  $('#wa').href = waLink('', `Overdue on ${fmtDate(today())}\n` + od.slice(0, 25).map(p => `${p.name}  ${inr0(p.overdue)}`).join('\n') + `\n\nTotal overdue ${inr0(od.reduce((a, p) => a + p.overdue, 0))}`);
}, { title: 'Receivable aging' });

on(/^\/payables$/, async () => {
  const r = await list('Purchase Invoice', { fields: ['supplier', 'supplier_name', 'sum(outstanding_amount) as v', 'min(due_date) as oldest', 'count(name) as n'], filters: [['docstatus', '=', 1], ['outstanding_amount', '>', 0]], group_by: 'supplier', order_by: 'v desc', limit_page_length: 100 });
  const tot = r.reduce((a, x) => a + x.v, 0), t = today();
  view.innerHTML = `<section class="sec"><div class="pad"><div class="t2">You owe suppliers</div><div class="big">${inr0(tot)}</div></div>${r.map(x => `<div class="row"><span class="stripe ${x.oldest < addDays(t, -60) ? 's2' : x.oldest < t ? 's1' : ''}"></span><div class="grow"><div class="t1">${esc(x.supplier_name || x.supplier)}</div><div class="t2">${x.n} bill${x.n > 1 ? 's' : ''}, oldest due ${fmtDate(x.oldest)}</div></div><b>${inr0(x.v)}</b></div>`).join('') || empty('Nothing to pay', 'No unpaid supplier bills.')}</section>`;
}, { title: 'Payable to suppliers' });

on(/^\/reorder$/, async () => {
  const r = await reorderList();
  view.innerHTML = r.length ? `<div class="pad t2" style="padding-top:0">Items sold in the last 30 days with under 15 days of stock left. The suggested quantity covers the next 30 days.</div><section class="sec">${r.map(i => `<div class="row tap" data-i="${esc(i.code)}"><div class="grow"><div class="t1">${esc(i.name)}</div><div class="t2">Sold ${num(i.sold)} in 30 days. Stock ${num(i.stock)}, about ${Math.floor(i.cover)} days.</div></div><div class="r"><b>${num(i.need)}</b><div class="t2">to order</div></div></div>`).join('')}</section><div class="acts"><a class="btn out" id="wa" href="#">${ic('share', 20)}Share list</a></div>` : empty('Stock looks healthy', 'No fast-moving item is running low.');
  $$('[data-i]').forEach(e => e.onclick = () => go('/item/' + encodeURIComponent(e.dataset.i)));
  if ($('#wa')) $('#wa').href = waLink('', `Reorder list ${fmtDate(today())}\n` + r.slice(0, 40).map(i => `${i.name}: ${num(i.need)}`).join('\n'));
}, { title: 'Reorder suggestions' });

let expDays = 90;
on(/^\/expiry\/(\d+)$/, async d => {
  expDays = +d;
  view.innerHTML = `<div class="chips" id="modes">${[[0, 'Expired'], [30, '30 days'], [60, '60 days'], [90, '90 days'], [180, '180 days']].map(([k, l]) => `<button class="chip ${expDays === k ? 'on' : ''}" data-d="${k}">${l}</button>`).join('')}</div>
  <label class="field s">${ic('search', 20)}<input id="f" placeholder="Filter by item or batch" aria-label="Filter"></label><div id="res">${skeleton(5)}</div>`;
  $$('#modes .chip').forEach(b => b.onclick = () => go('/expiry/' + b.dataset.d));
  const rows = await expiryRows(expDays);
  const draw = () => {
    const f = $('#f').value.trim().toLowerCase(), r = rows.filter(x => !f || (x.item + ' ' + x.batch).toLowerCase().includes(f)), tot = r.reduce((a, x) => a + (x.cost_value || 0), 0);
    $('#res').innerHTML = r.length ? `<div class="pad" style="padding-top:0"><span class="t2">${r.length} batches at cost</span> <b>${inr0(tot)}</b></div><section class="sec">${r.slice(0, 200).map(x => `<div class="row"><div class="grow"><div class="t1">${esc(x.item)}</div><div class="t2">${esc(x.batch)} · MRP ${inr(x.mrp)} · cost ${inr0(x.cost_value)}</div></div>${stamp(x.expiry)}<b class="nw" style="min-width:40px;text-align:right">${num(x.qty)}</b></div>`).join('')}</section><div class="acts"><a class="btn out" id="wa" href="#">${ic('share', 20)}Share for supplier return</a></div>` : empty('Nothing here', expDays ? `No batch expires within ${expDays} days.` : 'No expired stock.');
    if ($('#wa')) $('#wa').href = waLink('', (expDays ? `Expiring within ${expDays} days` : 'Expired stock') + ` as on ${fmtDate(today())}\n` + r.slice(0, 40).map(x => `${x.item} | ${x.batch} | ${x.expiry} | ${num(x.qty)}`).join('\n'));
  };
  $('#f').oninput = debounce(draw, 200); draw();
}, { title: 'Expiry register' });

on(/^\/schedule$/, async () => {
  const t = today(), m = t.slice(0, 8) + '01';
  view.innerHTML = `<div class="pad" style="display:flex;gap:10px;padding-top:0"><input class="in" id="a" type="date" value="${m}" aria-label="From date"><input class="in" id="b" type="date" value="${t}" aria-label="To date"></div>
  <div class="chips" id="modes">${[['', 'All'], ['H', 'H'], ['H1', 'H1'], ['X', 'X'], ['Narcotic', 'Narcotic']].map(([k, l], i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-s="${k}">${l}</button>`).join('')}</div><div id="res"></div>`;
  let sch = '';
  const run = async () => {
    $('#res').innerHTML = skeleton(4);
    try {
      const r = await api('/api/method/frappe.desk.query_report.run?' + q({ report_name: 'Schedule Drug Sales Register', filters: { from_date: $('#a').value, to_date: $('#b').value, schedule: sch } }));
      const cols = r.columns || [], rows = r.result || [];
      $('#res').innerHTML = rows.length ? `<section class="sec">${rows.slice(0, 200).map(x => { const g = c => x[c.fieldname]; return `<div class="row"><div class="grow"><div class="t1">${esc(g(cols[3]) || g(cols[1]) || '')}</div><div class="t2">${esc(cols.slice(0, 8).filter((c, i) => i !== 3).map(g).filter(v => v !== undefined && v !== null && v !== '').join(' · '))}</div></div></div>`; }).join('')}</section>` : empty('No schedule drug sales', 'Nothing sold in this period.');
    } catch (e) { $('#res').innerHTML = errBox(e); }
  };
  $('#a').onchange = $('#b').onchange = run;
  $$('#modes .chip').forEach(b => b.onclick = () => { sch = b.dataset.s; $$('#modes .chip').forEach(x => x.classList.toggle('on', x === b)); run(); });
  run();
}, { title: 'Schedule drug register' });

let repRange = 'month', repBy = 'party';
on(/^\/reports$/, async () => {
  const t = today(), d = new Date(t + 'T00:00:00');
  const rng = { today: [t, t], week: [addDays(t, -6), t], month: [t.slice(0, 8) + '01', t], last: [iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), iso(new Date(d.getFullYear(), d.getMonth(), 0))] }[repRange];
  view.innerHTML = `<div class="chips" id="rg">${[['today', 'Today'], ['week', '7 days'], ['month', 'This month'], ['last', 'Last month']].map(([k, l]) => `<button class="chip ${repRange === k ? 'on' : ''}" data-r="${k}">${l}</button>`).join('')}</div><div id="out">${skeleton(5)}</div>`;
  $$('#rg .chip').forEach(b => b.onclick = () => { repRange = b.dataset.r; route(); });
  const inv = await memo('rep' + rng, () => invoicesBetween(rng[0], rng[1]), 300000);
  if (!inv.length) { $('#out').innerHTML = empty('No sales in this period', 'Bills you make will be summed up here.'); return; }
  const lines = await memo('lines' + rng, () => invoiceLines(inv.map(i => i.name)), 300000);
  const invBy = Object.fromEntries(inv.map(i => [i.name, i]));
  const sales = inv.reduce((a, i) => a + i.base_net_total, 0);
  let cost = 0, costed = 0; lines.forEach(l => { if (l.incoming_rate > 0) { cost += (l.stock_qty || l.qty) * l.incoming_rate; costed += l.base_net_amount; } });
  const mgn = costed ? (costed - cost) / costed * 100 : null;
  const days = {}; inv.forEach(i => days[i.posting_date] = (days[i.posting_date] || 0) + i.base_net_total);
  const dk = Object.keys(days).sort(), mx = Math.max(...Object.values(days));
  const draw = async () => {
    const g = {}, add = (k, n, amt, c) => { const o = g[k] || (g[k] = { name: n, amt: 0, cost: 0, costed: 0 }); o.amt += amt; if (c > 0) { o.cost += c.cost; o.costed += amt; } };
    let meta = {};
    if (repBy === 'company') { const codes = [...new Set(lines.map(l => l.item_code))]; for (const c of chunk(codes, 100)) (await list('Item', { fields: ['name', 'manufacturer_company'], filters: [['name', 'in', c]], limit_page_length: 200 })).forEach(i => meta[i.name] = i.manufacturer_company || 'Not set'); }
    if (repBy === 'salesman') { const cs = [...new Set(inv.map(i => i.customer))]; for (const c of chunk(cs, 100)) (await list('Customer', { fields: ['name', 'salesman'], filters: [['name', 'in', c]], limit_page_length: 200 })).forEach(i => meta[i.name] = i.salesman || 'Not set'); }
    if (repBy === 'party') inv.forEach(i => { const o = g[i.customer] || (g[i.customer] = { name: i.customer_name, amt: 0, cost: 0, costed: 0 }); o.amt += i.base_net_total; });
    else lines.forEach(l => {
      const k = repBy === 'item' ? l.item_code : repBy === 'company' ? meta[l.item_code] : meta[invBy[l.parent].customer], n = repBy === 'item' ? l.item_name : k;
      const o = g[k] || (g[k] = { name: n, amt: 0, cost: 0, costed: 0 }); o.amt += l.base_net_amount; if (l.incoming_rate > 0) { o.cost += (l.stock_qty || l.qty) * l.incoming_rate; o.costed += l.base_net_amount; }
    });
    const rows = Object.values(g).sort((a, b) => b.amt - a.amt).slice(0, 30), top = rows[0] ? rows[0].amt : 1;
    $('#lst').innerHTML = rows.map(r => `<div class="row" style="display:block"><div class="row" style="padding:0;border:0;min-height:0"><div class="grow t1">${esc(r.name)}</div><b>${inr0(r.amt)}</b></div><div class="hbar"><i style="width:${r.amt / top * 100}%"></i></div>${r.costed ? `<div class="t2" style="margin-top:4px">Margin ${((r.costed - r.cost) / r.costed * 100).toFixed(1)}%</div>` : ''}</div>`).join('');
  };
  $('#out').innerHTML = `<section class="sec"><div class="ld" style="padding-top:12px"><span>Sales before GST</span><i></i><b>${inr0(sales)}</b></div><div class="ld"><span>Bills</span><i></i><b>${inv.length}</b></div><div class="ld"><span>Average bill</span><i></i><b>${inr0(sales / inv.length)}</b></div><div class="ld" style="padding-bottom:12px"><span>Gross margin</span><i></i><b class="${mgn !== null && mgn < 8 ? 'amber' : 'green'}">${mgn === null ? 'n/a' : mgn.toFixed(1) + '%'}</b></div></section>
  ${dk.length > 1 ? `<section class="sec"><h2>Day by day</h2><div class="bars">${dk.map(k => `<i class="${k === t ? 't' : ''}" style="height:${Math.max(3, days[k] / mx * 100)}%"></i>`).join('')}</div><div class="axis"><span>${fmtDate(dk[0])}</span><span>${fmtDate(dk[dk.length - 1])}</span></div></section>` : ''}
  <div class="seg" id="by">${[['party', 'Parties'], ['item', 'Items'], ['company', 'Companies'], ['salesman', 'Salesmen']].map(([k, l]) => `<button data-b="${k}" class="${repBy === k ? 'on' : ''}">${l}</button>`).join('')}</div><section class="sec" id="lst"></section>`;
  $$('#by button').forEach(b => b.onclick = () => { repBy = b.dataset.b; $$('#by button').forEach(x => x.classList.toggle('on', x === b)); $('#lst').innerHTML = skeleton(4); draw(); });
  await draw();
}, { title: 'Sales and margin' });

/* ---------- start ---------- */
(async () => {
  applyTheme();
  if (S.pin) showLock();
  if (!S.url || !S.me) return loginView();
  try { await boot(); } catch (e) { loginView(e.auth ? 'Sign in again to continue.' : e.message); }
})();
